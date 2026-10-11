import type {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';

// Amazon's Vega build of Shaka Player and its polyfills live in the
// gitignored src/vendor/shaka/ (scripts/setup-shaka.sh). This is the only
// file that imports them; Jest maps them to test/__mocks__/. Shaka's build
// itself loads in install(), after the polyfills.
import type ShakaModule from '../vendor/shaka/dist/shaka-player.compiled';
import DocumentPolyfill from '../vendor/shaka/polyfills/DocumentPolyfill';
import ElementPolyfill from '../vendor/shaka/polyfills/ElementPolyfill';
import TextDecoderPolyfill from '../vendor/shaka/polyfills/TextDecoderPolyfill';
import W3CMediaPolyfill from '../vendor/shaka/polyfills/W3CMediaPolyfill';
import MiscPolyfill from '../vendor/shaka/polyfills/MiscPolyfill';

import {DEFAULT_MAX_BITRATE} from './deviceProfile';

/**
 * Shaka's HLS sequence mode (append segments in order, ignoring their
 * timestamps). Off, as Amazon's wrapper sets it for non-TS content; the Vega
 * docs suggest turning it on if TS streams stall. Decided on the TV.
 */
export const HLS_SEQUENCE_MODE = false;

/**
 * `shaka.util.Error.Category` and `Severity` values, copied because Shaka's
 * build only loads with the first session.
 */
const Category = {NETWORK: 1, MEDIA: 3, MANIFEST: 4, STREAMING: 5} as const;
const Severity = {CRITICAL: 2} as const;

/** Readable messages for Shaka error categories. */
export const SHAKA_ERROR_MESSAGES: Partial<Record<number, string>> = {
  [Category.NETWORK]:
    'A network error stopped playback. Check the connection to the server.',
  [Category.MANIFEST]: "The server's stream couldn't be read.",
  [Category.MEDIA]: "This video couldn't be decoded.",
  [Category.STREAMING]: "This video couldn't be streamed.",
};
export const UNKNOWN_SHAKA_ERROR = 'Video playback error.';

type ShakaErrorLike = {category?: number; code?: number; severity?: number};

/** A readable message for a `shaka.util.Error` (or anything else thrown). */
export function shakaErrorMessage(error: unknown): string {
  const category = (error as ShakaErrorLike | null)?.category;
  return (
    (category !== undefined && SHAKA_ERROR_MESSAGES[category]) ||
    UNKNOWN_SHAKA_ERROR
  );
}

const log = (what: string, reason: unknown) => {
  if (__DEV__) {
    const {category, code, severity} = (reason ?? {}) as ShakaErrorLike;
    console.warn(
      `Shaka ${what}`,
      category !== undefined ? {category, code, severity} : reason,
    );
  }
};

/** Where Amazon's document polyfill finds the media element. */
const vegaGlobal = global as unknown as {gmedia?: unknown};

let shaka: typeof ShakaModule | undefined;

/**
 * One-time setup, the same steps as Amazon's Vega wrapper: their polyfills
 * (MiscPolyfill too: Shaka 4.16 crashes without it), Shaka's own polyfills,
 * Shaka's fetch plugin re-registered for http/https at application
 * priority, and no in-band closed-caption parsing (we don't show CEA-608).
 *
 * Shaka's build is required only after Amazon's polyfills: it reads
 * `navigator.userAgent` (MiscPolyfill sets it) as it loads, and an error
 * thrown while a module loads aborts the app on Vega.
 */
function install(): typeof ShakaModule {
  if (shaka) {
    return shaka;
  }
  DocumentPolyfill.install();
  ElementPolyfill.install();
  TextDecoderPolyfill.install();
  W3CMediaPolyfill.install();
  MiscPolyfill.install();
  // The build is CommonJS without `__esModule`: its exports are the
  // namespace, as the default import used to read them.
  const loaded = require('../vendor/shaka/dist/shaka-player.compiled');
  shaka = (loaded.__esModule ? loaded.default : loaded) as typeof ShakaModule;
  shaka.polyfill.installAll();

  const {NetworkingEngine, HttpFetchPlugin} = shaka.net;
  for (const scheme of ['http', 'https']) {
    NetworkingEngine.unregisterScheme(scheme);
    NetworkingEngine.registerScheme(
      scheme,
      HttpFetchPlugin.parse,
      NetworkingEngine.PluginPriority.APPLICATION,
      true,
    );
  }
  shaka.media.ClosedCaptionParser.unregisterParser('video/mp4');
  shaka.media.ClosedCaptionParser.unregisterParser('video/mp2t');
  return shaka;
}

export type ShakaSessionOptions = {
  /** ABR cap in bits per second; defaults to {@link DEFAULT_MAX_BITRATE}. */
  maxBandwidth?: number;
  /** A fatal Shaka `error` event, as a readable message. */
  onError?(message: string): void;
};

export type ShakaSession = {
  /** Attaches to the player and loads the HLS playlist at `startSeconds`. */
  load(url: string, startSeconds: number): Promise<void>;
  /** Unloads, then destroys Shaka. Never rejects; safe to call again. */
  destroy(): Promise<void>;
};

/**
 * Shaka Player in MSE mode on an initialized Vega `VideoPlayer`. The caller
 * owns the `VideoPlayer` (surface, play, deinitialize).
 */
export function createShakaSession(
  media: VideoPlayer,
  {maxBandwidth = DEFAULT_MAX_BITRATE, onError}: ShakaSessionOptions = {},
): ShakaSession {
  // Amazon's document polyfill answers `createElement('video')` with this.
  vegaGlobal.gmedia = media;
  const shakaLib = install();

  const player = new shakaLib.Player();
  let destroying: Promise<void> | undefined;

  player.addEventListener('error', (event: Event) => {
    const error = (event as Event & {detail?: ShakaErrorLike}).detail;
    log('error', error);
    if (!destroying && error?.severity === Severity.CRITICAL) {
      onError?.(shakaErrorMessage(error));
    }
  });

  player.configure({
    abr: {
      enabled: true,
      restrictions: {maxBandwidth},
    },
    manifest: {
      hls: {
        sequenceMode: HLS_SEQUENCE_MODE,
        // Off as in Amazon's wrapper: we don't use CEA-608/708 captions.
        disableClosedCaptionsDetection: true,
      },
    },
    streaming: {
      // Amazon's wrapper values for Vega.
      bufferingGoal: 10,
      bufferBehind: 10,
      rebufferingGoal: 0.01,
      retryParameters: {maxAttempts: 3},
      // Subtitle renditions in Jellyfin's playlist mustn't stop the video.
      ignoreTextStreamFailures: true,
    },
  });

  return {
    async load(url, startSeconds) {
      await player.attach(
        media as unknown as Parameters<typeof player.attach>[0],
      );
      if (destroying) {
        return;
      }
      await player.load(url, startSeconds);
    },

    destroy() {
      if (!destroying) {
        destroying = (async () => {
          try {
            await player.unload();
          } catch (reason) {
            log('unload failed', reason);
          }
          try {
            await player.destroy();
          } catch (reason) {
            log('destroy failed', reason);
          }
          if (vegaGlobal.gmedia === media) {
            vegaGlobal.gmedia = null;
          }
        })();
      }
      return destroying;
    },
  };
}

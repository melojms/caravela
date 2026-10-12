import type {Api} from '@jellyfin/sdk';
import {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';

import {createPlaybackReporter, type PlaybackReporter} from './reporting';
import {
  createShakaSession,
  shakaErrorMessage,
  type ShakaSession,
} from './shaka';
import type {PlaybackSession, PlaybackSnapshot} from './types';

/** What the player is doing, as the screen shows it. */
export type PlayerState = 'loading' | 'playing' | 'paused' | 'ended';

export type PlayerListeners = {
  onStateChange?(state: PlayerState): void;
  /** Position and duration in ms, on every `timeupdate` and seek. */
  onPositionChange?(positionMs: number, durationMs: number): void;
  /** A fatal error: playback stopped and was reported as stopped. */
  onError?(message: string): void;
};

export type PlayerOptions = {
  /**
   * The rate to start at (1 = normal). The screen passes the speed it keeps
   * for the app's lifetime, so a Retry or a track switch keeps it.
   */
  playbackRate?: number;
};

/** W3C `MediaError` codes. */
const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

export const PLAYER_ERROR_MESSAGES: Record<number, string> = {
  [MEDIA_ERR_ABORTED]: 'Playback was stopped before the video loaded.',
  [MEDIA_ERR_NETWORK]:
    'A network error stopped playback. Check the connection to the server.',
  [MEDIA_ERR_DECODE]: "This video couldn't be decoded.",
  [MEDIA_ERR_SRC_NOT_SUPPORTED]: "This video format isn't supported.",
};
/** androidtv's `video_error_unknown_error` fallback. */
export const UNKNOWN_PLAYER_ERROR = 'Video playback error.';
export const INIT_ERROR_MESSAGE = "The video player couldn't start.";
export const START_TIMEOUT_MESSAGE =
  "The video didn't start. This device may not support its format.";

/**
 * How long a start may go without progress before it counts as failed. Vega
 * sends no `error` when its audio parser rejects a stream (7.1 AAC in TS):
 * the pipeline stops and no event follows. On the TV a start plays within
 * ~5 s (a burned-in subtitle transcode too), with at most ~2.5 s between
 * events; any progress event restarts the wait.
 */
export const START_TIMEOUT_MS = 30000;

export const STALL_TIMEOUT_MESSAGE =
  'Playback stopped. Check the connection to the server.';
/**
 * The same rule after the first `playing`: a stall (waiting, seeking, or a
 * play that doesn't resume) that goes this long without progress fails.
 */
export const STALL_TIMEOUT_MS = START_TIMEOUT_MS;

/**
 * A seek to or past the end lands this far before it (androidtv's
 * `Utils.getSafeSeekPosition`), so it plays out instead of overshooting.
 */
export const SEEK_END_MARGIN_MS = 1000;

const isRate = (rate: number | undefined): rate is number =>
  rate !== undefined && Number.isFinite(rate) && rate > 0;

/** A readable message for a `MediaError` (or nothing the player set). */
export function mediaErrorMessage(error?: {code?: number} | null): string {
  return (
    (error?.code && PLAYER_ERROR_MESSAGES[error.code]) || UNKNOWN_PLAYER_ERROR
  );
}

const warn = (what: string, reason: unknown) => {
  if (__DEV__) {
    console.warn(`Player ${what} failed`, reason);
  }
};

/** Runs a player call that may throw or return a rejecting promise. */
const attempt = (what: string, call: () => unknown) => {
  try {
    const result = call();
    if (result instanceof Promise) {
      result.catch((reason) => warn(what, reason));
    }
  } catch (reason) {
    warn(what, reason);
  }
};

const MEDIA_EVENTS = [
  'loadedmetadata',
  'durationchange',
  'play',
  'playing',
  'pause',
  'waiting',
  'seeking',
  'seeked',
  'timeupdate',
  'progress',
  'canplay',
  'loadeddata',
  'ended',
  'error',
] as const;
type MediaEvent = (typeof MEDIA_EVENTS)[number];

/**
 * One play session on a Vega `VideoPlayer`, after androidtv's
 * `PlaybackController` (state, initial seek, report loop). No React here: the
 * screen forwards the surface callbacks and remote keys.
 *
 * URL mode (react_native_for_vega_media_player_architecture.md and
 * vega-video-sample): `new VideoPlayer()` → `await initialize()` → listeners →
 * `setSurfaceHandle` (a surface that arrives first is cached) → `src`.
 *
 * HLS mode (media-player-shaka-player.html sample): `await initialize()` →
 * listeners → `autoplay = false` → Shaka `load(url, start)` → the surface;
 * `play()` once the load resolved and the surface is set. Shaka's start time
 * replaces the resume seek.
 *
 * A watchdog turns a start that stops making progress, or a stall after
 * it (waiting / seeking / a play that doesn't resume), into the error state
 * (Retry makes a new controller). A pause suspends it; play re-arms it.
 *
 * The playback rate is set as both `defaultPlaybackRate` and `playbackRate`:
 * Vega's `load()` (setting `src`, or Shaka attaching its MediaSource) resets
 * the rate to the default. In HLS mode Shaka's own rate controller gets it
 * too once loaded, since it pauses buffering with rate 0 and restores its own.
 *
 * `destroy()` destroys Shaka first (HLS), then pauses, clears the surface,
 * `deinitialize()`s and removes the listeners; a surface destroyed after
 * that is ignored.
 */
export class PlayerController {
  private readonly player = new VideoPlayer();
  private readonly reporter: PlaybackReporter;
  private readonly handlers: Record<MediaEvent, () => void>;

  private initialized = false;
  private destroyed = false;
  private destroying?: Promise<void>;
  private surface?: string;
  private surfaceSet = false;
  private loaded = false;
  private shaka?: ShakaSession;
  /** HLS: `play()` was called once the load and the surface were both done. */
  private hlsStarted = false;
  /**
   * URL-mode resume: seek on `loadedmetadata`, play on the `seeked` that
   * follows. HLS mode starts Shaka at the position instead.
   */
  private initialSeek: 'pending' | 'seeking' | 'done';
  private started = false;
  /** The first `playing` came: the watchdog now only watches stalls. */
  private hasPlayed = false;
  /**
   * Fails playback if nothing moves for {@link START_TIMEOUT_MS} (before the
   * first `playing`) or {@link STALL_TIMEOUT_MS} (a stall after it).
   */
  private watchdog?: ReturnType<typeof setTimeout>;
  /** A `pause` came and no `play` since: the watchdog waits. */
  private suspended = false;
  private hasMetadata = false;
  /** Where the last seek goes until its `seeked`; relative seeks add to it. */
  private pendingSeekMs?: number;
  private rate: number;
  private lastTimeupdate?: number;
  private state: PlayerState = 'loading';
  private failed = false;
  /** The subtitle showing now (-1 = off); the screen draws external ones. */
  private subtitleIndex?: number;

  /** Resolves once `initialize()` settled (and listeners are on). For tests. */
  readonly ready: Promise<void>;

  constructor(
    api: Api,
    private readonly session: PlaybackSession,
    private readonly listeners: PlayerListeners = {},
    options: PlayerOptions = {},
  ) {
    this.rate = isRate(options.playbackRate) ? options.playbackRate : 1;
    this.initialSeek =
      session.mode === 'url' && session.startMs > 0 ? 'pending' : 'done';
    this.subtitleIndex = session.subtitleStreamIndex;
    this.reporter = createPlaybackReporter(api, session, () => this.snapshot());
    this.handlers = {
      loadedmetadata: this.onLoadedMetadata,
      durationchange: this.emitPosition,
      play: this.onPlay,
      playing: this.onPlaying,
      pause: this.onPause,
      waiting: this.onWaiting,
      seeking: this.onWaiting,
      seeked: this.onSeeked,
      timeupdate: this.onTimeupdate,
      progress: this.onProgress,
      canplay: this.onProgress,
      loadeddata: this.onProgress,
      ended: this.onEnded,
      error: this.onError,
    };
    this.ready = this.initialize();
  }

  get positionMs(): number {
    const seconds = this.read(() => this.player.currentTime);
    return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 0;
  }

  /** The player's duration, or the server's until the metadata loads. */
  get durationMs(): number {
    const seconds = this.read(() => this.player.duration);
    return Number.isFinite(seconds) && seconds > 0
      ? seconds * 1000
      : this.session.durationMs ?? 0;
  }

  get paused(): boolean {
    return this.read(() => this.player.paused) ?? true;
  }

  get playerState(): PlayerState {
    return this.state;
  }

  /** The rate asked for (1 = normal), whatever Shaka does while buffering. */
  get playbackRate(): number {
    return this.rate;
  }

  /**
   * The overlay can seek: the media loaded (and a resume seek finished), the
   * duration is known, and playback hasn't failed or been destroyed.
   */
  get canSeek(): boolean {
    return (
      this.canControl() &&
      this.hasMetadata &&
      this.initialSeek === 'done' &&
      this.durationMs > 0
    );
  }

  /** From `KeplerVideoSurfaceView.onSurfaceViewCreated`. */
  attachSurface(handle: string) {
    if (this.destroyed) {
      return;
    }
    this.surface = handle;
    this.surfaceSet = false;
    this.setSurface();
  }

  /** From `onSurfaceViewDestroyed`. Ignored after `destroy()`. */
  detachSurface(handle: string) {
    if (this.destroyed || this.surface !== handle) {
      return;
    }
    if (this.surfaceSet) {
      attempt('clearSurfaceHandle', () =>
        this.player.clearSurfaceHandle(handle),
      );
    }
    this.surface = undefined;
    this.surfaceSet = false;
  }

  togglePause() {
    if (this.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  play() {
    if (this.canControl()) {
      attempt('play', () => this.player.play());
    }
  }

  pause() {
    if (this.canControl()) {
      attempt('pause', () => this.player.pause());
    }
  }

  /** Seeks to `ms`, kept within `0..durationMs - SEEK_END_MARGIN_MS`. */
  seekTo(ms: number) {
    if (!this.canControl() || !Number.isFinite(ms)) {
      return;
    }
    const target = this.clampSeek(ms);
    this.pendingSeekMs = target;
    attempt('seek', () => {
      this.player.currentTime = target / 1000;
    });
  }

  /**
   * Seeks `deltaMs` from the position, or from where a seek still in flight
   * goes (androidtv adds repeated skips up the same way). Needs `canSeek`.
   */
  seekBy(deltaMs: number) {
    if (!this.canSeek || !Number.isFinite(deltaMs)) {
      return;
    }
    this.seekTo((this.pendingSeekMs ?? this.positionMs) + deltaMs);
  }

  /** Sets the rate (e.g. 0.25–2). Ignored once destroyed or failed. */
  setPlaybackRate(rate: number) {
    if (!this.live() || !isRate(rate)) {
      return;
    }
    this.rate = rate;
    this.applyRate();
  }

  /**
   * A client-side subtitle switch (an external track, or -1 for off): the
   * reports send it from now on, starting with one right away, like a pause.
   */
  setSubtitleStreamIndex(index: number) {
    if (this.subtitleIndex === index) {
      return;
    }
    this.subtitleIndex = index;
    if (this.live()) {
      this.reporter.update();
    }
  }

  /**
   * Stops reporting and releases the player. Safe to call again; resolves
   * once `deinitialize()` is done (or failed).
   */
  destroy(): Promise<void> {
    if (this.destroying) {
      return this.destroying;
    }
    this.destroyed = true;
    this.clearWatchdog();
    // The reporter reads the position now, before the player goes away.
    const stopped = this.reporter.stop();
    this.destroying = (async () => {
      if (this.initialized) {
        await this.release();
      } else {
        // Still initializing: initialize() deinitializes once it resolves.
        await this.ready;
      }
      await stopped;
    })();
    return this.destroying;
  }

  private async initialize() {
    try {
      await this.player.initialize();
    } catch (reason) {
      warn('initialize', reason);
      if (!this.destroyed) {
        this.fail(INIT_ERROR_MESSAGE);
      }
      return;
    }
    if (this.destroyed) {
      // destroy() came while initializing.
      try {
        await this.player.deinitialize();
      } catch (reason) {
        warn('deinitialize', reason);
      }
      return;
    }
    this.initialized = true;
    for (const type of MEDIA_EVENTS) {
      this.player.addEventListener(type, this.handlers[type]);
    }
    this.applyRate();
    this.armWatchdog();
    if (this.session.mode === 'hls') {
      this.loadShaka();
    }
    this.setSurface();
  }

  /** HLS: loads the playlist through Shaka before the surface is set. */
  private loadShaka() {
    try {
      this.player.autoplay = false;
      this.shaka = createShakaSession(this.player, {
        maxBandwidth: this.session.maxStreamingBitrate,
        onError: (message) => {
          if (this.live()) {
            this.fail(message);
          }
        },
      });
    } catch (reason) {
      warn('Shaka setup', reason);
      this.fail(INIT_ERROR_MESSAGE);
      return;
    }
    this.shaka.load(this.session.url, this.session.startMs / 1000).then(
      () => {
        if (this.live()) {
          this.loaded = true;
          // Shaka read the rate during the load; a change since needs it.
          this.applyRate();
          this.startHls();
        }
      },
      (reason) => {
        warn('Shaka load', reason);
        if (this.live()) {
          this.fail(shakaErrorMessage(reason));
        }
      },
    );
  }

  /** HLS: plays once both the load resolved and the surface is set. */
  private startHls() {
    if (this.hlsStarted || !this.loaded || !this.surfaceSet || !this.live()) {
      return;
    }
    this.hlsStarted = true;
    attempt('play', () => this.player.play());
  }

  private setSurface() {
    if (!this.initialized || !this.surface || this.surfaceSet) {
      return;
    }
    const handle = this.surface;
    attempt('setSurfaceHandle', () => this.player.setSurfaceHandle(handle));
    this.surfaceSet = true;
    if (this.session.mode === 'hls') {
      this.startHls();
    } else {
      this.load();
    }
  }

  private load() {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    attempt('load', () => {
      // A resume seeks first and plays on `seeked`, so nothing plays from 0.
      this.player.autoplay = this.initialSeek === 'done';
      this.player.src = this.session.url;
    });
  }

  private async release() {
    // Shaka first (Vega sample: unload before deinitialize). Its destroy()
    // also interrupts a load that is still pending.
    await this.shaka?.destroy();
    attempt('pause', () => this.player.pause());
    if (this.surface && this.surfaceSet) {
      const handle = this.surface;
      attempt('clearSurfaceHandle', () =>
        this.player.clearSurfaceHandle(handle),
      );
    }
    this.surface = undefined;
    this.surfaceSet = false;
    try {
      await this.player.deinitialize();
    } catch (reason) {
      warn('deinitialize', reason);
    }
    for (const type of MEDIA_EVENTS) {
      attempt('removeEventListener', () =>
        this.player.removeEventListener(type, this.handlers[type]),
      );
    }
  }

  /**
   * Before Shaka loaded (and in URL mode) the element takes the rate; once
   * Shaka loaded, Shaka sets it, so its buffering pause isn't undone.
   */
  private applyRate() {
    if (!this.initialized || !this.live()) {
      return;
    }
    const rate = this.rate;
    const viaShaka = this.shaka !== undefined && this.loaded;
    attempt('playbackRate', () => {
      this.player.defaultPlaybackRate = rate;
      if (!viaShaka) {
        this.player.playbackRate = rate;
      }
    });
    if (viaShaka) {
      this.shaka?.setPlaybackRate(rate);
    }
  }

  private clampSeek(ms: number) {
    const duration = this.durationMs;
    const end =
      duration > 0 ? Math.max(0, duration - SEEK_END_MARGIN_MS) : Infinity;
    return Math.min(Math.max(0, ms), end);
  }

  private canControl() {
    return this.initialized && this.loaded && !this.destroyed && !this.failed;
  }

  private read<T>(get: () => T): T {
    try {
      return get();
    } catch {
      return undefined as T;
    }
  }

  private snapshot(): PlaybackSnapshot {
    return {
      positionMs: this.positionMs,
      isPaused: this.paused,
      audioStreamIndex: this.session.audioStreamIndex,
      subtitleStreamIndex: this.subtitleIndex,
    };
  }

  private live() {
    return !this.destroyed && !this.failed;
  }

  private setState(state: PlayerState) {
    if (this.state !== state) {
      this.state = state;
      this.listeners.onStateChange?.(state);
    }
  }

  /** (Re)starts the watchdog; nothing while paused, ended or done. */
  private armWatchdog() {
    this.clearWatchdog();
    if (!this.live() || this.suspended || this.state === 'ended') {
      return;
    }
    const [message, timeout] = this.hasPlayed
      ? [STALL_TIMEOUT_MESSAGE, STALL_TIMEOUT_MS]
      : [START_TIMEOUT_MESSAGE, START_TIMEOUT_MS];
    this.watchdog = setTimeout(() => {
      this.watchdog = undefined;
      if (this.live()) {
        this.fail(message);
      }
    }, timeout);
  }

  private clearWatchdog() {
    if (this.watchdog !== undefined) {
      clearTimeout(this.watchdog);
      this.watchdog = undefined;
    }
  }

  /** Data arrived or decoding moved: a running watchdog starts over. */
  private onProgress = () => {
    if (this.watchdog !== undefined) {
      this.armWatchdog();
    }
  };

  private onTimeupdate = () => {
    this.emitPosition();
    const time = this.read(() => this.player.currentTime);
    if (time === this.lastTimeupdate) {
      return;
    }
    this.lastTimeupdate = time;
    if (this.hasPlayed && this.state !== 'loading') {
      // Playing along (e.g. after a `seeked` with no `playing`).
      this.clearWatchdog();
    } else {
      this.onProgress();
    }
  };

  private emitPosition = () => {
    if (this.live()) {
      this.listeners.onPositionChange?.(this.positionMs, this.durationMs);
    }
  };

  private onLoadedMetadata = () => {
    if (!this.live()) {
      return;
    }
    this.hasMetadata = true;
    this.onProgress();
    this.emitPosition();
    // URL mode: in case the native load reset the rate after the JS side
    // restored it.
    if (
      this.session.mode === 'url' &&
      this.read(() => this.player.playbackRate) !== this.rate
    ) {
      this.applyRate();
    }
    if (this.initialSeek === 'pending') {
      this.initialSeek = 'seeking';
      attempt('initial seek', () => {
        this.player.currentTime = this.session.startMs / 1000;
      });
    }
  };

  private onPlay = () => {
    if (!this.live()) {
      return;
    }
    this.suspended = false;
    // A start already being watched keeps its timer; after a pause (or
    // once started) this waits for `playing`.
    if (this.watchdog === undefined) {
      this.armWatchdog();
    }
    this.reporter.update();
  };

  private onPlaying = () => {
    if (!this.live()) {
      return;
    }
    this.hasPlayed = true;
    this.suspended = false;
    this.clearWatchdog();
    this.setState('playing');
    if (!this.started && this.initialSeek === 'done') {
      this.started = true;
      this.reporter.start();
    }
  };

  private onPause = () => {
    if (!this.live() || this.state === 'ended') {
      return;
    }
    this.suspended = true;
    this.clearWatchdog();
    this.setState('paused');
    this.reporter.update();
  };

  private onWaiting = () => {
    if (!this.live() || this.state === 'ended') {
      return;
    }
    this.setState('loading');
    // A stall after the start; repeated events don't extend it.
    if (this.hasPlayed && this.watchdog === undefined) {
      this.armWatchdog();
    }
  };

  private onSeeked = () => {
    if (!this.live()) {
      return;
    }
    this.pendingSeekMs = undefined;
    this.emitPosition();
    if (this.initialSeek === 'seeking') {
      this.initialSeek = 'done';
      attempt('play', () => this.player.play());
      return;
    }
    // Shaka seeks to the start position before the first frame: the
    // spinner stays until `playing`.
    this.setState(
      this.paused ? 'paused' : this.hasPlayed ? 'playing' : 'loading',
    );
    this.reporter.update();
  };

  private onEnded = () => {
    if (!this.live()) {
      return;
    }
    this.clearWatchdog();
    this.setState('ended');
    this.reporter.stop();
  };

  private onError = () => {
    if (!this.live()) {
      return;
    }
    this.fail(mediaErrorMessage(this.read(() => this.player.error)));
  };

  private fail(message: string) {
    this.failed = true;
    this.clearWatchdog();
    this.reporter.stop();
    this.listeners.onError?.(message);
  }
}

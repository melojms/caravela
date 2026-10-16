import type {
  ICommandContext,
  IMediaMetadata,
  IMediaSessionId,
  ITimeValue,
  MediaSessionState,
  PlaybackStatus,
} from '@amazon-devices/kepler-media-controls';
import {KeplerMediaControlHandler} from '@amazon-devices/react-native-w3cmedia';

import {SEEK_BACK_STEP_MS, SEEK_FORWARD_STEP_MS} from '../components/SeekBar';

/** What Media Controls commands drive: the `PlayerController`. */
export type MediaControlsTarget = {
  play(): void;
  pause(): void;
  togglePause(): void;
  /** Absolute, in ms. */
  seekTo(ms: number): void;
  /** Relative to the position, in ms. */
  seekBy(deltaMs: number): void;
  /** The item's name, for Vega's metadata requests. */
  readonly title?: string;
  /** Paused by the viewer (not Alexa's hold), for the session state. */
  readonly paused: boolean;
};

/**
 * `PlaybackStatus.PAUSED`. The package's index loads a native module when
 * imported, which jest can't, so only its types are imported.
 */
const PAUSED = 'PAUSED' as PlaybackStatus.PAUSED;

/**
 * w3cmedia's session state (`MediaControlStateUtil`, `@hidden`): it follows
 * the player's events and sends Vega the status with `updateState()`.
 */
type StateUtil = {
  playbackStatus?: PlaybackStatus;
  updateState?: () => void;
};

type MediaId = Parameters<KeplerMediaControlHandler['handleGetMetadataInfo']>[0];

/** A KMC time in ms; a missing `nanoseconds` counts as 0, as w3cmedia's does. */
export const timeValueMs = ({seconds, nanoseconds}: ITimeValue): number =>
  seconds === undefined ? NaN : seconds * 1000 + (nanoseconds ?? 0) / 1e6;

/**
 * Vega Media Controls (Alexa, the remote's media keys) for one player: the
 * commands go to the controller instead of w3cmedia's default handler, which
 * acts on the `VideoPlayer` behind the controller's back (a pause while Alexa
 * holds the audio focus sends no `pause` event, so the controller never knew).
 *
 * "Stop" pauses: the viewer stays on the player. ⏩ / ⏪ step like the
 * overlay's buttons. The rest stays w3cmedia's.
 *
 * The session state is w3cmedia's too, except the status while the
 * controller is paused: w3cmedia sets PLAYING on every `audiofocusgranted`,
 * so after Alexa's "pause" Vega was told the player plays.
 * {@link reportPaused} corrects what w3cmedia sends, and
 * {@link handleGetSessionState} what Vega asks for.
 */
export class MediaControlsHandler extends KeplerMediaControlHandler {
  private warned = false;

  constructor(private readonly target: MediaControlsTarget) {
    super();
  }

  /**
   * Sets w3cmedia's status to PAUSED and sends it to Vega. It reaches
   * w3cmedia's internals, so anything missing or throwing only warns (once).
   */
  reportPaused() {
    try {
      const util = (
        this.mediaPlayer as {mediaControlStateUtil?: StateUtil | null} | null
      )?.mediaControlStateUtil;
      if (typeof util?.updateState !== 'function') {
        this.warnOnce('no session state to update');
        return;
      }
      util.playbackStatus = PAUSED;
      util.updateState();
    } catch (reason) {
      this.warnOnce(reason);
    }
  }

  /** w3cmedia's state, saying PAUSED while the controller is paused. */
  async handleGetSessionState(
    sessionId?: IMediaSessionId,
  ): Promise<MediaSessionState[]> {
    const states = await super.handleGetSessionState(sessionId);
    if (!this.target.paused) {
      return states;
    }
    // Copies: w3cmedia compares its own object to tell what changed. Only
    // the status changes; more broke Vega's state for another app.
    return states.map((state) =>
      state.playbackState
        ? {
            ...state,
            playbackState: {...state.playbackState, playbackStatus: PAUSED},
          }
        : state,
    );
  }

  private warnOnce(reason: unknown) {
    if (__DEV__ && !this.warned) {
      this.warned = true;
      console.warn('Media Controls reportPaused failed', reason);
    }
  }

  async handlePlay(_sessionId?: IMediaSessionId): Promise<void> {
    this.target.play();
  }

  async handlePause(
    _sessionId?: IMediaSessionId,
    _context?: ICommandContext,
  ): Promise<void> {
    this.target.pause();
  }

  async handleStop(_sessionId?: IMediaSessionId): Promise<void> {
    this.target.pause();
  }

  async handleTogglePlayPause(_sessionId?: IMediaSessionId): Promise<void> {
    this.target.togglePause();
  }

  async handleSkipForward(
    delta: ITimeValue,
    _sessionId?: IMediaSessionId,
  ): Promise<void> {
    this.skip(timeValueMs(delta));
  }

  async handleSkipBackward(
    delta: ITimeValue,
    _sessionId?: IMediaSessionId,
  ): Promise<void> {
    this.skip(-timeValueMs(delta));
  }

  async handleFastForward(_sessionId?: IMediaSessionId): Promise<void> {
    this.target.seekBy(SEEK_FORWARD_STEP_MS);
  }

  async handleRewind(_sessionId?: IMediaSessionId): Promise<void> {
    this.target.seekBy(-SEEK_BACK_STEP_MS);
  }

  async handleSeek(
    position: ITimeValue,
    _sessionId?: IMediaSessionId,
  ): Promise<void> {
    const ms = timeValueMs(position);
    if (Number.isFinite(ms)) {
      this.target.seekTo(ms);
    }
  }

  async handleStartOver(_sessionId?: IMediaSessionId): Promise<void> {
    this.target.seekTo(0);
  }

  private skip(deltaMs: number) {
    if (Number.isFinite(deltaMs)) {
      this.target.seekBy(deltaMs);
    }
  }

  /** w3cmedia's default rejects, which Vega logs as an error. */
  async handleGetMetadataInfo(id: MediaId): Promise<IMediaMetadata> {
    const title = this.target.title;
    return {mediaId: id, ...(title ? {title} : {}), artwork: []};
  }
}

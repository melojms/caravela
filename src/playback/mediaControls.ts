import type {
  ICommandContext,
  IMediaMetadata,
  IMediaSessionId,
  ITimeValue,
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
 * overlay's buttons. The session state and the rest stay w3cmedia's.
 */
export class MediaControlsHandler extends KeplerMediaControlHandler {
  constructor(private readonly target: MediaControlsTarget) {
    super();
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

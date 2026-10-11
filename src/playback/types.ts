import type {PlayMethod} from '@jellyfin/sdk/lib/generated-client/models/play-method';

/**
 * How the player loads `url`: `url` sets it as the `VideoPlayer` source
 * (direct play); `hls` loads it through Shaka in MSE mode (direct stream and
 * transcode).
 */
export type PlaybackMode = 'url' | 'hls';

/** What the player needs to start a resolved item and report on it. */
export type PlaybackSession = {
  itemId: string;
  mediaSourceId: string;
  /** From PlaybackInfo; every report and `stopEncodingProcess` sends it. */
  playSessionId: string;
  playMethod: PlayMethod;
  mode: PlaybackMode;
  /** The static stream URL (`url` mode) or the HLS master playlist (`hls`). */
  url: string;
  /** Where playback starts, in ms (Resume position, or 0). */
  startMs: number;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  /** Media duration in ms when the server knows it. */
  durationMs?: number;
  /** The cap sent with PlaybackInfo, in bits per second; Shaka's ABR uses it. */
  maxStreamingBitrate?: number;
};

/** Why an item can't be played (yet). */
export type PlaybackUnavailableReason =
  /** Can't direct play, and the server returned no `TranscodingUrl`. */
  | 'needs-transcode'
  /** The server returned no media source, or an `ErrorCode`. */
  | 'no-media-source';

/** The resolver's answer: a session to play, or why not. */
export type PlaybackResolution =
  | {kind: 'play'; session: PlaybackSession}
  | {kind: 'unavailable'; reason: PlaybackUnavailableReason; message: string};

/** What the reporter needs from the player on each report. */
export type PlaybackSnapshot = {
  positionMs: number;
  isPaused: boolean;
};

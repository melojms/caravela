import type {PlayMethod} from '@jellyfin/sdk/lib/generated-client/models/play-method';

/** What the player needs to start a resolved item and report on it. */
export type PlaybackSession = {
  itemId: string;
  mediaSourceId: string;
  /** From PlaybackInfo; every report and `stopEncodingProcess` sends it. */
  playSessionId: string;
  playMethod: PlayMethod;
  /** The URL to play. URL mode for direct play; an HLS URL from task 9 on. */
  url: string;
  /** Where playback starts, in ms (Resume position, or 0). */
  startMs: number;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  /** Media duration in ms when the server knows it. */
  durationMs?: number;
};

/** Why an item can't be played (yet). */
export type PlaybackUnavailableReason =
  /** Needs direct stream or transcoding: HLS through Shaka arrives in task 9. */
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

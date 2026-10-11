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
  /** The source's audio streams, in server order. Missing means none known. */
  audioTracks?: MediaTrack[];
  /** The source's subtitle streams, in server order. Missing means none known. */
  subtitleTracks?: SubtitleTrack[];
};

/** An audio or subtitle stream the viewer can pick. */
export type MediaTrack = {
  /** The stream's `Index`: PlaybackInfo and the reports use it. */
  index: number;
  /** What the picker shows (the server's `DisplayTitle`, or a fallback). */
  label: string;
  language?: string;
  /** The server's `IsDefault` flag on the stream. */
  isDefault?: boolean;
};

/**
 * How a subtitle reaches the screen: `external` is text the app fetches as
 * WebVTT and draws itself (switching is client-side); `burn-in` is drawn into
 * the video by the server, so switching to or from it re-requests PlaybackInfo.
 */
export type SubtitleDelivery = 'external' | 'burn-in';

export type SubtitleTrack = MediaTrack & {
  delivery: SubtitleDelivery;
  /** The WebVTT URL with the token, for `external` tracks. */
  vttUrl?: string;
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
  /** The audio stream playing now; falls back to the session's. */
  audioStreamIndex?: number;
  /** The subtitle showing now (-1 = off); falls back to the session's. */
  subtitleStreamIndex?: number;
};

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

/**
 * One trickplay resolution of the playing media source (the server's
 * `TrickplayInfoDto`): thumbnails `width`×`height` px, packed
 * `tileWidth`×`tileHeight` to a sheet, one every `intervalMs`.
 */
export type TrickplayInfo = {
  itemId: string;
  mediaSourceId: string;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  thumbnailCount: number;
  intervalMs: number;
};

/**
 * Where the thumbnail for a position is: the sheet image and the cell's
 * offset in it, in sheet pixels.
 */
export type TrickplayTile = {
  /** The sheet URL, with the token. */
  url: string;
  /** The sheet's full size: `width × tileWidth` by `height × tileHeight`. */
  sheetWidth: number;
  sheetHeight: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

/** A chapter of the playing item, in server order. */
export type Chapter = {
  /** Position among the item's chapters (the chapter image index). */
  index: number;
  name: string;
  startMs: number;
  /** The chapter image, when the server has one. */
  imageUrl?: string;
};

/**
 * The overlay's heading: an episode shows its series as the title and
 * `S1:E2 · Episode name` as the subtitle; anything else just its name.
 */
export type PlayerTitle = {title: string; subtitle?: string};

/**
 * The overlay's Zoom choices (androidtv's Fit / Auto crop / Stretch), mapped
 * to `KeplerVideoSurfaceView` `scalingmode` `fit` / `fill` / `strech`.
 */
export type ZoomMode = 'fit' | 'crop' | 'stretch';

/** androidtv's `VideoSpeedController.SpeedSteps`. */
export const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

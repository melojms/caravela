import type {Api} from '@jellyfin/sdk';
import type {DeviceProfile} from '@jellyfin/sdk/lib/generated-client/models/device-profile';
import type {MediaSourceInfo} from '@jellyfin/sdk/lib/generated-client/models/media-source-info';
import type {MediaStream} from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import {MediaStreamType} from '@jellyfin/sdk/lib/generated-client/models/media-stream-type';
import {MediaStreamProtocol} from '@jellyfin/sdk/lib/generated-client/models/media-stream-protocol';
import {PlayMethod} from '@jellyfin/sdk/lib/generated-client/models/play-method';
import {PlaybackErrorCode} from '@jellyfin/sdk/lib/generated-client/models/playback-error-code';
import {SubtitleDeliveryMethod} from '@jellyfin/sdk/lib/generated-client/models/subtitle-delivery-method';
import {getMediaInfoApi} from '@jellyfin/sdk/lib/utils/api/media-info-api';

import {msToTicks, ticksToMs} from '../api/itemInfo';
import {buildDeviceProfile, DEFAULT_MAX_BITRATE} from './deviceProfile';
import type {
  MediaTrack,
  PlaybackMode,
  PlaybackResolution,
  SubtitleTrack,
} from './types';

export type PlaybackRequest = {
  itemId: string;
  userId: string;
  /** Where to start, in ms (Resume position, or 0). */
  startMs: number;
  mediaSourceId?: string;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  /** In bits per second; defaults to `DEFAULT_MAX_BITRATE`. */
  maxStreamingBitrate?: number;
  /** Burn in the subtitle when the server transcodes (androidtv's option). */
  alwaysBurnInSubtitleWhenTranscoding?: boolean;
  /** Defaults to `buildDeviceProfile({maxStreamingBitrate})`. */
  deviceProfile?: DeviceProfile;
};

/** androidtv's messages for each PlaybackInfo error code. */
export const PLAYBACK_ERROR_MESSAGES: Record<PlaybackErrorCode, string> = {
  [PlaybackErrorCode.NotAllowed]: 'Playback not allowed at this time.',
  [PlaybackErrorCode.NoCompatibleStream]: 'Cannot play this video format.',
  [PlaybackErrorCode.RateLimitExceeded]:
    'The administrator has restricted playback of this item at this time.',
};

export const NO_MEDIA_SOURCE_MESSAGE = 'This item has no playable media.';
export const NEEDS_TRANSCODE_MESSAGE =
  "The server can't stream this file to this device.";

/**
 * The direct play URL, built like androidtv's `getVideoStreamUrl(static =
 * true)`. URL mode can't send headers, so the token goes in `ApiKey`: Jellyfin
 * 12 ignores `api_key`, so an endpoint that needs auth answers 401.
 */
export function directPlayUrl(
  api: Api,
  itemId: string,
  source: MediaSourceInfo,
): string {
  const params: [string, string | null | undefined][] = [
    ['static', 'true'],
    ['mediaSourceId', source.Id],
    ['deviceId', api.deviceInfo.id],
    ['ApiKey', api.accessToken],
    ['tag', source.ETag],
    ['liveStreamId', source.LiveStreamId],
  ];
  const query = params
    .filter((param): param is [string, string] => !!param[1])
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `${api.basePath}/Videos/${encodeURIComponent(itemId)}/stream?${query}`;
}

/**
 * The HLS URL for direct stream and transcode: the server's `TranscodingUrl`
 * on `basePath`, as androidtv's `createUrl(…, ignorePathParameters = true)`
 * and jellyfin-web do. The server already adds `ApiKey` (`StreamInfo.ToUrl`);
 * `ApiKey` is only added when the URL has no token (in either spelling).
 */
export function transcodingUrl(api: Api, path: string): string {
  const url = `${api.basePath}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!api.accessToken || /[?&](apikey|api_key)=/i.test(url)) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}ApiKey=${encodeURIComponent(api.accessToken)}`;
}

/**
 * A text subtitle as WebVTT: the server's subtitle stream endpoint (the one
 * `StreamInfo` builds for `DeliveryUrl`) with the format forced to `vtt`, so
 * SRT, TTML and embedded text all arrive in one format. Start ticks are 0, as
 * the server uses for direct play and HLS. The request has no headers, so the
 * token goes in `ApiKey`.
 */
export function subtitleVttUrl(
  api: Api,
  itemId: string,
  mediaSourceId: string,
  index: number,
): string {
  return transcodingUrl(
    api,
    `/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(
      mediaSourceId,
    )}/Subtitles/${index}/0/Stream.vtt`,
  );
}

const nonEmpty = (value: string | null | undefined): string | undefined =>
  value?.trim() ? value : undefined;

/**
 * androidtv labels a stream with `displayTitle ?: title`; the language and a
 * numbered fallback cover streams the server left untitled.
 */
function toMediaTrack(stream: MediaStream, position: number): MediaTrack {
  const language = nonEmpty(stream.Language);
  const codec = nonEmpty(stream.Codec)?.toLowerCase();
  return {
    index: stream.Index ?? -1,
    label:
      nonEmpty(stream.DisplayTitle) ??
      nonEmpty(stream.Title) ??
      language ??
      `Track ${position + 1}`,
    ...(language ? {language} : {}),
    ...(stream.IsDefault != null ? {isDefault: stream.IsDefault} : {}),
    ...(codec ? {codec} : {}),
  };
}

const streamsOfType = (source: MediaSourceInfo, type: MediaStreamType) =>
  (source.MediaStreams ?? []).filter(
    (stream) => stream.Type === type && stream.Index != null,
  );

/** The source's audio streams, in server order. */
function audioTracks(source: MediaSourceInfo): MediaTrack[] {
  return streamsOfType(source, MediaStreamType.Audio).map(toMediaTrack);
}

/**
 * The source's subtitle streams (embedded and sidecar), in server order.
 * PlaybackInfo sets `DeliveryMethod` on every subtitle stream
 * (`MediaInfoHelper.SetDeviceSpecificSubtitleInfo`): `External` ones are
 * fetched as WebVTT and drawn by the app; anything else is burned in.
 */
function subtitleTracks(
  api: Api,
  itemId: string,
  mediaSourceId: string,
  source: MediaSourceInfo,
): SubtitleTrack[] {
  return streamsOfType(source, MediaStreamType.Subtitle).map(
    (stream, position) => {
      const track = toMediaTrack(stream, position);
      return stream.DeliveryMethod === SubtitleDeliveryMethod.External
        ? {
            ...track,
            delivery: 'external',
            vttUrl: subtitleVttUrl(api, itemId, mediaSourceId, track.index),
          }
        : {...track, delivery: 'burn-in'};
    },
  );
}

/**
 * Asks the server how to play an item (PlaybackInfo, as androidtv's
 * `PlaybackManager` does) and turns the answer into something to play.
 * Network and HTTP errors reject; the caller shows them.
 */
export async function resolvePlayback(
  api: Api,
  request: PlaybackRequest,
): Promise<PlaybackResolution> {
  const {itemId, mediaSourceId, audioStreamIndex, subtitleStreamIndex} =
    request;
  const maxStreamingBitrate =
    request.maxStreamingBitrate ?? DEFAULT_MAX_BITRATE;
  const {data} = await getMediaInfoApi(api).getPostedPlaybackInfo({
    itemId,
    playbackInfoDto: {
      UserId: request.userId,
      MediaSourceId: mediaSourceId,
      StartTimeTicks: msToTicks(request.startMs),
      DeviceProfile:
        request.deviceProfile ?? buildDeviceProfile({maxStreamingBitrate}),
      MaxStreamingBitrate: maxStreamingBitrate,
      EnableDirectPlay: true,
      EnableDirectStream: true,
      EnableTranscoding: true,
      // androidtv drops a negative audio index ("none"), but keeps -1 for
      // subtitles, which turns them off.
      AudioStreamIndex:
        audioStreamIndex !== undefined && audioStreamIndex >= 0
          ? audioStreamIndex
          : undefined,
      SubtitleStreamIndex: subtitleStreamIndex,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: true,
      AutoOpenLiveStream: true,
      AlwaysBurnInSubtitleWhenTranscoding:
        request.alwaysBurnInSubtitleWhenTranscoding ?? false,
    },
  });

  if (data.ErrorCode) {
    return {
      kind: 'unavailable',
      reason: 'no-media-source',
      message:
        PLAYBACK_ERROR_MESSAGES[data.ErrorCode] ?? NO_MEDIA_SOURCE_MESSAGE,
    };
  }

  const sources = data.MediaSources ?? [];
  const source =
    (mediaSourceId && sources.find((s) => s.Id === mediaSourceId)) ||
    sources[0];
  if (!source?.Id) {
    return {
      kind: 'unavailable',
      reason: 'no-media-source',
      message: NO_MEDIA_SOURCE_MESSAGE,
    };
  }

  // androidtv's order: direct play, then direct stream (remux), then
  // transcode. Only HLS is accepted; Shaka plays it.
  let playMethod: PlayMethod;
  let mode: PlaybackMode;
  let url: string;
  const hlsUrl =
    source.TranscodingUrl &&
    source.TranscodingSubProtocol === MediaStreamProtocol.Hls
      ? transcodingUrl(api, source.TranscodingUrl)
      : undefined;
  if (source.SupportsDirectPlay) {
    playMethod = PlayMethod.DirectPlay;
    mode = 'url';
    url = directPlayUrl(api, itemId, source);
  } else if (source.SupportsDirectStream && hlsUrl) {
    playMethod = PlayMethod.DirectStream;
    mode = 'hls';
    url = hlsUrl;
  } else if (source.SupportsTranscoding && hlsUrl) {
    playMethod = PlayMethod.Transcode;
    mode = 'hls';
    url = hlsUrl;
  } else {
    return {
      kind: 'unavailable',
      reason: 'needs-transcode',
      message: NEEDS_TRANSCODE_MESSAGE,
    };
  }

  const audioIndex = audioStreamIndex ?? source.DefaultAudioStreamIndex;
  const subtitleIndex =
    subtitleStreamIndex ?? source.DefaultSubtitleStreamIndex;
  return {
    kind: 'play',
    session: {
      itemId,
      mediaSourceId: source.Id,
      playSessionId: data.PlaySessionId ?? '',
      playMethod,
      mode,
      url,
      startMs: request.startMs,
      ...(audioIndex != null ? {audioStreamIndex: audioIndex} : {}),
      ...(subtitleIndex != null ? {subtitleStreamIndex: subtitleIndex} : {}),
      ...(source.RunTimeTicks != null
        ? {durationMs: ticksToMs(source.RunTimeTicks)}
        : {}),
      maxStreamingBitrate,
      audioTracks: audioTracks(source),
      subtitleTracks: subtitleTracks(api, itemId, source.Id, source),
    },
  };
}

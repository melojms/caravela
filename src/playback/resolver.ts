import type {Api} from '@jellyfin/sdk';
import type {DeviceProfile} from '@jellyfin/sdk/lib/generated-client/models/device-profile';
import type {MediaSourceInfo} from '@jellyfin/sdk/lib/generated-client/models/media-source-info';
import {PlayMethod} from '@jellyfin/sdk/lib/generated-client/models/play-method';
import {PlaybackErrorCode} from '@jellyfin/sdk/lib/generated-client/models/playback-error-code';
import {getMediaInfoApi} from '@jellyfin/sdk/lib/utils/api/media-info-api';

import {msToTicks, ticksToMs} from '../api/itemInfo';
import {buildDeviceProfile} from './deviceProfile';
import type {PlaybackResolution} from './types';

export type PlaybackRequest = {
  itemId: string;
  userId: string;
  /** Where to start, in ms (Resume position, or 0). */
  startMs: number;
  mediaSourceId?: string;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  /** In bits per second; the profile's limit applies when left out. */
  maxStreamingBitrate?: number;
  /** Burn in the subtitle when the server transcodes (androidtv's option). */
  alwaysBurnInSubtitleWhenTranscoding?: boolean;
  /** Defaults to `buildDeviceProfile()`. */
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
  "This file needs transcoding, which Caravela can't play yet.";

/**
 * The direct play URL, built like androidtv's `getVideoStreamUrl(static =
 * true)`. URL mode can't send headers, so the token goes in `api_key`.
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
    ['api_key', api.accessToken],
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
  const {data} = await getMediaInfoApi(api).getPostedPlaybackInfo({
    itemId,
    playbackInfoDto: {
      UserId: request.userId,
      MediaSourceId: mediaSourceId,
      StartTimeTicks: msToTicks(request.startMs),
      DeviceProfile: request.deviceProfile ?? buildDeviceProfile(),
      MaxStreamingBitrate: request.maxStreamingBitrate,
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

  if (!source.SupportsDirectPlay) {
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
      playMethod: PlayMethod.DirectPlay,
      mode: 'url',
      url: directPlayUrl(api, itemId, source),
      startMs: request.startMs,
      ...(audioIndex != null ? {audioStreamIndex: audioIndex} : {}),
      ...(subtitleIndex != null ? {subtitleStreamIndex: subtitleIndex} : {}),
      ...(source.RunTimeTicks != null
        ? {durationMs: ticksToMs(source.RunTimeTicks)}
        : {}),
    },
  };
}

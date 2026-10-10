import type {Api} from '@jellyfin/sdk';
import {getMediaInfoApi} from '@jellyfin/sdk/lib/utils/api/media-info-api';

import {buildDeviceProfile} from '../../src/playback/deviceProfile';
import {
  NEEDS_TRANSCODE_MESSAGE,
  NO_MEDIA_SOURCE_MESSAGE,
  PLAYBACK_ERROR_MESSAGES,
  resolvePlayback,
} from '../../src/playback/resolver';
import type {PlaybackRequest} from '../../src/playback/resolver';

jest.mock('@jellyfin/sdk/lib/utils/api/media-info-api', () => ({
  getMediaInfoApi: jest.fn(),
}));
jest.mock('../../src/playback/deviceProfile', () => ({
  buildDeviceProfile: jest.fn(() => ({Name: 'Caravela'})),
}));

const mediaInfoApi = {getPostedPlaybackInfo: jest.fn()};

const api = {
  basePath: 'https://jf.example/base',
  accessToken: 'tok en/+',
  deviceInfo: {id: 'device 1', name: 'Fire TV (Vega)'},
} as unknown as Api;

const REQUEST: PlaybackRequest = {
  itemId: 'item-1',
  userId: 'user-1',
  startMs: 90_000,
};

const SOURCE = {
  Id: 'source-1',
  Container: 'mkv',
  ETag: 'etag&1',
  SupportsDirectPlay: true,
  SupportsDirectStream: true,
  SupportsTranscoding: true,
  RunTimeTicks: 72_000_000_000,
  DefaultAudioStreamIndex: 1,
  DefaultSubtitleStreamIndex: 3,
};

const respond = (data: object) =>
  mediaInfoApi.getPostedPlaybackInfo.mockResolvedValue({data});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getMediaInfoApi).mockReturnValue(mediaInfoApi as any);
  respond({MediaSources: [SOURCE], PlaySessionId: 'session-1'});
});

describe('resolvePlayback', () => {
  it('posts PlaybackInfo with the request and the device profile', async () => {
    await resolvePlayback(api, {
      ...REQUEST,
      mediaSourceId: 'source-1',
      audioStreamIndex: 2,
      subtitleStreamIndex: 4,
      maxStreamingBitrate: 20e6,
    });

    expect(getMediaInfoApi).toHaveBeenCalledWith(api);
    expect(mediaInfoApi.getPostedPlaybackInfo).toHaveBeenCalledWith({
      itemId: 'item-1',
      playbackInfoDto: {
        UserId: 'user-1',
        MediaSourceId: 'source-1',
        StartTimeTicks: 900_000_000,
        DeviceProfile: {Name: 'Caravela'},
        MaxStreamingBitrate: 20e6,
        EnableDirectPlay: true,
        EnableDirectStream: true,
        EnableTranscoding: true,
        AudioStreamIndex: 2,
        SubtitleStreamIndex: 4,
        AllowVideoStreamCopy: true,
        AllowAudioStreamCopy: true,
        AutoOpenLiveStream: true,
        AlwaysBurnInSubtitleWhenTranscoding: false,
      },
    });
  });

  it('uses a given device profile instead of the default', async () => {
    const deviceProfile = {Name: 'Custom'};
    await resolvePlayback(api, {...REQUEST, deviceProfile});
    expect(buildDeviceProfile).not.toHaveBeenCalled();
    expect(
      mediaInfoApi.getPostedPlaybackInfo.mock.calls[0][0].playbackInfoDto
        .DeviceProfile,
    ).toBe(deviceProfile);
  });

  it('drops a negative audio index but keeps -1 for subtitles off', async () => {
    await resolvePlayback(api, {
      ...REQUEST,
      audioStreamIndex: -1,
      subtitleStreamIndex: -1,
      alwaysBurnInSubtitleWhenTranscoding: true,
    });
    const dto =
      mediaInfoApi.getPostedPlaybackInfo.mock.calls[0][0].playbackInfoDto;
    expect(dto.AudioStreamIndex).toBeUndefined();
    expect(dto.SubtitleStreamIndex).toBe(-1);
    expect(dto.AlwaysBurnInSubtitleWhenTranscoding).toBe(true);
  });

  it('direct plays with a static URL and the session fields', async () => {
    respond({
      MediaSources: [{...SOURCE, LiveStreamId: 'live 1'}],
      PlaySessionId: 'session-1',
    });
    await expect(resolvePlayback(api, REQUEST)).resolves.toEqual({
      kind: 'play',
      session: {
        itemId: 'item-1',
        mediaSourceId: 'source-1',
        playSessionId: 'session-1',
        playMethod: 'DirectPlay',
        url:
          'https://jf.example/base/Videos/item-1/stream?static=true' +
          '&mediaSourceId=source-1&deviceId=device%201' +
          '&api_key=tok%20en%2F%2B&tag=etag%261&liveStreamId=live%201',
        startMs: 90_000,
        audioStreamIndex: 1,
        subtitleStreamIndex: 3,
        durationMs: 7_200_000,
      },
    });
  });

  it('leaves out tag, live stream and optional fields when missing', async () => {
    respond({
      MediaSources: [
        {
          Id: 'source-1',
          SupportsDirectPlay: true,
        },
      ],
    });
    const result = await resolvePlayback(api, REQUEST);
    expect(result).toEqual({
      kind: 'play',
      session: {
        itemId: 'item-1',
        mediaSourceId: 'source-1',
        playSessionId: '',
        playMethod: 'DirectPlay',
        url:
          'https://jf.example/base/Videos/item-1/stream?static=true' +
          '&mediaSourceId=source-1&deviceId=device%201&api_key=tok%20en%2F%2B',
        startMs: 90_000,
      },
    });
  });

  it('keeps the requested stream indexes over the server defaults', async () => {
    const result = await resolvePlayback(api, {
      ...REQUEST,
      audioStreamIndex: 2,
      subtitleStreamIndex: -1,
    });
    expect(result).toMatchObject({
      session: {audioStreamIndex: 2, subtitleStreamIndex: -1},
    });
  });

  it('picks the requested media source', async () => {
    respond({
      MediaSources: [SOURCE, {...SOURCE, Id: 'source-2', ETag: 'e2'}],
      PlaySessionId: 'session-1',
    });
    const result = await resolvePlayback(api, {
      ...REQUEST,
      mediaSourceId: 'source-2',
    });
    expect(result).toMatchObject({
      kind: 'play',
      session: {mediaSourceId: 'source-2'},
    });
    expect(result.kind === 'play' && result.session.url).toContain(
      'mediaSourceId=source-2',
    );
  });

  it('falls back to the first source when the requested one is missing', async () => {
    const result = await resolvePlayback(api, {
      ...REQUEST,
      mediaSourceId: 'gone',
    });
    expect(result).toMatchObject({session: {mediaSourceId: 'source-1'}});
  });

  it.each([
    ['direct stream', {SupportsDirectPlay: false, TranscodingUrl: '/v.m3u8'}],
    [
      'transcode',
      {
        SupportsDirectPlay: false,
        SupportsDirectStream: false,
        TranscodingUrl: '/v.m3u8',
      },
    ],
  ])('returns needs-transcode for %s', async (_name, overrides) => {
    respond({MediaSources: [{...SOURCE, ...overrides}], PlaySessionId: 's'});
    await expect(resolvePlayback(api, REQUEST)).resolves.toEqual({
      kind: 'unavailable',
      reason: 'needs-transcode',
      message: NEEDS_TRANSCODE_MESSAGE,
    });
  });

  it.each(['NotAllowed', 'NoCompatibleStream', 'RateLimitExceeded'] as const)(
    'returns no-media-source with a message for %s',
    async (code) => {
      respond({ErrorCode: code, MediaSources: [SOURCE]});
      await expect(resolvePlayback(api, REQUEST)).resolves.toEqual({
        kind: 'unavailable',
        reason: 'no-media-source',
        message: PLAYBACK_ERROR_MESSAGES[code],
      });
    },
  );

  it('has a distinct message for every error code', () => {
    const messages = Object.values(PLAYBACK_ERROR_MESSAGES);
    expect(new Set(messages).size).toBe(3);
  });

  it.each([
    ['empty', {MediaSources: []}],
    ['missing', {}],
    ['without an id', {MediaSources: [{SupportsDirectPlay: true}]}],
  ])('returns no-media-source when sources are %s', async (_name, data) => {
    respond(data);
    await expect(resolvePlayback(api, REQUEST)).resolves.toEqual({
      kind: 'unavailable',
      reason: 'no-media-source',
      message: NO_MEDIA_SOURCE_MESSAGE,
    });
  });

  it('rejects on a network error', async () => {
    const error = new Error('Network Error');
    mediaInfoApi.getPostedPlaybackInfo.mockRejectedValue(error);
    await expect(resolvePlayback(api, REQUEST)).rejects.toBe(error);
  });
});

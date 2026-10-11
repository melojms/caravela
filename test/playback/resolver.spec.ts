import type {Api} from '@jellyfin/sdk';
import {getMediaInfoApi} from '@jellyfin/sdk/lib/utils/api/media-info-api';

import {
  buildDeviceProfile,
  DEFAULT_MAX_BITRATE,
} from '../../src/playback/deviceProfile';
import {
  NEEDS_TRANSCODE_MESSAGE,
  NO_MEDIA_SOURCE_MESSAGE,
  PLAYBACK_ERROR_MESSAGES,
  resolvePlayback,
  transcodingUrl,
} from '../../src/playback/resolver';
import type {PlaybackRequest} from '../../src/playback/resolver';

jest.mock('@jellyfin/sdk/lib/utils/api/media-info-api', () => ({
  getMediaInfoApi: jest.fn(),
}));
jest.mock('../../src/playback/deviceProfile', () => ({
  ...jest.requireActual('../../src/playback/deviceProfile'),
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

// What the server returns: `StreamInfo.ToUrl` already adds `ApiKey`.
const HLS_PATH =
  '/videos/item-1/master.m3u8?DeviceId=device%201&MediaSourceId=source-1' +
  '&PlaySessionId=session-1&ApiKey=server-token';

const HLS_SOURCE = {
  ...SOURCE,
  SupportsDirectPlay: false,
  TranscodingUrl: HLS_PATH,
  TranscodingSubProtocol: 'hls',
  TranscodingContainer: 'ts',
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
    expect(buildDeviceProfile).toHaveBeenCalledWith({
      maxStreamingBitrate: 20e6,
    });
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
        mode: 'url',
        url:
          'https://jf.example/base/Videos/item-1/stream?static=true' +
          '&mediaSourceId=source-1&deviceId=device%201' +
          '&api_key=tok%20en%2F%2B&tag=etag%261&liveStreamId=live%201',
        startMs: 90_000,
        audioStreamIndex: 1,
        subtitleStreamIndex: 3,
        durationMs: 7_200_000,
        maxStreamingBitrate: DEFAULT_MAX_BITRATE,
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
        mode: 'url',
        url:
          'https://jf.example/base/Videos/item-1/stream?static=true' +
          '&mediaSourceId=source-1&deviceId=device%201&api_key=tok%20en%2F%2B',
        startMs: 90_000,
        maxStreamingBitrate: DEFAULT_MAX_BITRATE,
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

  it('defaults the bitrate cap for the profile, the request and the session', async () => {
    const result = await resolvePlayback(api, REQUEST);
    expect(DEFAULT_MAX_BITRATE).toBe(100_000_000);
    expect(buildDeviceProfile).toHaveBeenCalledWith({
      maxStreamingBitrate: DEFAULT_MAX_BITRATE,
    });
    expect(
      mediaInfoApi.getPostedPlaybackInfo.mock.calls[0][0].playbackInfoDto
        .MaxStreamingBitrate,
    ).toBe(DEFAULT_MAX_BITRATE);
    expect(result).toMatchObject({
      session: {maxStreamingBitrate: DEFAULT_MAX_BITRATE},
    });
  });

  it('sends a custom bitrate cap with a given profile and keeps it on the session', async () => {
    respond({MediaSources: [HLS_SOURCE], PlaySessionId: 's'});
    const result = await resolvePlayback(api, {
      ...REQUEST,
      maxStreamingBitrate: 8e6,
      deviceProfile: {Name: 'Custom'},
    });
    expect(buildDeviceProfile).not.toHaveBeenCalled();
    expect(
      mediaInfoApi.getPostedPlaybackInfo.mock.calls[0][0].playbackInfoDto
        .MaxStreamingBitrate,
    ).toBe(8e6);
    expect(result).toMatchObject({
      session: {mode: 'hls', maxStreamingBitrate: 8e6},
    });
  });

  it('direct plays even when a TranscodingUrl is returned', async () => {
    respond({
      MediaSources: [{...HLS_SOURCE, SupportsDirectPlay: true}],
      PlaySessionId: 's',
    });
    await expect(resolvePlayback(api, REQUEST)).resolves.toMatchObject({
      session: {playMethod: 'DirectPlay', mode: 'url'},
    });
  });

  it('direct streams (remux) to HLS with the session fields', async () => {
    respond({MediaSources: [HLS_SOURCE], PlaySessionId: 'session-1'});
    await expect(resolvePlayback(api, REQUEST)).resolves.toEqual({
      kind: 'play',
      session: {
        itemId: 'item-1',
        mediaSourceId: 'source-1',
        playSessionId: 'session-1',
        playMethod: 'DirectStream',
        mode: 'hls',
        url: `https://jf.example/base${HLS_PATH}`,
        startMs: 90_000,
        audioStreamIndex: 1,
        subtitleStreamIndex: 3,
        durationMs: 7_200_000,
        maxStreamingBitrate: DEFAULT_MAX_BITRATE,
      },
    });
  });

  it('transcodes when the source only supports transcoding', async () => {
    respond({
      MediaSources: [{...HLS_SOURCE, SupportsDirectStream: false}],
      PlaySessionId: 's',
    });
    const result = await resolvePlayback(api, {
      ...REQUEST,
      audioStreamIndex: 2,
      subtitleStreamIndex: -1,
    });
    expect(result).toMatchObject({
      kind: 'play',
      session: {
        playMethod: 'Transcode',
        mode: 'hls',
        url: `https://jf.example/base${HLS_PATH}`,
        audioStreamIndex: 2,
        subtitleStreamIndex: -1,
      },
    });
  });

  it.each([
    ['no TranscodingUrl', {TranscodingUrl: undefined}],
    ['a null TranscodingUrl', {TranscodingUrl: null}],
    ['an http sub-protocol', {TranscodingSubProtocol: 'http'}],
    ['no sub-protocol', {TranscodingSubProtocol: undefined}],
    [
      'neither direct stream nor transcoding',
      {SupportsDirectStream: false, SupportsTranscoding: false},
    ],
  ])('returns needs-transcode with %s', async (_name, overrides) => {
    respond({
      MediaSources: [{...HLS_SOURCE, ...overrides}],
      PlaySessionId: 's',
    });
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

describe('transcodingUrl', () => {
  const withBase = (basePath: string, accessToken = 'tok en/+') =>
    ({...api, basePath, accessToken} as unknown as Api);

  it.each([
    ['with a path prefix', 'https://jf.example/base'],
    ['without a path prefix', 'https://jf.example'],
  ])('joins the URL with basePath %s', (_name, basePath) => {
    expect(transcodingUrl(withBase(basePath), HLS_PATH)).toBe(
      `${basePath}${HLS_PATH}`,
    );
  });

  it('adds a slash when the path has none', () => {
    expect(
      transcodingUrl(withBase('https://jf.example'), 'videos/1/master.m3u8'),
    ).toBe('https://jf.example/videos/1/master.m3u8?api_key=tok%20en%2F%2B');
  });

  it.each([
    'ApiKey=server',
    'api_key=server',
    'apikey=server',
    'API_KEY=server',
  ])('keeps the token the server added (%s)', (token) => {
    const path = `/videos/1/master.m3u8?a=1&${token}`;
    expect(transcodingUrl(withBase('https://jf.example'), path)).toBe(
      `https://jf.example${path}`,
    );
  });

  it('adds api_key once when the server left it out', () => {
    expect(
      transcodingUrl(
        withBase('https://jf.example'),
        '/videos/1/master.m3u8?a=1',
      ),
    ).toBe(
      'https://jf.example/videos/1/master.m3u8?a=1&api_key=tok%20en%2F%2B',
    );
    expect(
      transcodingUrl(withBase('https://jf.example'), '/videos/1/master.m3u8'),
    ).toBe('https://jf.example/videos/1/master.m3u8?api_key=tok%20en%2F%2B');
  });

  it('does not take another parameter ending in apikey for the token', () => {
    expect(
      transcodingUrl(withBase('https://jf.example'), '/v.m3u8?xApiKey=1'),
    ).toBe('https://jf.example/v.m3u8?xApiKey=1&api_key=tok%20en%2F%2B');
  });

  it('adds nothing without an access token', () => {
    expect(
      transcodingUrl(withBase('https://jf.example', ''), '/v.m3u8?a=1'),
    ).toBe('https://jf.example/v.m3u8?a=1');
  });
});

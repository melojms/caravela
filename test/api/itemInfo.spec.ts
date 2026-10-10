import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type {MediaSourceInfo} from '@jellyfin/sdk/lib/generated-client/models/media-source-info';
import type {MediaStream} from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import {getImageApi} from '@jellyfin/sdk/lib/utils/api/image-api';

import {
  audioCodecName,
  detailsInfoItems,
  endTime,
  formatMillis,
  formatRunTime,
  infoRowEntries,
  mediaBadges,
  msToTicks,
  peopleToCards,
  resolutionName,
  resumeLabel,
  resumePositionMs,
  ticksToMs,
  videoRangeNames,
} from '../../src/api/itemInfo';
import {PLACEHOLDER_COLORS} from '../../src/api/items';

jest.mock('@jellyfin/sdk/lib/utils/api/image-api', () => ({
  getImageApi: jest.fn(),
}));

const imageApi = {
  getItemImageUrlById: jest.fn(
    (id: string, type: string, params: {tag: string}) =>
      `https://jf/Items/${id}/Images/${type}?tag=${params.tag}`,
  ),
};

const api = {} as Api;

beforeEach(() => {
  jest.clearAllMocks();
  (getImageApi as jest.Mock).mockReturnValue(imageApi);
});

const MINUTE_TICKS = 600000000;

const video = (fields: Partial<MediaStream> = {}): MediaStream => ({
  Type: 'Video',
  Width: 1920,
  Height: 1080,
  ...fields,
});

const audio = (fields: Partial<MediaStream> = {}): MediaStream => ({
  Type: 'Audio',
  Codec: 'aac',
  ...fields,
});

const subtitle = (hearingImpaired?: boolean): MediaStream => ({
  Type: 'Subtitle',
  IsHearingImpaired: hearingImpaired,
});

const source = (...streams: MediaStream[]): MediaSourceInfo => ({
  MediaStreams: streams,
});

const badges = (item: BaseItemDto) =>
  infoRowEntries(item).filter((entry) => entry.kind === 'badge');

describe('ticks', () => {
  it('converts between ticks and ms', () => {
    expect(ticksToMs(12345678)).toBe(1234);
    expect(msToTicks(1234)).toBe(12340000);
  });
});

describe('infoRowEntries', () => {
  it("follows androidtv's movie order", () => {
    const item: BaseItemDto = {
      CommunityRating: 7.9,
      CriticRating: 94,
      PremiereDate: new Date(2016, 10, 11).toISOString(),
      ProductionYear: 2016,
      OfficialRating: 'PG-13',
      RunTimeTicks: 116 * MINUTE_TICKS,
      MediaSources: [
        source(video(), audio({Codec: 'eac3', ChannelLayout: '5.1'})),
      ],
    };

    expect(infoRowEntries(item)).toEqual([
      {kind: 'communityRating', value: 7.9},
      {kind: 'criticRating', value: 94},
      {kind: 'text', text: 'Nov 11, 2016'},
      {kind: 'text', text: 'PG-13'},
      {kind: 'badge', text: '1080p'},
      {kind: 'badge', text: 'DD+'},
      {kind: 'badge', text: '5.1'},
    ]);
  });

  it('shows the production year without a premiere date', () => {
    expect(infoRowEntries({ProductionYear: 1999})).toEqual([
      {kind: 'text', text: '1999'},
    ]);
  });

  it('falls back to the year when the premiere date is invalid', () => {
    expect(
      infoRowEntries({PremiereDate: 'not a date', ProductionYear: 1999}),
    ).toEqual([{kind: 'text', text: '1999'}]);
  });

  it('shows a zero rating', () => {
    expect(infoRowEntries({CommunityRating: 0, CriticRating: 0})).toEqual([
      {kind: 'communityRating', value: 0},
      {kind: 'criticRating', value: 0},
    ]);
  });

  it('is empty for a bare item', () => {
    expect(infoRowEntries({})).toEqual([]);
  });

  it('has no badges without a media source', () => {
    expect(badges({MediaSources: []})).toEqual([]);
    expect(badges({MediaSources: null})).toEqual([]);
    expect(badges({})).toEqual([]);
  });

  it('only reads the first media source', () => {
    expect(
      badges({
        MediaSources: [
          source(video({Width: 1280, Height: 720})),
          source(video()),
        ],
      }),
    ).toEqual([{kind: 'badge', text: '720p'}]);
  });
});

describe('mediaBadges', () => {
  it('shows SDH then CC', () => {
    expect(mediaBadges(source(subtitle(false), subtitle(true)))).toEqual([
      'SDH',
      'CC',
    ]);
    expect(mediaBadges(source(subtitle(true)))).toEqual(['SDH']);
    expect(mediaBadges(source(subtitle()))).toEqual(['CC']);
  });

  it('skips the resolution without both dimensions', () => {
    expect(mediaBadges(source(video({Height: null})))).toEqual([]);
    expect(mediaBadges(source(video({Width: undefined})))).toEqual([]);
  });

  it('uses the first video stream', () => {
    expect(
      mediaBadges(
        source(
          audio({Codec: null}),
          video({Width: 3840, Height: 2160}),
          video(),
        ),
      ),
    ).toEqual(['4K']);
  });

  it('puts badges in order: subtitles, resolution, range, codec, layout', () => {
    expect(
      mediaBadges(
        source(
          video({Width: 3840, Height: 2160, VideoRangeType: 'DOVIWithHDR10'}),
          audio({
            Codec: 'truehd',
            Profile: 'Dolby TrueHD + Dolby Atmos',
            ChannelLayout: '7.1',
          }),
          subtitle(false),
        ),
      ),
    ).toEqual(['CC', '4K', 'Dolby Vision', 'HDR10', 'TrueHD Atmos', '7.1']);
  });

  it('uses the default audio stream by list position', () => {
    expect(
      mediaBadges({
        DefaultAudioStreamIndex: 2,
        MediaStreams: [video({Width: null}), audio(), audio({Codec: 'ac3'})],
      }),
    ).toEqual(['DD']);
  });

  it('falls back to the first audio stream when the default index is not audio', () => {
    expect(
      mediaBadges({
        DefaultAudioStreamIndex: 0,
        MediaStreams: [video({Width: null}), audio({Codec: 'dca'})],
      }),
    ).toEqual(['DTS']);
  });

  it('uppercases the channel layout and skips a blank one', () => {
    expect(
      mediaBadges(source(audio({Codec: null, ChannelLayout: 'stereo'}))),
    ).toEqual(['STEREO']);
    expect(
      mediaBadges(source(audio({Codec: null, ChannelLayout: '  '}))),
    ).toEqual([]);
  });
});

describe('resolutionName', () => {
  it.each([
    [7680, 4320, '8K'],
    [7600, 0, '8K'],
    [0, 4300, '8K'],
    [3840, 2160, '4K'],
    [3800, 0, '4K'],
    [0, 2000, '4K'],
    [3799, 1999, '1440p'],
    [2560, 1440, '1440p'],
    [2500, 0, '1440p'],
    [1920, 1080, '1080p'],
    [1920, 800, '1080p'],
    [1800, 0, '1080p'],
    [0, 1000, '1080p'],
    [1799, 999, '720p'],
    [1280, 720, '720p'],
    [1200, 0, '720p'],
    [0, 700, '720p'],
    [720, 480, '480p'],
    [600, 0, '480p'],
    [0, 400, '480p'],
    [599, 399, 'SD'],
    [320, 240, 'SD'],
  ])('%i×%i is %s', (width, height, name) => {
    expect(resolutionName(width, height)).toBe(name);
  });

  it('marks interlaced video with "i"', () => {
    expect(resolutionName(1920, 1080, true)).toBe('1080i');
    expect(resolutionName(720, 576, true)).toBe('480i');
    expect(resolutionName(3840, 2160, true)).toBe('4K');
    expect(resolutionName(320, 240, true)).toBe('SD');
  });
});

describe('videoRangeNames', () => {
  it.each([
    ['SDR', ['SDR']],
    ['HDR10', ['HDR10']],
    ['HDR10Plus', ['HDR10+']],
    ['HLG', ['HLG']],
    ['DOVI', ['Dolby Vision']],
    ['DOVIWithHDR10', ['Dolby Vision', 'HDR10']],
    ['DOVIWithHLG', ['Dolby Vision', 'HLG']],
    ['DOVIWithSDR', ['Dolby Vision', 'SDR']],
    ['DOVIWithEL', ['Dolby Vision with EL']],
    ['DOVIWithHDR10Plus', ['Dolby Vision', 'HDR10+']],
    ['DOVIWithELHDR10Plus', ['Dolby Vision with EL', 'HDR10+']],
    ['DOVIInvalid', ['Dolby Vision']],
    ['Unknown', []],
    [undefined, []],
  ])('%s → %j', (range, names) => {
    expect(videoRangeNames(range as never)).toEqual(names);
  });
});

describe('audioCodecName', () => {
  it.each([
    [{Codec: 'eac3', Profile: 'Dolby Digital Plus + Dolby Atmos'}, 'DD+ Atmos'],
    [{Codec: 'truehd', Profile: 'Dolby TrueHD + Dolby Atmos'}, 'TrueHD Atmos'],
    [{Codec: 'ac4', Profile: 'dolby atmos'}, 'Dolby Atmos'],
    [{Codec: 'dts', Profile: 'DTS:X'}, 'DTS:X'],
    [{Codec: 'dts', Profile: 'DTS-HD MA'}, 'DTS-HD'],
    [{Codec: 'dts', Profile: 'DTS:HD'}, 'DTS-HD'],
    [{Codec: 'dca', Profile: 'DTS'}, 'DTS'],
    [{Codec: 'ac3'}, 'DD'],
    [{Codec: 'eac3'}, 'DD+'],
    [{Codec: 'truehd'}, 'TrueHD'],
    [{Codec: 'aac', Profile: 'LC'}, 'AAC'],
    [{Codec: 'flac'}, 'FLAC'],
    [{Codec: null}, undefined],
  ])('%j → %s', (fields, name) => {
    expect(audioCodecName(audio(fields as Partial<MediaStream>))).toBe(name);
  });
});

describe('detailsInfoItems', () => {
  // Wed 3 Jan 2024, 21:30 local time.
  const now = new Date(2024, 0, 3, 21, 30);

  it('shows the first director, runtime and end time', () => {
    const item: BaseItemDto = {
      RunTimeTicks: 116 * MINUTE_TICKS,
      People: [
        {Name: 'Amy Adams', Type: 'Actor'},
        {Name: 'Denis Villeneuve', Type: 'Director'},
        {Name: 'Someone Else', Type: 'Director'},
      ],
    };

    expect(detailsInfoItems(item, {now, use24Hour: true})).toEqual([
      {label: 'Directed by', value: 'Denis Villeneuve'},
      {label: 'Runs', value: '1h 56m'},
      {label: 'Ends', value: '23:26'},
    ]);
  });

  it('shows Unknown without a director', () => {
    expect(
      detailsInfoItems(
        {People: [{Name: 'A', Type: 'Actor'}]},
        {
          now,
          use24Hour: true,
        },
      ),
    ).toEqual([{label: 'Directed by', value: 'Unknown'}]);
    expect(detailsInfoItems({}, {now, use24Hour: true})).toEqual([
      {label: 'Directed by', value: 'Unknown'},
    ]);
  });

  it('skips Runs and Ends without a runtime', () => {
    expect(
      detailsInfoItems({RunTimeTicks: 0}, {now, use24Hour: true}),
    ).toHaveLength(1);
  });

  it('uses the 12 h clock', () => {
    const items = detailsInfoItems(
      {RunTimeTicks: 116 * MINUTE_TICKS},
      {now, use24Hour: false},
    );
    expect(items[2]).toEqual({label: 'Ends', value: '11:26'});
  });

  it('ends after what is left when resumable', () => {
    const item: BaseItemDto = {
      RunTimeTicks: 116 * MINUTE_TICKS,
      UserData: {Key: 'k', PlaybackPositionTicks: 100 * MINUTE_TICKS},
    };
    expect(detailsInfoItems(item, {now, use24Hour: true})[2]).toEqual({
      label: 'Ends',
      value: '21:46',
    });
    expect(detailsInfoItems(item, {now, use24Hour: false})[2]).toEqual({
      label: 'Ends',
      value: '9:46',
    });
    // Runs still shows the whole runtime.
    expect(detailsInfoItems(item, {now, use24Hour: true})[1]).toEqual({
      label: 'Runs',
      value: '1h 56m',
    });
  });

  it('crosses midnight', () => {
    expect(endTime({RunTimeTicks: 180 * MINUTE_TICKS}, now).getTime()).toBe(
      new Date(2024, 0, 4, 0, 30).getTime(),
    );
  });
});

describe('formatRunTime', () => {
  it.each([
    [MINUTE_TICKS * 42, '42m'],
    [MINUTE_TICKS * 60, '1h 0m'],
    [MINUTE_TICKS * 116, '1h 56m'],
    [MINUTE_TICKS * 42 + 1, '43m'],
    [1, '1m'],
  ])('%i ticks → %s', (ticks, text) => {
    expect(formatRunTime(ticks)).toBe(text);
  });
});

describe('resumePositionMs', () => {
  it('is the saved position in ms', () => {
    expect(
      resumePositionMs({
        UserData: {Key: 'k', PlaybackPositionTicks: 37300000000},
      }),
    ).toBe(3730000);
  });

  it('subtracts the pre-roll, never below 0', () => {
    const item = {
      UserData: {Key: 'k', PlaybackPositionTicks: msToTicks(10000)},
    };
    expect(resumePositionMs(item, 5000)).toBe(5000);
    expect(resumePositionMs(item, 20000)).toBe(0);
  });

  it('is undefined when there is nothing to resume', () => {
    expect(resumePositionMs({})).toBeUndefined();
    expect(resumePositionMs({UserData: {Key: 'k'}})).toBeUndefined();
    expect(
      resumePositionMs({UserData: {Key: 'k', PlaybackPositionTicks: 0}}),
    ).toBeUndefined();
  });
});

describe('resumeLabel', () => {
  it('formats under an hour as m:ss', () => {
    expect(resumeLabel(130000)).toBe('Resume from 2:10');
    expect(resumeLabel(59 * 60000 + 59999)).toBe('Resume from 59:59');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(resumeLabel(3730000)).toBe('Resume from 1:02:10');
    expect(resumeLabel(3600000)).toBe('Resume from 1:00:00');
  });

  it('formats 0', () => {
    expect(resumeLabel(0)).toBe('Resume from 0:00');
    expect(formatMillis(-5)).toBe('0:00');
  });
});

describe('peopleToCards', () => {
  it('maps people in order, with an image only when tagged', () => {
    const item: BaseItemDto = {
      People: [
        {
          Id: 'p1',
          Name: 'Amy Adams',
          Role: 'Louise Banks',
          Type: 'Actor',
          PrimaryImageTag: 'tag1',
        },
        {Id: 'p2', Name: 'Denis Villeneuve', Role: '', Type: 'Director'},
        {Id: 'p3', Name: 'Eric Heisserer', Type: 'Writer'},
      ],
    };

    const cards = peopleToCards(item, api);

    expect(cards.map((card) => [card.id, card.title, card.subtitle])).toEqual([
      ['p1', 'Amy Adams', 'Louise Banks'],
      ['p2', 'Denis Villeneuve', 'Director'],
      ['p3', 'Eric Heisserer', 'Writer'],
    ]);
    expect(cards[0].imageUri).toBe(
      'https://jf/Items/p1/Images/Primary?tag=tag1',
    );
    expect(imageApi.getItemImageUrlById).toHaveBeenCalledTimes(1);
    expect(imageApi.getItemImageUrlById).toHaveBeenCalledWith(
      'p1',
      'Primary',
      expect.objectContaining({tag: 'tag1', maxHeight: expect.any(Number)}),
    );
    expect(cards[1].imageUri).toBeUndefined();
    for (const card of cards) {
      expect(PLACEHOLDER_COLORS).toContain(card.placeholderColor);
    }
  });

  it('is empty without people', () => {
    expect(peopleToCards({}, api)).toEqual([]);
    expect(peopleToCards({People: []}, api)).toEqual([]);
  });
});

import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type {MediaSourceInfo} from '@jellyfin/sdk/lib/generated-client/models/media-source-info';
import type {MediaStream} from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import {getImageApi} from '@jellyfin/sdk/lib/utils/api/image-api';

import {
  audioCodecName,
  detailsInfoItems,
  detailsTitles,
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
  seasonPlayTarget,
  seriesShowsResume,
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

describe('infoRowEntries per type', () => {
  const now = new Date(2024, 0, 3, 21, 30);

  it('shows an episode as S1:E2, then the date, rating and badges', () => {
    const item: BaseItemDto = {
      Type: 'Episode',
      CommunityRating: 8.1,
      ParentIndexNumber: 1,
      IndexNumber: 2,
      PremiereDate: new Date(2004, 8, 29).toISOString(),
      OfficialRating: 'TV-14',
      MediaSources: [source(video({Width: 1280, Height: 720}))],
    };

    expect(infoRowEntries(item)).toEqual([
      {kind: 'communityRating', value: 8.1},
      {kind: 'text', text: 'S1:E2'},
      {kind: 'text', text: 'Sep 29, 2004'},
      {kind: 'text', text: 'TV-14'},
      {kind: 'badge', text: '720p'},
    ]);
  });

  it('names double episodes, specials and unnumbered episodes', () => {
    const text = (item: BaseItemDto) =>
      infoRowEntries({Type: 'Episode', ...item});
    expect(
      text({ParentIndexNumber: 2, IndexNumber: 3, IndexNumberEnd: 4}),
    ).toEqual([{kind: 'text', text: 'S2:E3–4'}]);
    expect(text({ParentIndexNumber: 0, IndexNumber: 1})).toEqual([
      {kind: 'text', text: 'Special'},
    ]);
    expect(text({IndexNumber: 5})).toEqual([{kind: 'text', text: 'E5'}]);
    expect(text({ParentIndexNumber: 3})).toEqual([{kind: 'text', text: 'S3'}]);
    expect(text({})).toEqual([]);
  });

  it('shows a series with its production year and status', () => {
    const item: BaseItemDto = {
      Type: 'Series',
      CommunityRating: 8.3,
      CriticRating: 81,
      PremiereDate: new Date(2004, 8, 22).toISOString(),
      ProductionYear: 2004,
      Status: 'Ended',
      OfficialRating: 'TV-14',
    };

    expect(infoRowEntries(item)).toEqual([
      {kind: 'communityRating', value: 8.3},
      {kind: 'criticRating', value: 81},
      {kind: 'text', text: '2004'},
      {kind: 'text', text: 'Ended'},
      {kind: 'text', text: 'TV-14'},
    ]);
  });

  it('names each series status and skips unknown ones', () => {
    const status = (Status?: string) =>
      infoRowEntries({Type: 'Series', Status});
    expect(status('Continuing')).toEqual([{kind: 'text', text: 'Continuing'}]);
    expect(status('Unreleased')).toEqual([
      {kind: 'text', text: 'Not yet released'},
    ]);
    expect(status('Cancelled')).toEqual([]);
    expect(status(undefined)).toEqual([]);
  });

  it('shows a season like a movie', () => {
    expect(
      infoRowEntries({
        Type: 'Season',
        PremiereDate: new Date(2005, 8, 21).toISOString(),
        ProductionYear: 2005,
      }),
    ).toEqual([{kind: 'text', text: 'Sep 21, 2005'}]);
    expect(infoRowEntries({Type: 'Season', ProductionYear: 2005})).toEqual([
      {kind: 'text', text: '2005'},
    ]);
  });

  it("shows a living person's birthday and age", () => {
    const item: BaseItemDto = {
      Type: 'Person',
      PremiereDate: new Date(1974, 7, 20).toISOString(),
      ProductionLocations: ['Lafayette, California, USA'],
    };

    expect(infoRowEntries(item, now)).toEqual([
      {kind: 'text', text: 'Born Aug 20, 1974 (49)'},
      {kind: 'text', text: 'Lafayette, California, USA'},
    ]);
  });

  it('counts the age on the birthday', () => {
    const born = (date: Date) =>
      infoRowEntries(
        {Type: 'Person', PremiereDate: date.toISOString()},
        new Date(2024, 0, 3),
      );
    expect(born(new Date(2000, 0, 3))).toEqual([
      {kind: 'text', text: 'Born Jan 3, 2000 (24)'},
    ]);
    expect(born(new Date(2000, 0, 4))).toEqual([
      {kind: 'text', text: 'Born Jan 4, 2000 (23)'},
    ]);
  });

  it("shows a dead person's age at death and the date", () => {
    const item: BaseItemDto = {
      Type: 'Person',
      PremiereDate: new Date(1928, 6, 26).toISOString(),
      EndDate: new Date(1999, 2, 7).toISOString(),
    };

    expect(infoRowEntries(item, now)).toEqual([
      {kind: 'text', text: 'Born Jul 26, 1928 (70)'},
      {kind: 'text', text: 'Died Mar 7, 1999'},
    ]);
  });

  it('shows nothing for a person without dates or a birthplace', () => {
    expect(infoRowEntries({Type: 'Person', ProductionYear: 1970})).toEqual([]);
    expect(
      infoRowEntries({Type: 'Person', ProductionLocations: ['  ']}),
    ).toEqual([]);
    expect(
      infoRowEntries({Type: 'Person', PremiereDate: 'not a date'}),
    ).toEqual([]);
  });

  it('keeps a movie as before', () => {
    const item: BaseItemDto = {
      PremiereDate: new Date(2016, 10, 11).toISOString(),
      ProductionYear: 2016,
      Status: 'Ended',
      ParentIndexNumber: 1,
      IndexNumber: 2,
    };
    const expected = [{kind: 'text', text: 'Nov 11, 2016'}];
    expect(infoRowEntries(item)).toEqual(expected);
    expect(infoRowEntries({...item, Type: 'Movie'})).toEqual(expected);
  });
});

describe('detailsInfoItems per type', () => {
  const now = new Date(2024, 0, 3, 21, 30);

  it('shows the season count first for a series', () => {
    const item: BaseItemDto = {
      Type: 'Series',
      ChildCount: 6,
      RunTimeTicks: 42 * MINUTE_TICKS,
      People: [{Name: 'J. J. Abrams', Type: 'Director'}],
    };

    expect(detailsInfoItems(item, {now, use24Hour: true})).toEqual([
      {label: 'Seasons', value: '6'},
      {label: 'Runs', value: '42m'},
      {label: 'Ends', value: '22:12'},
    ]);
  });

  it('shows 0 seasons without a count', () => {
    expect(detailsInfoItems({Type: 'Series'}, {now, use24Hour: true})).toEqual([
      {label: 'Seasons', value: '0'},
    ]);
  });

  it('shows nothing for a person', () => {
    expect(
      detailsInfoItems(
        {Type: 'Person', RunTimeTicks: 42 * MINUTE_TICKS},
        {now, use24Hour: true},
      ),
    ).toEqual([]);
  });

  it('shows Directed by for an episode', () => {
    expect(
      detailsInfoItems(
        {Type: 'Episode', People: [{Name: 'Jack Bender', Type: 'Director'}]},
        {now, use24Hour: true},
      ),
    ).toEqual([{label: 'Directed by', value: 'Jack Bender'}]);
  });
});

describe('detailsTitles', () => {
  it('shows an episode name over the series and number', () => {
    expect(
      detailsTitles({
        Type: 'Episode',
        Name: 'Pilot (2)',
        SeriesName: 'Lost',
        ParentIndexNumber: 1,
        IndexNumber: 2,
      }),
    ).toEqual({title: 'Pilot (2)', subtitle: 'Lost S1 E2'});
  });

  it('shows only the number for an episode without a series name', () => {
    expect(
      detailsTitles({
        Type: 'Episode',
        Name: 'Pilot',
        ParentIndexNumber: 1,
        IndexNumber: 1,
      }),
    ).toEqual({title: 'Pilot', subtitle: 'S1 E1'});
    expect(detailsTitles({Type: 'Episode', Name: 'Pilot'})).toEqual({
      title: 'Pilot',
      subtitle: undefined,
    });
  });

  it('shows a season name over its series', () => {
    expect(
      detailsTitles({Type: 'Season', Name: 'Season 1', SeriesName: 'Lost'}),
    ).toEqual({title: 'Season 1', subtitle: 'Lost'});
  });

  it('shows only the name for a season without a series name', () => {
    expect(detailsTitles({Type: 'Season', Name: 'Season 1'})).toEqual({
      title: 'Season 1',
      subtitle: undefined,
    });
    expect(
      detailsTitles({Type: 'Season', Name: 'Season 1', SeriesName: ' '}),
    ).toEqual({title: 'Season 1', subtitle: undefined});
  });

  it('shows only the name for anything else', () => {
    expect(detailsTitles({Type: 'Movie', Name: 'Arrival'})).toEqual({
      title: 'Arrival',
    });
    expect(detailsTitles({Type: 'Series', Name: 'Lost'})).toEqual({
      title: 'Lost',
    });
    expect(detailsTitles({Type: 'Person', Name: 'Amy Adams'})).toEqual({
      title: 'Amy Adams',
    });
    expect(detailsTitles({})).toEqual({title: ''});
  });
});

describe('peopleToCards with kinds', () => {
  const item: BaseItemDto = {
    People: [
      {Id: 'p1', Name: 'Matthew Fox', Type: 'Actor'},
      {Id: 'p2', Name: 'Guest One', Role: 'Pilot', Type: 'GuestStar'},
      {Id: 'p3', Name: 'Jack Bender', Type: 'Director'},
      {Id: 'p4', Name: 'Guest Two', Type: 'GuestStar'},
      {Id: 'p5', Name: 'No Kind'},
    ],
  };

  it('keeps only guest stars, in order', () => {
    expect(
      peopleToCards(item, api, ['GuestStar']).map((card) => [
        card.id,
        card.subtitle,
      ]),
    ).toEqual([
      ['p2', 'Pilot'],
      ['p4', 'GuestStar'],
    ]);
  });

  it('keeps everyone without kinds, and no one with none', () => {
    expect(peopleToCards(item, api)).toHaveLength(5);
    expect(peopleToCards(item, api, [])).toEqual([]);
  });
});

describe('seasonPlayTarget', () => {
  const ep = (id: string, played?: boolean): BaseItemDto => ({
    Id: id,
    UserData: played === undefined ? undefined : {Key: id, Played: played},
  });

  it('picks the first episode when none is played', () => {
    expect(seasonPlayTarget([ep('e1', false), ep('e2')])?.Id).toBe('e1');
  });

  it('picks the first unplayed episode', () => {
    expect(
      seasonPlayTarget([ep('e1', true), ep('e2', false), ep('e3', false)])?.Id,
    ).toBe('e2');
    expect(
      seasonPlayTarget([ep('e1', true), ep('e2', true), ep('e3')])?.Id,
    ).toBe('e3');
  });

  it('picks the first episode when all are played', () => {
    expect(seasonPlayTarget([ep('e1', true), ep('e2', true)])?.Id).toBe('e1');
  });

  it('has nothing to play in an empty season', () => {
    expect(seasonPlayTarget([])).toBeUndefined();
  });
});

describe('seriesShowsResume', () => {
  const series = (userData: Partial<NonNullable<BaseItemDto['UserData']>>) => ({
    Type: 'Series' as const,
    UserData: {Key: 's', ...userData},
  });
  const nextUp = (ticks: number): BaseItemDto => ({
    Id: 'e2',
    UserData: {Key: 'e2', PlaybackPositionTicks: ticks},
  });

  it('shows Resume for a partly watched series', () => {
    expect(seriesShowsResume(series({PlayedPercentage: 40}))).toBe(true);
    expect(seriesShowsResume(series({PlayedPercentage: 40}), nextUp(0))).toBe(
      true,
    );
  });

  it('shows Resume when the next-up episode has a position', () => {
    expect(seriesShowsResume(series({}), nextUp(MINUTE_TICKS))).toBe(true);
  });

  it('hides Resume for an unstarted series', () => {
    expect(seriesShowsResume(series({}))).toBe(false);
    expect(seriesShowsResume(series({}), nextUp(0))).toBe(false);
    expect(seriesShowsResume(series({}), null)).toBe(false);
    expect(seriesShowsResume({Type: 'Series'})).toBe(false);
  });

  it('hides Resume for a finished series', () => {
    expect(
      seriesShowsResume(
        series({Played: true, PlayedPercentage: 40}),
        nextUp(MINUTE_TICKS),
      ),
    ).toBe(false);
  });
});

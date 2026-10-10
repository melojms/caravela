import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type {UserItemDataDto} from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {LocationType} from '@jellyfin/sdk/lib/generated-client/models/location-type';

import {createJellyfin} from '../../src/api/client';
import {
  BACKDROP_MAX_WIDTH,
  cardImageSize,
  cardText,
  IMAGE_QUALITY,
  PLACEHOLDER_COLORS,
  placeholderColor,
  toCardItem,
  type ToCardItemOptions,
} from '../../src/api/items';
import {BASELINE_SCALE, layout} from '../../src/theme';

const SERVER = 'https://jf.example.com';
const api = createJellyfin('device-1').createApi(SERVER, 'token-1');

const poster = {variant: 'poster'} as const;
const landscape = {variant: 'landscape', preferParentThumb: true} as const;

/** Parses an image URL into its item ID, image type and query params. */
const parseImage = (uri?: string) => {
  expect(uri).toBeDefined();
  const [path, query = ''] = (uri as string).slice(SERVER.length).split('?');
  const [, , itemId, , type] = path.split('/');
  const params = Object.fromEntries(
    query
      .split('&')
      .filter(Boolean)
      .map((pair) => pair.split('=').map(decodeURIComponent)),
  );
  return {itemId, type, params};
};

const imageOf = (item: BaseItemDto, options: ToCardItemOptions = poster) => {
  const {imageUri} = toCardItem(item, api, options);
  return imageUri ? parseImage(imageUri) : undefined;
};

const episode = (extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: 'ep1',
  Type: BaseItemKind.Episode,
  Name: 'Pilot',
  SeriesName: 'Lost',
  SeriesId: 'series1',
  ParentIndexNumber: 1,
  IndexNumber: 2,
  ...extra,
});

describe('toCardItem titles and subtitles', () => {
  const text = (item: BaseItemDto) => {
    const {title, subtitle} = toCardItem(item, api, poster);
    return {title, subtitle};
  };

  it('shows a movie with its official rating', () => {
    expect(
      text({
        Id: 'm',
        Type: BaseItemKind.Movie,
        Name: 'Dune',
        ProductionYear: 2021,
        OfficialRating: 'PG-13',
      }),
    ).toEqual({title: 'Dune', subtitle: 'PG-13'});
  });

  it('shows no subtitle without an official rating', () => {
    expect(text({Id: 'm', Type: BaseItemKind.Movie, Name: 'Dune'})).toEqual({
      title: 'Dune',
      subtitle: undefined,
    });
    expect(
      text({
        Id: 'm',
        Type: BaseItemKind.Movie,
        Name: 'Dune',
        OfficialRating: '',
      }).subtitle,
    ).toBeUndefined();
  });

  it('shows a series with its official rating', () => {
    expect(
      text({
        Id: 's',
        Type: BaseItemKind.Series,
        Name: 'Lost',
        Status: 'Ended',
        OfficialRating: 'TV-14',
      }),
    ).toEqual({title: 'Lost', subtitle: 'TV-14'});
  });

  it('shows another kind with its official rating', () => {
    expect(
      text({
        Id: 'b',
        Type: BaseItemKind.BoxSet,
        Name: 'Alien',
        OfficialRating: 'R',
      }),
    ).toEqual({title: 'Alien', subtitle: 'R'});
  });

  it('shows a season with its episode count', () => {
    const season = {Id: 's1', Type: BaseItemKind.Season, Name: 'Season 1'};
    expect(text({...season, ChildCount: 12})).toEqual({
      title: 'Season 1',
      subtitle: '12 episodes',
    });
    expect(text({...season, ChildCount: 1}).subtitle).toBe('1 episode');
    expect(text({...season, ChildCount: 0}).subtitle).toBeUndefined();
    expect(text(season).subtitle).toBeUndefined();
  });

  it('shows an episode as series, season and episode, then its name', () => {
    expect(text(episode())).toEqual({title: 'Lost S1 E2', subtitle: 'Pilot'});
  });

  it('shows an episode range with an en dash', () => {
    expect(text(episode({IndexNumberEnd: 3})).title).toBe('Lost S1 E2–3');
  });

  it('handles missing season or episode numbers', () => {
    expect(text(episode({ParentIndexNumber: null})).title).toBe('Lost E2');
    expect(text(episode({IndexNumber: null})).title).toBe('Lost S1');
    expect(text(episode({IndexNumber: null, IndexNumberEnd: 3})).title).toBe(
      'Lost S1',
    );
    expect(
      text(episode({ParentIndexNumber: null, IndexNumber: null})).title,
    ).toBe('Lost');
  });

  it('labels season 0 episodes as special', () => {
    expect(text(episode({ParentIndexNumber: 0})).title).toBe('Lost special');
  });

  it('leaves out a missing series name', () => {
    expect(text(episode({SeriesName: null})).title).toBe('S1 E2');
    expect(text(episode({SeriesName: '  '})).title).toBe('S1 E2');
  });

  it('falls back to the episode name when there is nothing else', () => {
    expect(
      text(
        episode({SeriesName: null, ParentIndexNumber: null, IndexNumber: null}),
      ).title,
    ).toBe('Pilot');
  });

  it('has no subtitle for an episode without a name', () => {
    expect(text(episode({Name: null})).subtitle).toBeUndefined();
  });

  describe('virtual (upcoming) episodes', () => {
    // Dates are built in local time, so the expectations hold in any timezone.
    const local = (
      month: number,
      day: number,
      hour = 0,
      minute = 0,
      year = 2026,
    ) => new Date(year, month - 1, day, hour, minute).toISOString();
    const now = new Date(2026, 9, 10, 15); // Saturday 10 October 2026, 15:00
    const upcoming = (PremiereDate: string, extra: Partial<BaseItemDto> = {}) =>
      cardText(
        episode({LocationType: LocationType.Virtual, PremiereDate, ...extra}),
        now,
      ).subtitle;

    it('adds Today, Tomorrow or a weekday within the week', () => {
      expect(upcoming(local(10, 10))).toBe('Pilot (Today)');
      expect(upcoming(local(10, 10, 23, 59))).toBe('Pilot (Today)');
      expect(upcoming(local(10, 11))).toBe('Pilot (Tomorrow)');
      expect(upcoming(local(10, 14))).toBe('Pilot (Wed)');
      expect(upcoming(local(10, 16))).toBe('Pilot (Fri)');
    });

    it('adds a short date and time otherwise', () => {
      expect(upcoming(local(10, 17, 21, 5))).toBe('Pilot (10/17/26, 9:05 PM)');
      expect(upcoming(local(10, 1))).toBe('Pilot (10/1/26, 12:00 AM)');
      expect(upcoming(local(1, 2, 12, 30, 2027))).toBe(
        'Pilot (1/2/27, 12:30 PM)',
      );
    });

    it("keeps androidtv's quirk: Tomorrow doesn't cross a new year", () => {
      const newYearsEve = new Date(2026, 11, 31, 12);
      expect(
        cardText(
          episode({
            LocationType: LocationType.Virtual,
            PremiereDate: local(1, 1, 0, 0, 2027),
          }),
          newYearsEve,
        ).subtitle,
      ).toBe('Pilot (1/1/27, 12:00 AM)');
    });

    it('shows a UTC premiere date in local time', () => {
      const premiere = '2026-10-20T00:00:00Z';
      const date = new Date(premiere);
      const hour = date.getHours() % 12 || 12;
      const minutes = `${date.getMinutes()}`.padStart(2, '0');
      const period = date.getHours() < 12 ? 'AM' : 'PM';
      expect(upcoming(premiere)).toBe(
        `Pilot (${
          date.getMonth() + 1
        }/${date.getDate()}/26, ${hour}:${minutes} ${period})`,
      );
    });

    it('shows only the name without a date, or when not virtual', () => {
      expect(upcoming('')).toBe('Pilot');
      expect(upcoming('not a date')).toBe('Pilot');
      expect(
        cardText(
          episode({
            LocationType: LocationType.FileSystem,
            PremiereDate: local(10, 10),
          }),
          now,
        ).subtitle,
      ).toBe('Pilot');
    });
  });

  it.each([BaseItemKind.CollectionFolder, BaseItemKind.UserView])(
    'shows a %s library by name only',
    (Type) => {
      expect(
        text({Id: 'v', Type, Name: 'Movies', OfficialRating: 'PG'}),
      ).toEqual({
        title: 'Movies',
        subtitle: undefined,
      });
    },
  );
});

describe('toCardItem progress and played', () => {
  const card = (userData?: Partial<UserItemDataDto>) =>
    toCardItem(
      {
        Id: 'm',
        Type: BaseItemKind.Movie,
        Name: 'Dune',
        UserData: userData && {Key: 'k', ItemId: 'm', ...userData},
      },
      api,
      poster,
    );

  it.each([
    [0, undefined],
    [50, 0.5],
    [100, undefined],
    [undefined, undefined],
  ])('maps PlayedPercentage %p to progress %p', (percent, progress) => {
    expect(card({PlayedPercentage: percent}).progress).toBe(progress);
  });

  it('has no progress without user data', () => {
    expect(card(undefined).progress).toBeUndefined();
  });

  it('copies played', () => {
    expect(card({Played: true}).played).toBe(true);
    expect(card({Played: false}).played).toBe(false);
    expect(card(undefined).played).toBe(false);
  });
});

describe('toCardItem images', () => {
  it('builds URLs on the server with tag, size and quality', () => {
    const image = imageOf({
      Id: 'm',
      Type: BaseItemKind.Movie,
      ImageTags: {Primary: 'p-tag'},
    });
    expect(image).toEqual({
      itemId: 'm',
      type: 'Primary',
      params: {
        tag: 'p-tag',
        maxHeight: `${layout.posterCard.height * BASELINE_SCALE}`,
        quality: `${IMAGE_QUALITY}`,
      },
    });
    expect(
      toCardItem({Id: 'm', ImageTags: {Primary: 'p'}}, api, poster).imageUri,
    ).toMatch(new RegExp(`^${SERVER}/Items/m/Images/Primary\\?`));
  });

  it('sizes images for the 1080p card, never larger', () => {
    expect(cardImageSize('poster')).toEqual({maxHeight: 312});
    expect(cardImageSize('landscape')).toEqual({maxWidth: 400});
  });

  describe('landscape (Continue Watching, Next Up)', () => {
    const full = {
      Id: 'm',
      Type: BaseItemKind.Movie,
      ImageTags: {Thumb: 'thumb', Primary: 'primary'},
      ParentThumbItemId: 'parent',
      ParentThumbImageTag: 'parent-thumb',
      SeriesId: 'series',
      SeriesThumbImageTag: 'series-thumb',
      BackdropImageTags: ['backdrop'],
    };

    it('uses the item thumb first', () => {
      expect(imageOf(full, landscape)).toMatchObject({
        itemId: 'm',
        type: 'Thumb',
      });
      expect(imageOf(full, landscape)?.params.maxWidth).toBe('400');
    });

    it('then the parent thumb', () => {
      expect(
        imageOf({...full, ImageTags: {Primary: 'primary'}}, landscape),
      ).toMatchObject({
        itemId: 'parent',
        type: 'Thumb',
        params: {tag: 'parent-thumb'},
      });
    });

    it('then the series thumb', () => {
      expect(
        imageOf(
          {...full, ImageTags: {Primary: 'primary'}, ParentThumbItemId: null},
          landscape,
        ),
      ).toMatchObject({
        itemId: 'series',
        type: 'Thumb',
        params: {tag: 'series-thumb'},
      });
    });

    it('then a backdrop', () => {
      expect(
        imageOf(
          {
            ...full,
            ImageTags: {Primary: 'primary'},
            ParentThumbItemId: null,
            SeriesThumbImageTag: null,
          },
          landscape,
        ),
      ).toMatchObject({
        itemId: 'm',
        type: 'Backdrop',
        params: {tag: 'backdrop', imageIndex: '0'},
      });
    });

    it('then the parent backdrop', () => {
      expect(
        imageOf(
          {
            Id: 'm',
            Type: BaseItemKind.Movie,
            ImageTags: {Primary: 'primary'},
            ParentBackdropItemId: 'parent',
            ParentBackdropImageTags: ['pb'],
          },
          landscape,
        ),
      ).toMatchObject({
        itemId: 'parent',
        type: 'Backdrop',
        params: {tag: 'pb'},
      });
    });

    it('then Primary', () => {
      expect(
        imageOf(
          {Id: 'm', Type: BaseItemKind.Movie, ImageTags: {Primary: 'primary'}},
          landscape,
        ),
      ).toMatchObject({itemId: 'm', type: 'Primary'});
    });

    it('puts the series thumb before an episode still, like androidtv', () => {
      const ep = episode({
        ImageTags: {Primary: 'still'},
        SeriesThumbImageTag: 'series-thumb',
      });
      expect(imageOf(ep, landscape)).toMatchObject({
        itemId: 'series1',
        type: 'Thumb',
      });
    });

    it('uses an episode still before a backdrop', () => {
      const ep = episode({
        ImageTags: {Primary: 'still'},
        ParentBackdropItemId: 'series1',
        ParentBackdropImageTags: ['pb'],
      });
      expect(imageOf(ep, landscape)).toMatchObject({
        itemId: 'ep1',
        type: 'Primary',
      });
    });
  });

  describe('poster', () => {
    it('uses Primary', () => {
      expect(
        imageOf({
          Id: 'm',
          Type: BaseItemKind.Movie,
          ImageTags: {Primary: 'p', Thumb: 't'},
        }),
      ).toMatchObject({itemId: 'm', type: 'Primary', params: {tag: 'p'}});
    });

    it('uses the series poster for an episode without one', () => {
      expect(imageOf(episode({SeriesPrimaryImageTag: 'sp'}))).toMatchObject({
        itemId: 'series1',
        type: 'Primary',
        params: {tag: 'sp'},
      });
    });

    it("doesn't use a series poster for a movie", () => {
      expect(
        imageOf({
          Id: 'm',
          Type: BaseItemKind.Movie,
          SeriesId: 's',
          SeriesPrimaryImageTag: 'sp',
        }),
      ).toBeUndefined();
    });
  });

  it("uses a library's Primary, even in a landscape row", () => {
    const view = {
      Id: 'v',
      Type: BaseItemKind.CollectionFolder,
      Name: 'Movies',
      ImageTags: {Primary: 'vp', Thumb: 'vt'},
    };
    expect(imageOf(view, landscape)).toMatchObject({
      itemId: 'v',
      type: 'Primary',
    });
  });

  it('leaves imageUri undefined without any image and keeps a placeholder colour', () => {
    const card = toCardItem(
      {Id: 'm', Type: BaseItemKind.Movie, Name: 'Dune'},
      api,
      landscape,
    );
    expect(card.imageUri).toBeUndefined();
    expect(PLACEHOLDER_COLORS).toContain(card.placeholderColor);
  });

  it('ignores an image type without a tag', () => {
    expect(imageOf({Id: 'm', ImageTags: {}})).toBeUndefined();
  });
});

describe('placeholderColor', () => {
  it('is stable for an ID', () => {
    expect(placeholderColor('abc')).toBe(placeholderColor('abc'));
  });

  it('spreads IDs over the palette', () => {
    const ids = Array.from({length: 50}, (_, i) => `item-${i}`);
    expect(new Set(ids.map(placeholderColor)).size).toBeGreaterThan(1);
  });
});

describe('backdropUris', () => {
  const backdrops = (item: BaseItemDto) =>
    (toCardItem(item, api, poster).backdropUris ?? []).map(parseImage);

  it("lists the item's backdrops, then the parent's", () => {
    const result = backdrops({
      Id: 'ep',
      BackdropImageTags: ['b0', 'b1'],
      ParentBackdropItemId: 'series',
      ParentBackdropImageTags: ['pb0'],
    });
    expect(
      result.map((r) => [r.itemId, r.params.tag, r.params.imageIndex]),
    ).toEqual([
      ['ep', 'b0', '0'],
      ['ep', 'b1', '1'],
      ['series', 'pb0', '0'],
    ]);
    expect(result[0].params.maxWidth).toBe(`${BACKDROP_MAX_WIDTH}`);
    expect(result.every((r) => r.type === 'Backdrop')).toBe(true);
  });

  it("uses only the parent's when the item has none", () => {
    expect(
      backdrops({
        Id: 'ep',
        ParentBackdropItemId: 'series',
        ParentBackdropImageTags: ['pb0'],
      }).map((r) => r.itemId),
    ).toEqual(['series']);
  });

  it('is empty when there are none', () => {
    expect(backdrops({Id: 'm'})).toEqual([]);
    expect(backdrops({Id: 'm', ParentBackdropImageTags: ['orphan']})).toEqual(
      [],
    );
  });
});

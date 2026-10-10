import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type {UserItemDataDto} from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';

import {createJellyfin} from '../../src/api/client';
import {
  BACKDROP_MAX_WIDTH,
  cardImageSize,
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

  it('shows a movie with its production year', () => {
    expect(
      text({
        Id: 'm',
        Type: BaseItemKind.Movie,
        Name: 'Dune',
        ProductionYear: 2021,
      }),
    ).toEqual({title: 'Dune', subtitle: '2021'});
  });

  it('shows a movie without a year with no subtitle', () => {
    expect(text({Id: 'm', Type: BaseItemKind.Movie, Name: 'Dune'})).toEqual({
      title: 'Dune',
      subtitle: undefined,
    });
  });

  it('shows an ended series with its year range', () => {
    expect(
      text({
        Id: 's',
        Type: BaseItemKind.Series,
        Name: 'Lost',
        ProductionYear: 2004,
        EndDate: '2010-05-23T00:00:00.0000000Z',
        Status: 'Ended',
      }).subtitle,
    ).toBe('2004 – 2010');
  });

  it('shows a continuing series as running to Present', () => {
    expect(
      text({
        Id: 's',
        Type: BaseItemKind.Series,
        Name: 'Severance',
        ProductionYear: 2022,
        Status: 'Continuing',
      }).subtitle,
    ).toBe('2022 – Present');
  });

  it('shows one year for an ended series without an end date or ending the year it started', () => {
    const base = {
      Id: 's',
      Type: BaseItemKind.Series,
      Name: 'X',
      ProductionYear: 2019,
    };
    expect(text({...base, Status: 'Ended'}).subtitle).toBe('2019');
    expect(text({...base, EndDate: '2019-12-01T00:00:00Z'}).subtitle).toBe(
      '2019',
    );
  });

  it('shows no subtitle for a series without any year', () => {
    expect(
      text({Id: 's', Type: BaseItemKind.Series, Name: 'X'}).subtitle,
    ).toBeUndefined();
  });

  it('shows an episode as the series, then season, episode and name', () => {
    expect(text(episode())).toEqual({title: 'Lost', subtitle: 'S1:E2 · Pilot'});
  });

  it('shows an episode range', () => {
    expect(text(episode({IndexNumberEnd: 3})).subtitle).toBe('S1:E2-3 · Pilot');
  });

  it('handles missing season or episode numbers', () => {
    expect(text(episode({ParentIndexNumber: null})).subtitle).toBe(
      'E2 · Pilot',
    );
    expect(text(episode({IndexNumber: null})).subtitle).toBe('S1 · Pilot');
    expect(
      text(episode({ParentIndexNumber: null, IndexNumber: null})).subtitle,
    ).toBe('Pilot');
  });

  it('labels season 0 episodes as specials', () => {
    expect(text(episode({ParentIndexNumber: 0})).subtitle).toBe(
      'Special · Pilot',
    );
  });

  it('falls back to the episode name when the series name is missing', () => {
    expect(text(episode({SeriesName: null}))).toEqual({
      title: 'Pilot',
      subtitle: 'S1:E2',
    });
  });

  it.each([BaseItemKind.CollectionFolder, BaseItemKind.UserView])(
    'shows a %s library by name only',
    (Type) => {
      expect(
        text({Id: 'v', Type, Name: 'Movies', ProductionYear: 2020}),
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

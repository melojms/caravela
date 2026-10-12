import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {getLibraryApi} from '@jellyfin/sdk/lib/utils/api/library-api';
import {getShowApi} from '@jellyfin/sdk/lib/utils/api/show-api';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {renderHook, waitFor} from '@testing-library/react-native';
import React, {type ReactNode} from 'react';

import {detailsKeys, ITEM_FIELDS} from '../../src/api/details';
import {
  fetchNextEpisodes,
  fetchPersonItems,
  fetchPreviousEpisode,
  fetchSeasonEpisodes,
  fetchSeasons,
  fetchSeriesNextUp,
  NEXT_EPISODES_LIMIT,
  PERSON_ITEMS_LIMIT,
  tvDetailsKeys,
  useNextEpisodes,
  usePersonItems,
  usePreviousEpisode,
  useSeasonEpisodes,
  useSeasons,
  useSeriesNextUp,
} from '../../src/api/tvDetails';
import {useSession} from '../../src/auth/SessionContext';
import {sessionFor} from '../auth/fakes';

jest.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({
  getLibraryApi: jest.fn(),
}));
jest.mock('@jellyfin/sdk/lib/utils/api/show-api', () => ({
  getShowApi: jest.fn(),
}));
jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

const libraryApi = {getItems: jest.fn()};
const showApi = {
  getSeasons: jest.fn(),
  getEpisodes: jest.fn(),
  getNextUp: jest.fn(),
};

const session = sessionFor();
const {api} = session;
const SERVER_ID = session.server.id;
const USER_ID = 'u1';

const episode = (
  id: string,
  fields: Partial<BaseItemDto> = {},
): BaseItemDto => ({
  Id: id,
  Type: 'Episode',
  SeriesId: 'series1',
  SeasonId: 'season1',
  ...fields,
});

const E1 = episode('e1', {IndexNumber: 1});
const E2 = episode('e2', {IndexNumber: 2});
const E3 = episode('e3', {IndexNumber: 3});

let client: QueryClient;

const wrapper = ({children}: {children: ReactNode}) =>
  React.createElement(QueryClientProvider, {client}, children);

beforeEach(() => {
  jest.clearAllMocks();
  (getLibraryApi as jest.Mock).mockReturnValue(libraryApi);
  (getShowApi as jest.Mock).mockReturnValue(showApi);
  (useSession as jest.Mock).mockReturnValue({session});
  client = new QueryClient({
    defaultOptions: {queries: {retry: false, gcTime: Infinity}},
  });
});

afterEach(() => client.clear());

describe('fetchSeasons', () => {
  it("asks the show API for the series' seasons", async () => {
    const seasons = [{Id: 's1'}, {Id: 's2'}];
    showApi.getSeasons.mockResolvedValue({data: {Items: seasons}});

    await expect(fetchSeasons(api, 'u1', 'series1')).resolves.toBe(seasons);
    expect(getShowApi).toHaveBeenCalledWith(api);
    expect(showApi.getSeasons).toHaveBeenCalledWith({
      seriesId: 'series1',
      userId: 'u1',
      fields: ITEM_FIELDS,
    });
  });

  it('returns no seasons when the server sends none', async () => {
    showApi.getSeasons.mockResolvedValue({data: {}});
    await expect(fetchSeasons(api, 'u1', 'series1')).resolves.toEqual([]);
  });
});

describe('fetchSeasonEpisodes', () => {
  it("asks for the season's present episodes in order", async () => {
    showApi.getEpisodes.mockResolvedValue({data: {Items: [E1, E2]}});

    await expect(
      fetchSeasonEpisodes(api, 'u1', 'series1', 'season1'),
    ).resolves.toEqual([E1, E2]);
    expect(showApi.getEpisodes).toHaveBeenCalledWith({
      seriesId: 'series1',
      seasonId: 'season1',
      userId: 'u1',
      isMissing: false,
      sortBy: 'SortName',
      fields: ITEM_FIELDS,
    });
  });

  it('returns no episodes when the server sends none', async () => {
    showApi.getEpisodes.mockResolvedValue({data: {}});
    await expect(
      fetchSeasonEpisodes(api, 'u1', 'series1', 'season1'),
    ).resolves.toEqual([]);
  });
});

describe('fetchSeriesNextUp', () => {
  it("asks for the series' next up", async () => {
    showApi.getNextUp.mockResolvedValue({data: {Items: [E2]}});

    await expect(fetchSeriesNextUp(api, 'u1', 'series1')).resolves.toEqual([
      E2,
    ]);
    expect(showApi.getNextUp).toHaveBeenCalledWith({
      userId: 'u1',
      seriesId: 'series1',
      fields: ITEM_FIELDS,
    });
  });

  it('returns nothing when the server sends none', async () => {
    showApi.getNextUp.mockResolvedValue({data: {}});
    await expect(fetchSeriesNextUp(api, 'u1', 'series1')).resolves.toEqual([]);
  });
});

describe('fetchPreviousEpisode', () => {
  const siblings = (...items: BaseItemDto[]) =>
    showApi.getEpisodes.mockResolvedValue({data: {Items: items}});

  it('asks for the episodes adjacent to this one', async () => {
    siblings(E1, E2, E3);

    await fetchPreviousEpisode(api, 'u1', E2);
    expect(showApi.getEpisodes).toHaveBeenCalledWith({
      seriesId: 'series1',
      userId: 'u1',
      adjacentTo: 'e2',
      fields: ITEM_FIELDS,
    });
  });

  it('picks the one before a middle episode', async () => {
    siblings(E1, E2, E3);
    await expect(fetchPreviousEpisode(api, 'u1', E2)).resolves.toBe(E1);
  });

  it('has none for the first episode, not the next one', async () => {
    siblings(E1, E2);
    await expect(fetchPreviousEpisode(api, 'u1', E1)).resolves.toBeNull();
  });

  it('picks the one before the last episode', async () => {
    siblings(E2, E3);
    await expect(fetchPreviousEpisode(api, 'u1', E3)).resolves.toBe(E2);
  });

  it('has none for a single episode', async () => {
    siblings(E1);
    await expect(fetchPreviousEpisode(api, 'u1', E1)).resolves.toBeNull();
  });

  it('has none when the server leaves the episode out or sends nothing', async () => {
    siblings(E1, E3);
    await expect(fetchPreviousEpisode(api, 'u1', E2)).resolves.toBeNull();
    showApi.getEpisodes.mockResolvedValue({data: {}});
    await expect(fetchPreviousEpisode(api, 'u1', E2)).resolves.toBeNull();
  });

  it('crosses into the previous season', async () => {
    const lastOfS1 = episode('s1e9', {SeasonId: 'season0', IndexNumber: 9});
    const firstOfS2 = episode('s2e1', {IndexNumber: 1});
    siblings(lastOfS1, firstOfS2, E2);
    await expect(fetchPreviousEpisode(api, 'u1', firstOfS2)).resolves.toBe(
      lastOfS1,
    );
  });

  it('does not ask without a series id', async () => {
    await expect(
      fetchPreviousEpisode(api, 'u1', {Id: 'e2', Type: 'Episode'}),
    ).resolves.toBeNull();
    expect(showApi.getEpisodes).not.toHaveBeenCalled();
  });
});

describe('fetchNextEpisodes', () => {
  it("starts at the episode's number in its season", async () => {
    libraryApi.getItems.mockResolvedValue({data: {Items: [E3]}});

    await expect(fetchNextEpisodes(api, 'u1', 'season1', 2)).resolves.toEqual([
      E3,
    ]);
    expect(getLibraryApi).toHaveBeenCalledWith(api);
    expect(libraryApi.getItems).toHaveBeenCalledWith({
      userId: 'u1',
      parentId: 'season1',
      includeItemTypes: ['Episode'],
      startIndex: 2,
      limit: 20,
      fields: ITEM_FIELDS,
    });
    expect(NEXT_EPISODES_LIMIT).toBe(20);
  });

  it('returns nothing when the server sends none', async () => {
    libraryApi.getItems.mockResolvedValue({data: {}});
    await expect(fetchNextEpisodes(api, 'u1', 'season1', 2)).resolves.toEqual(
      [],
    );
  });
});

describe('fetchPersonItems', () => {
  it.each(['Movie', 'Series', 'Episode'] as const)(
    "asks for the person's %s items, newest first",
    async (kind) => {
      libraryApi.getItems.mockResolvedValue({data: {Items: [E1]}});

      await expect(
        fetchPersonItems(api, 'u1', 'person1', kind),
      ).resolves.toEqual([E1]);
      expect(libraryApi.getItems).toHaveBeenCalledWith({
        userId: 'u1',
        personIds: ['person1'],
        recursive: true,
        includeItemTypes: [kind],
        sortBy: ['PremiereDate', 'SortName'],
        sortOrder: ['Descending', 'Ascending'],
        limit: 100,
        fields: ITEM_FIELDS,
      });
    },
  );

  it('limits each row to 100 and returns nothing when the server sends none', async () => {
    expect(PERSON_ITEMS_LIMIT).toBe(100);
    libraryApi.getItems.mockResolvedValue({data: {}});
    await expect(
      fetchPersonItems(api, 'u1', 'person1', 'Movie'),
    ).resolves.toEqual([]);
  });
});

describe('tvDetailsKeys', () => {
  it('starts with the details keys of the server and user', () => {
    const all = detailsKeys.all('s', 'u');
    const keys = [
      tvDetailsKeys.seasons('s', 'u', 'x'),
      tvDetailsKeys.seasonEpisodes('s', 'u', 'x', 'y'),
      tvDetailsKeys.seriesNextUp('s', 'u', 'x'),
      tvDetailsKeys.previousEpisode('s', 'u', 'x'),
      tvDetailsKeys.nextEpisodes('s', 'u', 'x', 2),
      tvDetailsKeys.personItems('s', 'u', 'x', 'Movie'),
    ];
    for (const key of keys) {
      expect(key.slice(0, all.length)).toEqual([...all]);
    }
    // No two queries share a key.
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(
      keys.length,
    );
  });

  it("keeps a person's rows apart", () => {
    expect(tvDetailsKeys.personItems('s', 'u', 'p', 'Movie')).not.toEqual(
      tvDetailsKeys.personItems('s', 'u', 'p', 'Series'),
    );
  });
});

describe('hooks', () => {
  it('load seasons under their key', async () => {
    const seasons = [{Id: 's1'}];
    showApi.getSeasons.mockResolvedValue({data: {Items: seasons}});
    const {result} = renderHook(() => useSeasons('series1'), {wrapper});

    await waitFor(() => expect(result.current.data).toEqual(seasons));
    expect(
      client.getQueryData(tvDetailsKeys.seasons(SERVER_ID, USER_ID, 'series1')),
    ).toEqual(seasons);
  });

  it("load a season's episodes", async () => {
    showApi.getEpisodes.mockResolvedValue({data: {Items: [E1, E2]}});
    const {result} = renderHook(() => useSeasonEpisodes('series1', 'season1'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual([E1, E2]));
    expect(showApi.getEpisodes).toHaveBeenCalledWith(
      expect.objectContaining({seriesId: 'series1', seasonId: 'season1'}),
    );
  });

  it("load a series' next up", async () => {
    showApi.getNextUp.mockResolvedValue({data: {Items: [E2]}});
    const {result} = renderHook(() => useSeriesNextUp('series1'), {wrapper});

    await waitFor(() => expect(result.current.data).toEqual([E2]));
  });

  it('load the previous episode, null for the first', async () => {
    showApi.getEpisodes.mockResolvedValue({data: {Items: [E1, E2]}});
    const {result} = renderHook(() => usePreviousEpisode(E1), {wrapper});

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('load the next episodes from the episode', async () => {
    libraryApi.getItems.mockResolvedValue({data: {Items: [E3]}});
    const {result} = renderHook(() => useNextEpisodes(E2), {wrapper});

    await waitFor(() => expect(result.current.data).toEqual([E3]));
    expect(libraryApi.getItems).toHaveBeenCalledWith(
      expect.objectContaining({parentId: 'season1', startIndex: 2}),
    );
    expect(
      client.getQueryData(
        tvDetailsKeys.nextEpisodes(SERVER_ID, USER_ID, 'season1', 2),
      ),
    ).toEqual([E3]);
  });

  it("load a person's items per kind", async () => {
    libraryApi.getItems.mockResolvedValue({data: {Items: [E1]}});
    const {result} = renderHook(() => usePersonItems('person1', 'Episode'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual([E1]));
    expect(libraryApi.getItems).toHaveBeenCalledWith(
      expect.objectContaining({
        personIds: ['person1'],
        includeItemTypes: ['Episode'],
      }),
    );
  });

  it.each([
    ['without a season id', episode('e2', {SeasonId: null, IndexNumber: 2})],
    ['without an index number', episode('e2', {IndexNumber: null})],
    ['without an episode', undefined],
  ])('do not load next episodes %s', (_label, item) => {
    const {result} = renderHook(() => useNextEpisodes(item), {wrapper});

    expect(result.current.fetchStatus).toBe('idle');
    expect(libraryApi.getItems).not.toHaveBeenCalled();
  });

  it('load next episodes for episode 0', async () => {
    libraryApi.getItems.mockResolvedValue({data: {Items: [E1]}});
    const {result} = renderHook(
      () => useNextEpisodes(episode('e0', {IndexNumber: 0})),
      {wrapper},
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.getItems).toHaveBeenCalledWith(
      expect.objectContaining({startIndex: 0}),
    );
  });

  it('do not load the previous episode without a series id or episode', () => {
    const {result: noSeries} = renderHook(
      () => usePreviousEpisode(episode('e2', {SeriesId: null})),
      {wrapper},
    );
    const {result: noEpisode} = renderHook(
      () => usePreviousEpisode(undefined),
      {wrapper},
    );

    expect(noSeries.current.fetchStatus).toBe('idle');
    expect(noEpisode.current.fetchStatus).toBe('idle');
    expect(showApi.getEpisodes).not.toHaveBeenCalled();
  });

  it('do not load without ids', () => {
    const hooks = [
      renderHook(() => useSeasons(''), {wrapper}),
      renderHook(() => useSeasonEpisodes('series1', ''), {wrapper}),
      renderHook(() => useSeasonEpisodes('', 'season1'), {wrapper}),
      renderHook(() => useSeriesNextUp(''), {wrapper}),
      renderHook(() => usePersonItems('', 'Movie'), {wrapper}),
    ];

    for (const {result} of hooks) {
      expect(result.current.fetchStatus).toBe('idle');
    }
    expect(showApi.getSeasons).not.toHaveBeenCalled();
    expect(showApi.getEpisodes).not.toHaveBeenCalled();
    expect(showApi.getNextUp).not.toHaveBeenCalled();
    expect(libraryApi.getItems).not.toHaveBeenCalled();
  });

  it('do not load when signed out', () => {
    (useSession as jest.Mock).mockReturnValue({session: undefined});
    const hooks = [
      renderHook(() => useSeasons('series1'), {wrapper}),
      renderHook(() => useSeasonEpisodes('series1', 'season1'), {wrapper}),
      renderHook(() => useSeriesNextUp('series1'), {wrapper}),
      renderHook(() => usePreviousEpisode(E2), {wrapper}),
      renderHook(() => useNextEpisodes(E2), {wrapper}),
      renderHook(() => usePersonItems('person1', 'Series'), {wrapper}),
    ];

    for (const {result} of hooks) {
      expect(result.current.fetchStatus).toBe('idle');
    }
    expect(showApi.getSeasons).not.toHaveBeenCalled();
    expect(showApi.getEpisodes).not.toHaveBeenCalled();
    expect(showApi.getNextUp).not.toHaveBeenCalled();
    expect(libraryApi.getItems).not.toHaveBeenCalled();
  });
});

import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {getLibraryApi} from '@jellyfin/sdk/lib/utils/api/library-api';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {act, renderHook, waitFor} from '@testing-library/react-native';
import React, {type ReactNode} from 'react';

import {toCardItem} from '../../src/api/items';
import {
  fetchLibraryPage,
  LIBRARY_FIELDS,
  LIBRARY_PAGE_SIZE,
  libraryKeys,
  libraryStatusText,
  nextLibraryPageParam,
  useLibraryItems,
} from '../../src/api/library';
import {
  DEFAULT_LIBRARY_PREFS,
  LIBRARY_SORT_OPTIONS,
  type LibraryQuery,
} from '../../src/api/libraryTypes';
import {useSession} from '../../src/auth/SessionContext';
import {sessionFor} from '../auth/fakes';

jest.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({
  getLibraryApi: jest.fn(),
}));
jest.mock('../../src/api/items', () => ({
  toCardItem: jest.fn((item: {Id?: string}) => ({id: item.Id})),
}));
jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

const libraryApi = {getItems: jest.fn()};

const session = sessionFor();
const {api} = session;
const SERVER_ID = session.server.id;

const MOVIE_SORTS = LIBRARY_SORT_OPTIONS.movies;
const SHOW_SORTS = LIBRARY_SORT_OPTIONS.tvshows;

const query = (overrides: Partial<LibraryQuery> = {}): LibraryQuery => ({
  ...DEFAULT_LIBRARY_PREFS,
  ...overrides,
});

const filters = (unwatchedOnly: boolean, favoritesOnly: boolean) => ({
  filters: {unwatchedOnly, favoritesOnly},
});

const items = (from: number, count: number): BaseItemDto[] =>
  Array.from({length: count}, (_, index) => ({Id: `i${from + index}`}));

const page = (from: number, count: number, total: number) => ({
  data: {Items: items(from, count), TotalRecordCount: total},
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return {promise, resolve};
}

let client: QueryClient;

const wrapper = ({children}: {children: ReactNode}) =>
  React.createElement(QueryClientProvider, {client}, children);

beforeEach(() => {
  jest.clearAllMocks();
  (getLibraryApi as jest.Mock).mockReturnValue(libraryApi);
  (useSession as jest.Mock).mockReturnValue({session});
  client = new QueryClient({
    defaultOptions: {queries: {retry: false, gcTime: Infinity}},
  });
});

afterEach(() => client.clear());

const request = () => libraryApi.getItems.mock.calls[0][0];

describe('fetchLibraryPage', () => {
  beforeEach(() => libraryApi.getItems.mockResolvedValue(page(0, 2, 2)));

  it('asks for the movies in a library, sorted by name', async () => {
    await expect(
      fetchLibraryPage(api, 'u1', {
        libraryId: 'lib',
        kind: 'movies',
        query: query(),
        startIndex: 0,
      }),
    ).resolves.toEqual({items: items(0, 2), total: 2});
    expect(getLibraryApi).toHaveBeenCalledWith(api);
    expect(libraryApi.getItems).toHaveBeenCalledWith({
      userId: 'u1',
      parentId: 'lib',
      includeItemTypes: ['Movie'],
      recursive: true,
      sortBy: ['SortName'],
      sortOrder: ['Ascending'],
      filters: undefined,
      fields: LIBRARY_FIELDS,
      startIndex: 0,
      limit: 60,
      enableTotalRecordCount: true,
    });
    expect(LIBRARY_PAGE_SIZE).toBe(60);
  });

  it('asks for series in a TV library', async () => {
    await fetchLibraryPage(api, 'u1', {
      libraryId: 'lib',
      kind: 'tvshows',
      query: query(),
      startIndex: 0,
    });
    expect(request().includeItemTypes).toEqual(['Series']);
  });

  it('uses androidtv fields, enough for poster cards', () => {
    expect(LIBRARY_FIELDS).toEqual(
      expect.arrayContaining([
        'PrimaryImageAspectRatio',
        'ChildCount',
        'DisplayPreferencesId',
      ]),
    );
  });

  it.each(
    [...MOVIE_SORTS, ...SHOW_SORTS].filter((o) => o.sortBy !== 'SortName'),
  )(
    'sorts by $sortBy then by name, $sortOrder',
    async ({sortBy, sortOrder}) => {
      await fetchLibraryPage(api, 'u1', {
        libraryId: 'lib',
        kind: 'movies',
        query: query({sortBy, sortOrder}),
        startIndex: 0,
      });
      expect(request().sortBy).toEqual([sortBy, 'SortName']);
      expect(request().sortOrder).toEqual([sortOrder]);
    },
  );

  it.each([
    [false, false, undefined],
    [true, false, ['IsUnplayed']],
    [false, true, ['IsFavorite']],
    [true, true, ['IsUnplayed', 'IsFavorite']],
  ])(
    'unwatched %s, favorites %s sends filters %j',
    async (unwatchedOnly, favoritesOnly, expected) => {
      await fetchLibraryPage(api, 'u1', {
        libraryId: 'lib',
        kind: 'movies',
        query: query(filters(unwatchedOnly, favoritesOnly)),
        startIndex: 0,
      });
      expect(request().filters).toEqual(expected);
    },
  );

  it('sends nameStartsWith for a letter', async () => {
    await fetchLibraryPage(api, 'u1', {
      libraryId: 'lib',
      kind: 'movies',
      query: query({letter: 'B'}),
      startIndex: 0,
    });
    expect(request().nameStartsWith).toBe('B');
    expect(request()).not.toHaveProperty('nameLessThan');
  });

  it('sends nameLessThan A for #', async () => {
    await fetchLibraryPage(api, 'u1', {
      libraryId: 'lib',
      kind: 'movies',
      query: query({letter: '#'}),
      startIndex: 0,
    });
    expect(request().nameLessThan).toBe('A');
    expect(request()).not.toHaveProperty('nameStartsWith');
  });

  it('sends no name filter without a letter', async () => {
    await fetchLibraryPage(api, 'u1', {
      libraryId: 'lib',
      kind: 'movies',
      query: query(),
      startIndex: 0,
    });
    expect(request()).not.toHaveProperty('nameStartsWith');
    expect(request()).not.toHaveProperty('nameLessThan');
  });

  it('sends the start index and page size', async () => {
    await fetchLibraryPage(api, 'u1', {
      libraryId: 'lib',
      kind: 'movies',
      query: query(),
      startIndex: 120,
    });
    expect(request()).toMatchObject({startIndex: 120, limit: 60});
  });

  it('treats a missing list and count as empty', async () => {
    libraryApi.getItems.mockResolvedValue({data: {}});
    await expect(
      fetchLibraryPage(api, 'u1', {
        libraryId: 'lib',
        kind: 'movies',
        query: query(),
        startIndex: 0,
      }),
    ).resolves.toEqual({items: [], total: 0});
  });
});

describe('nextLibraryPageParam', () => {
  const p = (count: number, total: number) => ({
    items: items(0, count),
    total,
  });

  it('starts the next page after the loaded items', () => {
    const pages = [p(60, 130), p(60, 130)];
    expect(nextLibraryPageParam(pages[1], pages)).toBe(120);
  });

  it('stops when every item is loaded', () => {
    const pages = [p(60, 70), p(10, 70)];
    expect(nextLibraryPageParam(pages[1], pages)).toBeUndefined();
  });

  it('stops on an empty page before the total', () => {
    const pages = [p(60, 130), p(0, 130)];
    expect(nextLibraryPageParam(pages[1], pages)).toBeUndefined();
  });

  it('stops on an empty library', () => {
    const pages = [p(0, 0)];
    expect(nextLibraryPageParam(pages[0], pages)).toBeUndefined();
  });
});

describe('libraryStatusText', () => {
  it.each([
    [false, false, undefined, "Showing all items from 'Movies' sorted by Name"],
    [true, false, undefined, "Showing unwatched from 'Movies' sorted by Name"],
    [false, true, undefined, "Showing favorites from 'Movies' sorted by Name"],
    [
      true,
      true,
      undefined,
      "Showing unwatched favorites from 'Movies' sorted by Name",
    ],
    [
      false,
      false,
      'B',
      "Showing all items beginning with those whose name starts with B from 'Movies' sorted by Name",
    ],
    [
      true,
      false,
      'B',
      "Showing unwatched beginning with those whose name starts with B from 'Movies' sorted by Name",
    ],
    [
      false,
      true,
      '#',
      "Showing favorites beginning with those whose name starts with # from 'Movies' sorted by Name",
    ],
    [
      true,
      true,
      'B',
      "Showing unwatched favorites beginning with those whose name starts with B from 'Movies' sorted by Name",
    ],
  ])(
    'unwatched %s, favorites %s, letter %s',
    (unwatchedOnly, favoritesOnly, letter, expected) => {
      expect(
        libraryStatusText(
          'Movies',
          query({...filters(unwatchedOnly, favoritesOnly), letter}),
          MOVIE_SORTS,
        ),
      ).toBe(expected);
    },
  );

  it('names the sort with the library kind’s label', () => {
    const q = query({sortBy: 'DateCreated', sortOrder: 'Descending'});
    expect(libraryStatusText('Movies', q, MOVIE_SORTS)).toBe(
      "Showing all items from 'Movies' sorted by Date added",
    );
    expect(libraryStatusText('Shows', q, SHOW_SORTS)).toBe(
      "Showing all items from 'Shows' sorted by Date show added",
    );
  });

  it('says Unknown for a sort not in the options', () => {
    expect(
      libraryStatusText('Shows', query({sortBy: 'Runtime'}), SHOW_SORTS),
    ).toBe("Showing all items from 'Shows' sorted by Unknown");
  });
});

describe('libraryKeys', () => {
  it('scope every key by server and user', () => {
    const q = query({letter: 'C'});
    expect(libraryKeys.all('s', 'u')).toEqual(['library', 's', 'u']);
    expect(libraryKeys.items('s', 'u', 'lib', q)).toEqual([
      'library',
      's',
      'u',
      'items',
      'lib',
      q,
    ]);
    expect(libraryKeys.prefs('s', 'u', 'dp')).toEqual([
      'library',
      's',
      'u',
      'prefs',
      'dp',
    ]);
  });

  it('differ by library and query', () => {
    expect(libraryKeys.items('s', 'u', 'a', query())).not.toEqual(
      libraryKeys.items('s', 'u', 'b', query()),
    );
    expect(libraryKeys.items('s', 'u', 'a', query())).not.toEqual(
      libraryKeys.items('s', 'u', 'a', query({letter: 'A'})),
    );
  });
});

describe('useLibraryItems', () => {
  it('loads the first page as poster cards', async () => {
    libraryApi.getItems.mockResolvedValue(page(0, 60, 130));

    const {result} = renderHook(
      () => useLibraryItems('lib', 'movies', query()),
      {wrapper},
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.cards).toHaveLength(60);
    expect(result.current.cards[0]).toEqual({id: 'i0'});
    expect(result.current.total).toBe(130);
    expect(result.current.hasNextPage).toBe(true);
    expect(toCardItem).toHaveBeenCalledWith(
      expect.objectContaining({Id: 'i0'}),
      api,
      {variant: 'poster'},
    );
    expect(
      client.getQueryData(libraryKeys.items(SERVER_ID, 'u1', 'lib', query())),
    ).toBeDefined();
  });

  it('pages to the end and flattens the cards', async () => {
    libraryApi.getItems
      .mockResolvedValueOnce(page(0, 60, 70))
      .mockResolvedValueOnce(page(60, 10, 70));

    const {result} = renderHook(
      () => useLibraryItems('lib', 'movies', query()),
      {wrapper},
    );
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    act(() => result.current.fetchNextPage());

    await waitFor(() => expect(result.current.cards).toHaveLength(70));
    expect(result.current.hasNextPage).toBe(false);
    expect(libraryApi.getItems.mock.calls[1][0].startIndex).toBe(60);
  });

  it('makes one request when fetchNextPage repeats while a page loads', async () => {
    const next = deferred<ReturnType<typeof page>>();
    libraryApi.getItems
      .mockResolvedValueOnce(page(0, 60, 130))
      .mockReturnValueOnce(next.promise);

    const {result} = renderHook(
      () => useLibraryItems('lib', 'movies', query()),
      {wrapper},
    );
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    act(() => {
      result.current.fetchNextPage();
      result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.isFetchingNextPage).toBe(true));
    act(() => result.current.fetchNextPage());

    expect(libraryApi.getItems).toHaveBeenCalledTimes(2);
    await act(async () => next.resolve(page(60, 60, 130)));
    await waitFor(() => expect(result.current.cards).toHaveLength(120));
    expect(libraryApi.getItems).toHaveBeenCalledTimes(2);
  });

  it('stops paging on an empty page before the total', async () => {
    libraryApi.getItems
      .mockResolvedValueOnce(page(0, 60, 130))
      .mockResolvedValueOnce(page(60, 0, 130));

    const {result} = renderHook(
      () => useLibraryItems('lib', 'movies', query()),
      {wrapper},
    );
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));

    act(() => result.current.fetchNextPage());
    expect(libraryApi.getItems).toHaveBeenCalledTimes(2);
  });

  it('drops an item repeated across pages', async () => {
    libraryApi.getItems
      .mockResolvedValueOnce(page(0, 60, 70))
      .mockResolvedValueOnce(page(59, 10, 70));

    const {result} = renderHook(
      () => useLibraryItems('lib', 'movies', query()),
      {wrapper},
    );
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    act(() => result.current.fetchNextPage());

    await waitFor(() => expect(result.current.cards).toHaveLength(69));
  });

  it('re-queries from the start when the query changes', async () => {
    libraryApi.getItems.mockResolvedValue(page(0, 2, 2));

    const {result, rerender} = renderHook(
      ({q}: {q: LibraryQuery}) => useLibraryItems('lib', 'movies', q),
      {wrapper, initialProps: {q: query()}},
    );
    await waitFor(() => expect(result.current.status).toBe('success'));

    rerender({q: query({letter: 'D'})});

    await waitFor(() => expect(libraryApi.getItems).toHaveBeenCalledTimes(2));
    expect(libraryApi.getItems.mock.calls[1][0]).toMatchObject({
      startIndex: 0,
      nameStartsWith: 'D',
    });
  });

  it('does nothing without a query, library or session', async () => {
    const {result} = renderHook(
      () => useLibraryItems('lib', 'movies', undefined),
      {wrapper},
    );
    renderHook(() => useLibraryItems('', 'movies', query()), {wrapper});
    (useSession as jest.Mock).mockReturnValue({session: undefined});
    renderHook(() => useLibraryItems('lib', 'movies', query()), {wrapper});

    await act(async () => {});
    expect(libraryApi.getItems).not.toHaveBeenCalled();
    expect(result.current.cards).toEqual([]);
    expect(result.current.total).toBe(0);

    act(() => result.current.fetchNextPage());
    expect(libraryApi.getItems).not.toHaveBeenCalled();
  });
});

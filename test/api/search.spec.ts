import {getLibraryApi} from '@jellyfin/sdk/lib/utils/api/library-api';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {renderHook, waitFor} from '@testing-library/react-native';
import React, {type ReactNode} from 'react';

import {
  fetchSearch,
  SEARCH_GROUPS,
  SEARCH_LIMIT,
  searchKeys,
  useSearch,
} from '../../src/api/search';
import {useSession} from '../../src/auth/SessionContext';
import {sessionFor} from '../auth/fakes';

jest.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({
  getLibraryApi: jest.fn(),
}));
jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

const libraryApi = {getItems: jest.fn()};

const session = sessionFor();
const {api} = session;

const BROWSE_FIELDS = [
  'CanDelete',
  'ChildCount',
  'DateCreated',
  'Genres',
  'Overview',
  'PrimaryImageAspectRatio',
];

type Request = {searchTerm: string; includeItemTypes: string[]};

// One item per kind and term, so each row shows where its data came from.
const itemFor = ({searchTerm, includeItemTypes}: Request) => ({
  Id: `${includeItemTypes[0]}:${searchTerm}`,
});

const answer = (request: Request) =>
  Promise.resolve({data: {Items: [itemFor(request)]}});

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
  libraryApi.getItems.mockImplementation(answer);
  client = new QueryClient({
    defaultOptions: {queries: {retry: false, gcTime: Infinity}},
  });
});

afterEach(() => client.clear());

const requests = (): Request[] =>
  libraryApi.getItems.mock.calls.map(([request]) => request);

describe('fetchSearch', () => {
  it('searches one kind recursively, 25 items, without a total count', async () => {
    libraryApi.getItems.mockResolvedValue({data: {Items: [{Id: 's1'}]}});

    await expect(fetchSearch(api, 'u1', 'spider', 'Series')).resolves.toEqual([
      {Id: 's1'},
    ]);
    expect(getLibraryApi).toHaveBeenCalledWith(api);
    expect(libraryApi.getItems).toHaveBeenCalledWith({
      userId: 'u1',
      searchTerm: 'spider',
      includeItemTypes: ['Series'],
      limit: 25,
      recursive: true,
      imageTypeLimit: 1,
      fields: BROWSE_FIELDS,
      enableTotalRecordCount: false,
    });
    expect(SEARCH_LIMIT).toBe(25);
  });

  it('returns no items when the server sends none', async () => {
    libraryApi.getItems.mockResolvedValue({data: {}});
    await expect(fetchSearch(api, 'u1', 'spider', 'Movie')).resolves.toEqual(
      [],
    );
  });
});

describe('searchKeys', () => {
  it('scopes the key to the server, user, kind and term', () => {
    expect(searchKeys('srv1', 'u1', 'Movie', 'spider')).toEqual([
      'search',
      'srv1',
      'u1',
      'Movie',
      'spider',
    ]);
  });
});

describe('SEARCH_GROUPS', () => {
  it('is Movies, Shows, Episodes', () => {
    expect(SEARCH_GROUPS).toEqual([
      {key: 'movies', title: 'Movies', kind: 'Movie'},
      {key: 'shows', title: 'Shows', kind: 'Series'},
      {key: 'episodes', title: 'Episodes', kind: 'Episode'},
    ]);
  });
});

describe('useSearch', () => {
  it.each(['', '   '])('fetches nothing for %j', async (term) => {
    const {result} = renderHook(() => useSearch(term), {wrapper});

    expect(result.current.map((group) => group.key)).toEqual([
      'movies',
      'shows',
      'episodes',
    ]);
    for (const group of result.current) {
      expect(group.query.data).toBeUndefined();
      expect(group.query.fetchStatus).toBe('idle');
    }
    await Promise.resolve();
    expect(libraryApi.getItems).not.toHaveBeenCalled();
  });

  it('searches the three kinds with the trimmed term', async () => {
    const {result} = renderHook(() => useSearch(' spider '), {wrapper});

    await waitFor(() =>
      expect(result.current.every((group) => group.query.isSuccess)).toBe(true),
    );
    expect(requests().map((request) => request.searchTerm)).toEqual([
      'spider',
      'spider',
      'spider',
    ]);
    expect(
      requests()
        .map((request) => request.includeItemTypes)
        .sort(),
    ).toEqual([['Episode'], ['Movie'], ['Series']]);
    expect(
      result.current.map(({key, title, kind, query}) => ({
        key,
        title,
        kind,
        data: query.data,
      })),
    ).toEqual([
      {
        key: 'movies',
        title: 'Movies',
        kind: 'Movie',
        data: [{Id: 'Movie:spider'}],
      },
      {
        key: 'shows',
        title: 'Shows',
        kind: 'Series',
        data: [{Id: 'Series:spider'}],
      },
      {
        key: 'episodes',
        title: 'Episodes',
        kind: 'Episode',
        data: [{Id: 'Episode:spider'}],
      },
    ]);
  });

  it('keeps the same groups across renders when nothing changed', async () => {
    const {result, rerender} = renderHook(() => useSearch('spider'), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.every((group) => group.query.isSuccess)).toBe(true),
    );
    const first = result.current;

    rerender({});

    expect(result.current).toBe(first);
  });

  it('keeps the previous results while the next term loads', async () => {
    const {result, rerender} = renderHook(
      ({term}: {term: string}) => useSearch(term),
      {
        wrapper,
        initialProps: {term: 'spider'},
      },
    );
    await waitFor(() =>
      expect(result.current.every((group) => group.query.isSuccess)).toBe(true),
    );

    const next = deferred<void>();
    libraryApi.getItems.mockImplementation(async (request: Request) => {
      await next.promise;
      return answer(request);
    });
    rerender({term: 'spiderman'});

    await waitFor(() => expect(libraryApi.getItems).toHaveBeenCalledTimes(6));
    for (const group of result.current) {
      expect(group.query.isPlaceholderData).toBe(true);
      expect(group.query.data).toEqual([{Id: `${group.kind}:spider`}]);
    }

    next.resolve();

    await waitFor(() =>
      expect(
        result.current.every((group) => !group.query.isPlaceholderData),
      ).toBe(true),
    );
    for (const group of result.current) {
      expect(group.query.data).toEqual([{Id: `${group.kind}:spiderman`}]);
    }
  });

  it('shows nothing once the term is cleared', async () => {
    const {result, rerender} = renderHook(
      ({term}: {term: string}) => useSearch(term),
      {
        wrapper,
        initialProps: {term: 'spider'},
      },
    );
    await waitFor(() =>
      expect(result.current.every((group) => group.query.isSuccess)).toBe(true),
    );

    rerender({term: ' '});

    for (const group of result.current) {
      expect(group.query.data).toBeUndefined();
    }
  });

  it('keeps the other groups when one fails', async () => {
    libraryApi.getItems.mockImplementation((request: Request) =>
      request.includeItemTypes[0] === 'Series'
        ? Promise.reject(new Error('HTTP 500'))
        : answer(request),
    );

    const {result} = renderHook(() => useSearch('spider'), {wrapper});

    await waitFor(() =>
      expect(result.current.every((group) => !group.query.isPending)).toBe(
        true,
      ),
    );
    const [movies, shows, episodes] = result.current;
    expect(movies.query.data).toEqual([{Id: 'Movie:spider'}]);
    expect(episodes.query.data).toEqual([{Id: 'Episode:spider'}]);
    expect(shows.query.isError).toBe(true);
    expect(shows.query.error).toEqual(new Error('HTTP 500'));
    expect(shows.query.refetch).toEqual(expect.any(Function));
  });

  it('fetches nothing when nobody is signed in', async () => {
    (useSession as jest.Mock).mockReturnValue({session: undefined});

    const {result} = renderHook(() => useSearch('spider'), {wrapper});

    for (const group of result.current) {
      expect(group.query.fetchStatus).toBe('idle');
    }
    await Promise.resolve();
    expect(libraryApi.getItems).not.toHaveBeenCalled();
  });
});

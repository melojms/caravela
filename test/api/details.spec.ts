import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {getLibraryApi} from '@jellyfin/sdk/lib/utils/api/library-api';
import {getUserDataApi} from '@jellyfin/sdk/lib/utils/api/user-data-api';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {act, renderHook, waitFor} from '@testing-library/react-native';
import React, {type ReactNode} from 'react';

import {
  detailsKeys,
  fetchItemDetails,
  fetchSimilarItems,
  ITEM_FIELDS,
  SIMILAR_LIMIT,
  useItemDetails,
  useSimilarItems,
  useToggleFavorite,
  useTogglePlayed,
} from '../../src/api/details';
import {homeKeys} from '../../src/api/home';
import {useSession} from '../../src/auth/SessionContext';
import {sessionFor} from '../auth/fakes';

jest.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({
  getLibraryApi: jest.fn(),
}));
jest.mock('@jellyfin/sdk/lib/utils/api/user-data-api', () => ({
  getUserDataApi: jest.fn(),
}));
jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

const libraryApi = {getItem: jest.fn(), getSimilarItems: jest.fn()};
const userDataApi = {
  markFavoriteItem: jest.fn(),
  unmarkFavoriteItem: jest.fn(),
  markPlayedItem: jest.fn(),
  markUnplayedItem: jest.fn(),
};

const session = sessionFor();
const {api} = session;
const SERVER_ID = session.server.id;
const USER_ID = 'u1';
const ITEM_KEY = detailsKeys.item(SERVER_ID, USER_ID, 'm1');
const HOME_KEY = homeKeys.all(SERVER_ID, USER_ID);

const MOVIE: BaseItemDto = {
  Id: 'm1',
  Name: 'Arrival',
  UserData: {
    Key: 'm1',
    IsFavorite: false,
    Played: false,
    PlaybackPositionTicks: 36000000000,
    PlayedPercentage: 40,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

let client: QueryClient;

const wrapper = ({children}: {children: ReactNode}) =>
  React.createElement(QueryClientProvider, {client}, children);

const cachedItem = () => client.getQueryData<BaseItemDto>(ITEM_KEY);

beforeEach(() => {
  jest.clearAllMocks();
  (getLibraryApi as jest.Mock).mockReturnValue(libraryApi);
  (getUserDataApi as jest.Mock).mockReturnValue(userDataApi);
  (useSession as jest.Mock).mockReturnValue({session});
  // No garbage-collection timers, so Jest can exit.
  client = new QueryClient({
    defaultOptions: {
      queries: {retry: false, gcTime: Infinity},
      mutations: {retry: false, gcTime: Infinity},
    },
  });
});

afterEach(() => client.clear());

describe('fetchItemDetails', () => {
  it('gets the item with the user data from the library API', async () => {
    libraryApi.getItem.mockResolvedValue({data: MOVIE});

    await expect(fetchItemDetails(api, 'u1', 'm1')).resolves.toBe(MOVIE);
    expect(getLibraryApi).toHaveBeenCalledWith(api);
    expect(libraryApi.getItem).toHaveBeenCalledWith({
      itemId: 'm1',
      userId: 'u1',
    });
  });
});

describe('fetchSimilarItems', () => {
  it('asks for 20 similar items with androidtv fields', async () => {
    libraryApi.getSimilarItems.mockResolvedValue({data: {Items: [MOVIE]}});

    await expect(fetchSimilarItems(api, 'u1', 'm1')).resolves.toEqual([MOVIE]);
    expect(libraryApi.getSimilarItems).toHaveBeenCalledWith({
      itemId: 'm1',
      userId: 'u1',
      limit: 20,
      fields: ITEM_FIELDS,
    });
    expect(SIMILAR_LIMIT).toBe(20);
  });

  it('includes the details fields', () => {
    expect(ITEM_FIELDS).toEqual(
      expect.arrayContaining([
        'Overview',
        'Genres',
        'People',
        'MediaSources',
        'MediaStreams',
        'Taglines',
        'Chapters',
        'Trickplay',
      ]),
    );
  });

  it('returns no items when the server sends none', async () => {
    libraryApi.getSimilarItems.mockResolvedValue({data: {}});
    await expect(fetchSimilarItems(api, 'u1', 'm1')).resolves.toEqual([]);
  });
});

describe('detailsKeys', () => {
  it('starts with the server and user', () => {
    expect(detailsKeys.item('s', 'u', 'i')).toEqual([
      'details',
      's',
      'u',
      'item',
      'i',
    ]);
    expect(detailsKeys.similar('s', 'u', 'i')).toEqual([
      'details',
      's',
      'u',
      'similar',
      'i',
    ]);
  });
});

describe('useItemDetails / useSimilarItems', () => {
  it('loads the item under its key', async () => {
    libraryApi.getItem.mockResolvedValue({data: MOVIE});
    const {result} = renderHook(() => useItemDetails('m1'), {wrapper});

    await waitFor(() => expect(result.current.data).toBe(MOVIE));
    expect(cachedItem()).toBe(MOVIE);
  });

  it('loads similar items under their key', async () => {
    libraryApi.getSimilarItems.mockResolvedValue({data: {Items: [MOVIE]}});
    const {result} = renderHook(() => useSimilarItems('m1'), {wrapper});

    await waitFor(() => expect(result.current.data).toEqual([MOVIE]));
    expect(
      client.getQueryData(detailsKeys.similar(SERVER_ID, USER_ID, 'm1')),
    ).toEqual([MOVIE]);
  });

  it('does not fetch when signed out', () => {
    (useSession as jest.Mock).mockReturnValue({session: undefined});
    const {result} = renderHook(() => useItemDetails('m1'), {wrapper});

    expect(result.current.fetchStatus).toBe('idle');
    expect(libraryApi.getItem).not.toHaveBeenCalled();
  });

  it('does not fetch without an item id', () => {
    const {result} = renderHook(() => useSimilarItems(''), {wrapper});

    expect(result.current.fetchStatus).toBe('idle');
    expect(libraryApi.getSimilarItems).not.toHaveBeenCalled();
  });
});

describe('useToggleFavorite', () => {
  beforeEach(() => {
    client.setQueryData(ITEM_KEY, MOVIE);
    libraryApi.getItem.mockResolvedValue({data: MOVIE});
  });

  it('marks a non-favorite, flipping the cache before the server answers', async () => {
    const call = deferred<{data: object}>();
    userDataApi.markFavoriteItem.mockReturnValue(call.promise);
    const {result} = renderHook(() => useToggleFavorite('m1'), {wrapper});

    act(() => result.current.toggle());

    await waitFor(() =>
      expect(userDataApi.markFavoriteItem).toHaveBeenCalledWith({
        itemId: 'm1',
        userId: 'u1',
      }),
    );
    expect(cachedItem()?.UserData?.IsFavorite).toBe(true);
    expect(userDataApi.unmarkFavoriteItem).not.toHaveBeenCalled();

    await act(async () => call.resolve({data: {IsFavorite: true}}));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('unmarks a favorite', async () => {
    client.setQueryData(ITEM_KEY, {
      ...MOVIE,
      UserData: {...MOVIE.UserData, IsFavorite: true},
    });
    userDataApi.unmarkFavoriteItem.mockResolvedValue({
      data: {IsFavorite: false},
    });
    const {result} = renderHook(() => useToggleFavorite('m1'), {wrapper});

    act(() => result.current.toggle());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(userDataApi.unmarkFavoriteItem).toHaveBeenCalledWith({
      itemId: 'm1',
      userId: 'u1',
    });
    expect(userDataApi.markFavoriteItem).not.toHaveBeenCalled();
  });

  it('rolls back on error', async () => {
    const call = deferred<{data: object}>();
    userDataApi.markFavoriteItem.mockReturnValue(call.promise);
    // Keep the item's refetch from overwriting the rollback.
    libraryApi.getItem.mockReturnValue(new Promise(() => undefined));
    const {result} = renderHook(() => useToggleFavorite('m1'), {wrapper});

    act(() => result.current.toggle());
    await waitFor(() => expect(cachedItem()?.UserData?.IsFavorite).toBe(true));

    await act(async () => call.reject(new Error('offline')));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cachedItem()).toEqual(MOVIE);
  });

  it('invalidates the item and Home once settled', async () => {
    userDataApi.markFavoriteItem.mockResolvedValue({data: {IsFavorite: true}});
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const {result} = renderHook(() => useToggleFavorite('m1'), {wrapper});

    act(() => result.current.toggle());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({queryKey: ITEM_KEY});
    expect(invalidate).toHaveBeenCalledWith({queryKey: HOME_KEY});
  });

  it('invalidates even when the call fails', async () => {
    userDataApi.markFavoriteItem.mockRejectedValue(new Error('offline'));
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const {result} = renderHook(() => useToggleFavorite('m1'), {wrapper});

    act(() => result.current.toggle());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({queryKey: ITEM_KEY});
    expect(invalidate).toHaveBeenCalledWith({queryKey: HOME_KEY});
  });

  it('keeps the server user data once it answers', async () => {
    userDataApi.markFavoriteItem.mockResolvedValue({
      data: {...MOVIE.UserData, IsFavorite: true, Likes: true},
    });
    libraryApi.getItem.mockReturnValue(new Promise(() => undefined));
    const {result} = renderHook(() => useToggleFavorite('m1'), {wrapper});

    act(() => result.current.toggle());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cachedItem()?.UserData).toMatchObject({
      IsFavorite: true,
      Likes: true,
      PlaybackPositionTicks: 36000000000,
    });
  });

  it('marks a favorite when the item is not cached yet', async () => {
    client.removeQueries({queryKey: ITEM_KEY});
    userDataApi.markFavoriteItem.mockResolvedValue({data: {IsFavorite: true}});
    const {result} = renderHook(() => useToggleFavorite('m1'), {wrapper});

    act(() => result.current.toggle());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(userDataApi.markFavoriteItem).toHaveBeenCalled();
  });

  it('fails when signed out', async () => {
    (useSession as jest.Mock).mockReturnValue({session: undefined});
    const {result} = renderHook(() => useToggleFavorite('m1'), {wrapper});

    act(() => result.current.toggle());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(userDataApi.markFavoriteItem).not.toHaveBeenCalled();
  });
});

describe('useTogglePlayed', () => {
  beforeEach(() => {
    client.setQueryData(ITEM_KEY, MOVIE);
    libraryApi.getItem.mockReturnValue(new Promise(() => undefined));
  });

  it('marks an unplayed item played and clears its resume point', async () => {
    const call = deferred<{data: object}>();
    userDataApi.markPlayedItem.mockReturnValue(call.promise);
    const {result} = renderHook(() => useTogglePlayed('m1'), {wrapper});

    act(() => result.current.toggle());

    await waitFor(() =>
      expect(userDataApi.markPlayedItem).toHaveBeenCalledWith({
        itemId: 'm1',
        userId: 'u1',
      }),
    );
    expect(cachedItem()?.UserData).toMatchObject({
      Played: true,
      PlaybackPositionTicks: 0,
      PlayedPercentage: undefined,
    });
    await act(async () => call.resolve({data: {Played: true}}));
  });

  it('marks a played item unplayed', async () => {
    client.setQueryData(ITEM_KEY, {
      ...MOVIE,
      UserData: {Key: 'm1', Played: true, PlaybackPositionTicks: 0},
    });
    userDataApi.markUnplayedItem.mockResolvedValue({data: {Played: false}});
    const {result} = renderHook(() => useTogglePlayed('m1'), {wrapper});

    act(() => result.current.toggle());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(userDataApi.markUnplayedItem).toHaveBeenCalledWith({
      itemId: 'm1',
      userId: 'u1',
    });
    expect(userDataApi.markPlayedItem).not.toHaveBeenCalled();
    expect(cachedItem()?.UserData?.Played).toBe(false);
  });

  it('rolls back, resume point included, on error', async () => {
    userDataApi.markPlayedItem.mockRejectedValue(new Error('offline'));
    const {result} = renderHook(() => useTogglePlayed('m1'), {wrapper});

    act(() => result.current.toggle());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cachedItem()).toEqual(MOVIE);
  });

  it('invalidates the item and Home once settled', async () => {
    userDataApi.markPlayedItem.mockResolvedValue({data: {Played: true}});
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const {result} = renderHook(() => useTogglePlayed('m1'), {wrapper});

    act(() => result.current.toggle());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({queryKey: ITEM_KEY});
    expect(invalidate).toHaveBeenCalledWith({queryKey: HOME_KEY});
  });
});

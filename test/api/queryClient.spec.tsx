import {getDisplayPreferenceApi} from '@jellyfin/sdk/lib/utils/api/display-preference-api';
import {getLibraryApi} from '@jellyfin/sdk/lib/utils/api/library-api';
import {
  focusManager,
  QueryClient,
  useQueryClient,
} from '@tanstack/react-query';
import {act, renderHook, waitFor} from '@testing-library/react-native';
import React, {ReactNode} from 'react';
import {AppState, AppStateStatus} from 'react-native';

import {
  homeKeys,
  useHomeSections,
  useLatest,
  useResume,
} from '../../src/api/home';
import {
  createQueryClient,
  SessionQueryClientProvider,
} from '../../src/api/queryClient';
import {SessionProvider, useSession} from '../../src/auth/SessionContext';
import {
  fakeService,
  fakeStore,
  HOME,
  sessionFor,
  signedInState,
} from '../auth/fakes';

jest.mock('@jellyfin/sdk/lib/utils/api/display-preference-api', () => ({
  getDisplayPreferenceApi: jest.fn(),
}));
jest.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({
  getLibraryApi: jest.fn(),
}));

const displayPreferenceApi = {getDisplayPreferences: jest.fn()};
const libraryApi = {getResumeItems: jest.fn(), getLatestMedia: jest.fn()};

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: {status},
  });

// Created once per test: new props would restart the session.
let service: ReturnType<typeof fakeService>;
let store: ReturnType<typeof fakeStore>;

const wrapper = ({children}: {children: ReactNode}) => (
  <SessionProvider authService={service} authStore={store}>
    <SessionQueryClientProvider>{children}</SessionQueryClientProvider>
  </SessionProvider>
);

const signedIn = async (result: {current: {session: {status: string}}}) =>
  waitFor(() => expect(result.current.session.status).toBe('signedIn'));

beforeEach(() => {
  jest.clearAllMocks();
  service = fakeService();
  store = fakeStore(signedInState());
  (getLibraryApi as jest.Mock).mockReturnValue(libraryApi);
  (getDisplayPreferenceApi as jest.Mock).mockReturnValue(displayPreferenceApi);
});

describe('createQueryClient', () => {
  const retry = createQueryClient().getDefaultOptions().queries?.retry as (
    failureCount: number,
    error: unknown,
  ) => boolean;

  it('retries once', () => {
    expect(retry(0, httpError(500))).toBe(true);
    expect(retry(1, httpError(500))).toBe(false);
  });

  it('does not retry a 401', () => {
    expect(retry(0, httpError(401))).toBe(false);
  });

  it('keeps data fresh for 30 s and refetches stale data on focus', () => {
    const {queries} = createQueryClient().getDefaultOptions();
    expect(queries?.staleTime).toBe(30 * 1000);
    // Left to TanStack's default: refetch stale queries on focus.
    expect(queries?.refetchOnWindowFocus).toBeUndefined();
  });
});

describe('SessionQueryClientProvider', () => {
  it('starts from an empty cache for another user', async () => {
    const {result} = renderHook(
      () => ({session: useSession(), client: useQueryClient()}),
      {wrapper},
    );
    await signedIn(result);
    const key = homeKeys.resume('srv1', 'u1');
    act(() => {
      result.current.client.setQueryData(key, [{Id: 'm1'}]);
    });
    const first = result.current.client;

    act(() => result.current.session.switchUser());
    expect(result.current.client).not.toBe(first);
    expect(result.current.client.getQueryCache().getAll()).toEqual([]);
    // The old client is emptied on the next tick.
    await act(() => new Promise<void>((done) => setTimeout(done, 0)));
    expect(first.getQueryData(key)).toBeUndefined();

    act(() => result.current.session.signIn(sessionFor(HOME, 'u2')));
    expect(result.current.client.getQueryCache().getAll()).toEqual([]);
  });

  it('keeps the cache while the same user stays signed in', async () => {
    const {result, rerender} = renderHook(
      () => ({session: useSession(), client: useQueryClient()}),
      {wrapper},
    );
    await signedIn(result);
    const first = result.current.client;
    rerender({});
    expect(result.current.client).toBe(first);
  });
});

describe('refetching on return to the foreground', () => {
  type Listener = (state: AppStateStatus) => void;
  let listeners: Set<Listener>;
  const changeTo = (state: AppStateStatus) =>
    act(() => listeners.forEach((listener) => listener(state)));
  const realNow = Date.now;
  let now: jest.SpyInstance | undefined;
  const later = (ms: number) => {
    now = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + ms);
  };

  beforeEach(() => {
    listeners = new Set();
    jest
      .mocked(AppState.addEventListener)
      .mockImplementation((_type, listener) => {
        listeners.add(listener as Listener);
        return {remove: () => listeners.delete(listener as Listener)};
      });
    libraryApi.getResumeItems.mockResolvedValue({data: {Items: []}});
  });

  afterEach(() => {
    now?.mockRestore();
    now = undefined;
    // focusManager is global: back to its default "focused".
    focusManager.setFocused(undefined);
  });

  const renderResume = async () => {
    const view = renderHook(useResume, {wrapper});
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(libraryApi.getResumeItems).toHaveBeenCalledTimes(1);
    return view;
  };

  it('refetches a stale query when the app comes back', async () => {
    await renderResume();
    later(31 * 1000);

    changeTo('background');
    changeTo('active');

    await waitFor(() =>
      expect(libraryApi.getResumeItems).toHaveBeenCalledTimes(2),
    );
  });

  it('keeps a fresh query when the app comes back within 30 s', async () => {
    await renderResume();
    later(29 * 1000);

    changeTo('background');
    changeTo('active');

    await act(() => new Promise<void>((done) => setTimeout(done, 0)));
    expect(libraryApi.getResumeItems).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when the app goes to the background', async () => {
    await renderResume();
    later(31 * 1000);

    changeTo('background');

    await act(() => new Promise<void>((done) => setTimeout(done, 0)));
    expect(libraryApi.getResumeItems).toHaveBeenCalledTimes(1);
  });

  it('listens once, across user switches, and stops on unmount', async () => {
    const {result, unmount} = renderHook(
      () => ({session: useSession(), client: useQueryClient()}),
      {wrapper},
    );
    await signedIn(result);
    expect(listeners.size).toBe(1);

    act(() => result.current.session.switchUser());
    act(() => result.current.session.signIn(sessionFor(HOME, 'u2')));
    expect(listeners.size).toBe(1);

    unmount();
    expect(listeners.size).toBe(0);
  });
});

describe('Home hooks', () => {
  it('useResume fetches for the signed-in user', async () => {
    libraryApi.getResumeItems.mockResolvedValue({data: {Items: [{Id: 'm1'}]}});
    const {result} = renderHook(useResume, {wrapper});

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{Id: 'm1'}]);
    expect(libraryApi.getResumeItems).toHaveBeenCalledWith(
      expect.objectContaining({userId: 'u1', limit: 20}),
    );
  });

  it('fetches again for the next user, from the new client', async () => {
    libraryApi.getResumeItems.mockImplementation(async ({userId}) => ({
      data: {Items: [{Id: `item-${userId}`}]},
    }));
    const {result} = renderHook(
      () => ({session: useSession(), resume: useResume()}),
      {wrapper},
    );
    await waitFor(() =>
      expect(result.current.resume.data).toEqual([{Id: 'item-u1'}]),
    );

    act(() => result.current.session.switchUser());
    act(() => result.current.session.signIn(sessionFor(HOME, 'u2')));
    expect(result.current.resume.data).toBeUndefined();
    await waitFor(() =>
      expect(result.current.resume.data).toEqual([{Id: 'item-u2'}]),
    );
  });

  it('useHomeSections shows the default order when the prefs fail', async () => {
    displayPreferenceApi.getDisplayPreferences.mockRejectedValue(
      httpError(500),
    );
    const {result} = renderHook(useHomeSections, {wrapper});

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      'myMedia',
      'resume',
      'nextUp',
      'latest',
    ]);
  });

  it('useHomeSections expires the session on a 401', async () => {
    displayPreferenceApi.getDisplayPreferences.mockRejectedValue(
      httpError(401),
    );
    const {result} = renderHook(
      () => ({session: useSession(), sections: useHomeSections()}),
      {wrapper},
    );

    await waitFor(() =>
      expect(result.current.session.status).toBe('needsUser'),
    );
    expect(result.current.session.notice?.kind).toBe('expired');
    expect(displayPreferenceApi.getDisplayPreferences).toHaveBeenCalledTimes(1);
  });

  it('useLatest waits for a library id', async () => {
    const {result} = renderHook(() => useLatest(''), {wrapper});
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.isPending).toBe(true);
    expect(libraryApi.getLatestMedia).not.toHaveBeenCalled();
  });

  it('does not retry a 401', async () => {
    libraryApi.getResumeItems.mockRejectedValue(httpError(401));
    const {result} = renderHook(
      () => ({session: useSession(), resume: useResume()}),
      {wrapper},
    );

    await waitFor(() =>
      expect(result.current.session.status).toBe('needsUser'),
    );
    expect(libraryApi.getResumeItems).toHaveBeenCalledTimes(1);
  });
});

describe('expiring the session on a 401', () => {
  const failing = (error: unknown) => () => Promise.reject(error);
  let onUnauthorized: jest.Mock;
  let client: QueryClient;

  beforeEach(() => {
    onUnauthorized = jest.fn();
    client = createQueryClient(onUnauthorized);
  });

  // Stops the garbage-collection timers, so Jest can exit.
  afterEach(() => client.clear());

  it('calls onUnauthorized once when two queries 401 together', async () => {
    await Promise.allSettled([
      client.fetchQuery({queryKey: ['a'], queryFn: failing(httpError(401))}),
      client.fetchQuery({queryKey: ['b'], queryFn: failing(httpError(401))}),
    ]);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('calls onUnauthorized for a mutation 401', async () => {
    await client
      .getMutationCache()
      .build(client, {mutationFn: failing(httpError(401)), gcTime: 0})
      .execute(undefined)
      .catch(() => undefined);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('ignores a 500', async () => {
    await client
      .fetchQuery({queryKey: ['a'], queryFn: failing(httpError(500)), retry: 0})
      .catch(() => undefined);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('expires the session once when two rows 401 together', async () => {
    libraryApi.getResumeItems.mockRejectedValue(httpError(401));
    libraryApi.getLatestMedia.mockRejectedValue(httpError(401));
    const {result} = renderHook(
      () => ({
        session: useSession(),
        resume: useResume(),
        latest: useLatest('lib1'),
      }),
      {wrapper},
    );

    await waitFor(() =>
      expect(result.current.session.status).toBe('needsUser'),
    );
    expect(result.current.session.serverId).toBe('srv1');
    expect(result.current.session.notice).toEqual({
      kind: 'expired',
      message: 'Your saved login for melojms has expired. Sign in again.',
    });
    expect(store.clearToken).toHaveBeenCalledTimes(1);
    expect(store.clearToken).toHaveBeenCalledWith('srv1', 'u1');
    expect(service.logout).not.toHaveBeenCalled();
  });

  it('keeps the session on a 500', async () => {
    libraryApi.getResumeItems.mockRejectedValue(httpError(500));
    const {result} = renderHook(
      () => ({session: useSession(), resume: useResume()}),
      {wrapper},
    );

    // After the one retry, which waits 1 s.
    await waitFor(() => expect(result.current.resume.isError).toBe(true), {
      timeout: 3000,
    });
    expect(libraryApi.getResumeItems).toHaveBeenCalledTimes(2);
    expect(result.current.session.status).toBe('signedIn');
    expect(store.clearToken).not.toHaveBeenCalled();
  });

  it("ignores a 401 from the previous user's client", async () => {
    let reject: (error: unknown) => void = () => {};
    libraryApi.getResumeItems.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    libraryApi.getResumeItems.mockResolvedValue({data: {Items: []}});
    const {result} = renderHook(
      () => ({session: useSession(), resume: useResume()}),
      {wrapper},
    );
    await waitFor(() => expect(libraryApi.getResumeItems).toHaveBeenCalled());

    act(() => result.current.session.switchUser());
    act(() => result.current.session.signIn(sessionFor(HOME, 'u2')));
    await act(async () => reject(httpError(401)));

    expect(result.current.session.status).toBe('signedIn');
    expect(result.current.session.session?.user.Id).toBe('u2');
    expect(store.clearToken).not.toHaveBeenCalled();
  });
});

import {getLibraryApi} from '@jellyfin/sdk/lib/utils/api/library-api';
import {useQueryClient} from '@tanstack/react-query';
import {act, renderHook, waitFor} from '@testing-library/react-native';
import React, {ReactNode} from 'react';

import {homeKeys, useLatest, useResume} from '../../src/api/home';
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

jest.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({
  getLibraryApi: jest.fn(),
}));

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

  it('keeps data fresh for 30 s and ignores window focus', () => {
    const {queries} = createQueryClient().getDefaultOptions();
    expect(queries?.staleTime).toBe(30 * 1000);
    expect(queries?.refetchOnWindowFocus).toBe(false);
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

  it('useLatest waits for a library id', async () => {
    const {result} = renderHook(() => useLatest(''), {wrapper});
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.isPending).toBe(true);
    expect(libraryApi.getLatestMedia).not.toHaveBeenCalled();
  });

  it('does not retry a 401', async () => {
    libraryApi.getResumeItems.mockRejectedValue(httpError(401));
    const {result} = renderHook(useResume, {wrapper});

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(libraryApi.getResumeItems).toHaveBeenCalledTimes(1);
  });
});

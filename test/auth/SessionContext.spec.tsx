import {act, renderHook, waitFor} from '@testing-library/react-native';
import React, {ReactNode} from 'react';

import type {AuthService} from '../../src/auth/authService';
import {SessionProvider, useSession} from '../../src/auth/SessionContext';
import type {AuthState, AuthStore} from '../../src/auth/store';
import {
  fakeService,
  fakeStore,
  networkError,
  sessionFor,
  signedInState,
} from './fakes';

const renderSession = (
  state: AuthState,
  service: jest.Mocked<AuthService> = fakeService(),
  store: jest.Mocked<AuthStore> = fakeStore(state),
) => {
  const wrapper = ({children}: {children: ReactNode}) => (
    <SessionProvider authService={service} authStore={store}>
      {children}
    </SessionProvider>
  );
  return {...renderHook(() => useSession(), {wrapper}), service, store};
};

const settled = async (result: {current: {status: string}}) =>
  waitFor(() => expect(result.current.status).not.toBe('loading'));

describe('SessionProvider startup', () => {
  it('starts loading, then signs in with the saved token', async () => {
    const {result, service} = renderSession(signedInState());

    expect(result.current.status).toBe('loading');
    await settled(result);

    expect(service.restoreSession).toHaveBeenCalledWith('srv1', 'u1');
    expect(result.current.status).toBe('signedIn');
    expect(result.current.session?.user.Name).toBe('melojms');
    expect(result.current.serverId).toBe('srv1');
    expect(result.current.notice).toBeUndefined();
  });

  it('goes to the picker with a notice when the token expired', async () => {
    const service = fakeService();
    service.restoreSession.mockResolvedValue(undefined);
    const {result} = renderSession(signedInState(), service);
    await settled(result);

    expect(result.current.status).toBe('needsUser');
    expect(result.current.serverId).toBe('srv1');
    expect(result.current.session).toBeUndefined();
    expect(result.current.notice).toEqual({
      kind: 'expired',
      message: 'Your saved login for melojms has expired. Sign in again.',
    });
  });

  it('asks for a server when none is saved', async () => {
    const {result, service} = renderSession({
      servers: {},
      autoLogin: {mode: 'lastUser'},
    });
    await settled(result);

    expect(result.current.status).toBe('needsServer');
    expect(result.current.serverId).toBeUndefined();
    expect(service.restoreSession).not.toHaveBeenCalled();
  });

  it('shows an offline notice and retries the startup', async () => {
    const service = fakeService();
    service.restoreSession.mockRejectedValueOnce(networkError());
    const {result} = renderSession(signedInState(), service);
    await settled(result);

    expect(result.current.status).toBe('needsUser');
    expect(result.current.serverId).toBe('srv1');
    expect(result.current.notice).toEqual({
      kind: 'offline',
      message: "Can't reach Home.",
    });

    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await settled(result);

    expect(service.restoreSession).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('signedIn');
    expect(result.current.notice).toBeUndefined();
  });

  it('shows an error when the saved logins fail to load, then retries', async () => {
    const store = fakeStore(signedInState());
    store.getState.mockRejectedValueOnce(new Error('disk I/O'));
    const {result} = renderSession(signedInState(), fakeService(), store);
    await settled(result);

    expect(result.current.status).toBe('error');
    expect(result.current.notice).toBeUndefined();
    expect(result.current.error).toBe("Couldn't load saved logins.");

    act(() => result.current.retry());
    await settled(result);

    expect(result.current.status).toBe('signedIn');
    expect(result.current.error).toBeUndefined();
  });

  it('goes to the picker on the last server when auto-login is off', async () => {
    const {result, service} = renderSession({
      ...signedInState(),
      autoLogin: {mode: 'disabled'},
    });
    await settled(result);

    expect(result.current.status).toBe('needsUser');
    expect(result.current.serverId).toBe('srv1');
    expect(service.restoreSession).not.toHaveBeenCalled();
  });

  it('falls back to the most recently used server', async () => {
    const {result} = renderSession({
      ...signedInState(),
      lastServerId: undefined,
      lastUserId: undefined,
      autoLogin: {mode: 'disabled'},
    });
    await settled(result);

    expect(result.current.status).toBe('needsUser');
    expect(result.current.serverId).toBe('srv2');
  });

  it('goes to the picker when the specific user has no token', async () => {
    const {result, service} = renderSession({
      ...signedInState(),
      autoLogin: {mode: 'specificUser', serverId: 'srv1', userId: 'u2'},
    });
    await settled(result);

    expect(result.current.status).toBe('needsUser');
    expect(result.current.serverId).toBe('srv1');
    expect(result.current.notice).toBeUndefined();
    expect(service.restoreSession).not.toHaveBeenCalled();
  });

  it('restores the specific user rather than the last one', async () => {
    const state = signedInState();
    state.servers.srv1.users.u2.accessToken = 'token-2';
    const {result, service} = renderSession({
      ...state,
      autoLogin: {mode: 'specificUser', serverId: 'srv1', userId: 'u2'},
    });
    await settled(result);

    expect(service.restoreSession).toHaveBeenCalledWith('srv1', 'u2');
  });
});

describe('SessionProvider actions', () => {
  it('signOut logs out and shows the picker for the same server', async () => {
    const {result, service} = renderSession(signedInState());
    await settled(result);
    const session = result.current.session;

    await act(() => result.current.signOut());

    expect(service.logout).toHaveBeenCalledWith(session);
    expect(result.current.status).toBe('needsUser');
    expect(result.current.serverId).toBe('srv1');
    expect(result.current.session).toBeUndefined();
  });

  it('signOut still shows the picker when logout fails', async () => {
    const service = fakeService();
    service.logout.mockRejectedValue(new Error('storage full'));
    const {result} = renderSession(signedInState(), service);
    await settled(result);

    await act(async () => {
      await expect(result.current.signOut()).rejects.toThrow('storage full');
    });

    expect(result.current.status).toBe('needsUser');
    expect(result.current.serverId).toBe('srv1');
    expect(result.current.session).toBeUndefined();
  });

  it('clearNotice removes the notice and keeps the status', async () => {
    const service = fakeService();
    service.restoreSession.mockResolvedValue(undefined);
    const {result} = renderSession(signedInState(), service);
    await settled(result);
    expect(result.current.notice).toBeDefined();

    act(() => result.current.clearNotice());

    expect(result.current.notice).toBeUndefined();
    expect(result.current.status).toBe('needsUser');
    expect(result.current.serverId).toBe('srv1');
  });

  it('switchUser keeps the token', async () => {
    const {result, service, store} = renderSession(signedInState());
    await settled(result);

    act(() => result.current.switchUser());

    expect(result.current.status).toBe('needsUser');
    expect(result.current.serverId).toBe('srv1');
    expect(service.logout).not.toHaveBeenCalled();
    expect(store.clearToken).not.toHaveBeenCalled();
  });

  it('signIn and selectServer update the state', async () => {
    const {result} = renderSession({
      servers: {},
      autoLogin: {mode: 'lastUser'},
    });
    await settled(result);

    act(() => result.current.selectServer('srv2'));
    expect(result.current.status).toBe('needsUser');
    expect(result.current.serverId).toBe('srv2');

    const session = sessionFor();
    act(() => result.current.signIn(session));
    expect(result.current.status).toBe('signedIn');
    expect(result.current.session).toBe(session);
    expect(result.current.serverId).toBe('srv1');
  });

  it('ignores a startup that finishes after the user signed in', async () => {
    const service = fakeService();
    let finish: (value: undefined) => void = () => {};
    service.restoreSession.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const {result} = renderSession(signedInState(), service);
    await waitFor(() => expect(service.restoreSession).toHaveBeenCalled());

    const session = sessionFor();
    act(() => result.current.signIn(session));
    await act(async () => finish(undefined));

    expect(result.current.status).toBe('signedIn');
    expect(result.current.notice).toBeUndefined();
  });

  it('throws outside a provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);
  });
});

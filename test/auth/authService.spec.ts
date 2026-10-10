import type {Api} from '@jellyfin/sdk';
import {getAuthenticationApi} from '@jellyfin/sdk/lib/utils/api/authentication-api';
import {getSessionApi} from '@jellyfin/sdk/lib/utils/api/session-api';
import {getUserApi} from '@jellyfin/sdk/lib/utils/api/user-api';

import {AuthError, createAuthService} from '../../src/auth/authService';
import type {Session} from '../../src/auth/authService';
import {createAuthStore} from '../../src/auth/store';
import type {AuthStore, KeyValueStorage} from '../../src/auth/store';

jest.mock('@jellyfin/sdk/lib/utils/api/user-api', () => ({
  getUserApi: jest.fn(),
}));
jest.mock('@jellyfin/sdk/lib/utils/api/authentication-api', () => ({
  getAuthenticationApi: jest.fn(),
}));
jest.mock('@jellyfin/sdk/lib/utils/api/session-api', () => ({
  getSessionApi: jest.fn(),
}));

const authApi = {
  authenticateUserByName: jest.fn(),
  authenticateWithQuickConnect: jest.fn(),
  initiateQuickConnect: jest.fn(),
  getQuickConnectState: jest.fn(),
};
const userApi = {
  getCurrentUser: jest.fn(),
};
const sessionApi = {
  reportSessionEnded: jest.fn(),
};

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: {status},
  });

const networkError = () =>
  Object.assign(new Error('Network Error'), {isAxiosError: true});

const memoryStorage = (): KeyValueStorage => {
  const data = new Map<string, string>();
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
};

const SERVER = {
  id: 'srv1',
  name: 'Home',
  address: 'https://jellyfin.example.com',
};
const AUTH_RESULT = {
  AccessToken: 'token-1',
  User: {Id: 'u1', Name: 'melojms'},
  ServerId: 'srv1',
};

let store: AuthStore;
let createApi: jest.Mock;

const setup = async () => {
  store = createAuthStore(memoryStorage());
  await store.upsertServer(SERVER);
  createApi = jest.fn(
    async (basePath: string, accessToken?: string) =>
      ({basePath, accessToken} as unknown as Api),
  );
  return createAuthService({store, createApi});
};

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  (getUserApi as jest.Mock).mockReturnValue(userApi);
  (getAuthenticationApi as jest.Mock).mockReturnValue(authApi);
  (getSessionApi as jest.Mock).mockReturnValue(sessionApi);
});

describe('loginWithPassword', () => {
  it('authenticates by name and saves the token', async () => {
    const auth = await setup();
    authApi.authenticateUserByName.mockResolvedValue({data: AUTH_RESULT});

    const session = await auth.loginWithPassword('srv1', 'melojms', 'pw');

    expect(authApi.authenticateUserByName).toHaveBeenCalledWith({
      authenticateUserByName: {Username: 'melojms', Pw: 'pw'},
    });
    expect(session.accessToken).toBe('token-1');
    expect(session.user.Id).toBe('u1');
    expect(createApi).toHaveBeenLastCalledWith(SERVER.address, 'token-1');
    expect(await store.getToken('srv1', 'u1')).toBe('token-1');
    expect(await store.getState()).toMatchObject({
      lastServerId: 'srv1',
      lastUserId: 'u1',
    });
  });

  it('maps 401 to invalid-credentials', async () => {
    const auth = await setup();
    authApi.authenticateUserByName.mockRejectedValue(httpError(401));

    await expect(
      auth.loginWithPassword('srv1', 'x', 'y'),
    ).rejects.toMatchObject({code: 'invalid-credentials'});
  });

  it('rejects an unknown server', async () => {
    const auth = await setup();
    await expect(
      auth.loginWithPassword('nope', 'x', 'y'),
    ).rejects.toMatchObject({code: 'unknown-server'});
  });
});

describe('Quick Connect', () => {
  const POLL = 1000;
  const TIMEOUT = 10_000;

  const start = async () => {
    const auth = await setup();
    authApi.initiateQuickConnect.mockResolvedValue({
      data: {Code: '123456', Secret: 'secret'},
    });
    jest.useFakeTimers();
    return auth.startQuickConnect('srv1', {
      pollIntervalMs: POLL,
      timeoutMs: TIMEOUT,
    });
  };

  it('polls until approved, then authenticates and saves the token', async () => {
    const attempt = await start();
    expect(attempt.code).toBe('123456');

    authApi.getQuickConnectState
      .mockResolvedValueOnce({data: {Authenticated: false}})
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce({data: {Authenticated: true}});
    authApi.authenticateWithQuickConnect.mockResolvedValue({data: AUTH_RESULT});

    await jest.advanceTimersByTimeAsync(POLL * 3);
    const session = await attempt.session;

    expect(authApi.getQuickConnectState).toHaveBeenCalledTimes(3);
    expect(authApi.getQuickConnectState).toHaveBeenCalledWith({
      secret: 'secret',
    });
    expect(authApi.authenticateWithQuickConnect).toHaveBeenCalledWith({
      quickConnectDto: {Secret: 'secret'},
    });
    expect(session.user.Name).toBe('melojms');
    expect(await store.getToken('srv1', 'u1')).toBe('token-1');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('times out when the code is never approved', async () => {
    const attempt = await start();
    authApi.getQuickConnectState.mockResolvedValue({
      data: {Authenticated: false},
    });
    const result = attempt.session.catch((e) => e);

    await jest.advanceTimersByTimeAsync(TIMEOUT);

    const error = await result;
    expect(error).toBeInstanceOf(AuthError);
    expect(error.code).toBe('quick-connect-timeout');
    const polls = authApi.getQuickConnectState.mock.calls.length;
    await jest.advanceTimersByTimeAsync(POLL * 5);
    expect(authApi.getQuickConnectState).toHaveBeenCalledTimes(polls);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops polling when cancelled', async () => {
    const attempt = await start();
    authApi.getQuickConnectState.mockResolvedValue({
      data: {Authenticated: false},
    });
    const result = attempt.session.catch((e) => e);

    await jest.advanceTimersByTimeAsync(POLL * 2);
    attempt.cancel();

    expect((await result).code).toBe('quick-connect-cancelled');
    await jest.advanceTimersByTimeAsync(TIMEOUT);
    expect(authApi.getQuickConnectState).toHaveBeenCalledTimes(2);
    expect(authApi.authenticateWithQuickConnect).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('fails when the server forgets the code', async () => {
    const attempt = await start();
    authApi.getQuickConnectState.mockRejectedValue(httpError(404));
    const result = attempt.session.catch((e) => e);

    await jest.advanceTimersByTimeAsync(POLL);

    expect((await result).message).toBe('HTTP 404');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reports Quick Connect disabled on the server', async () => {
    const auth = await setup();
    authApi.initiateQuickConnect.mockRejectedValue(httpError(401));

    await expect(auth.startQuickConnect('srv1')).rejects.toMatchObject({
      code: 'quick-connect-disabled',
    });
  });
});

describe('restoreSession', () => {
  const login = async () => {
    const auth = await setup();
    await store.saveLogin('srv1', {id: 'u1', name: 'melojms'}, 'token-1');
    return auth;
  };

  it('returns the session when the token is valid', async () => {
    const auth = await login();
    userApi.getCurrentUser.mockResolvedValue({
      data: {Id: 'u1', Name: 'melojms'},
    });

    const session = await auth.restoreSession('srv1', 'u1');

    expect(session?.user.Name).toBe('melojms');
    expect(createApi).toHaveBeenCalledWith(SERVER.address, 'token-1');
  });

  it('clears the token on 401', async () => {
    const auth = await login();
    userApi.getCurrentUser.mockRejectedValue(httpError(401));

    expect(await auth.restoreSession('srv1', 'u1')).toBeUndefined();
    expect(await store.getToken('srv1', 'u1')).toBeUndefined();
  });

  it('keeps the token on network errors', async () => {
    const auth = await login();
    userApi.getCurrentUser.mockRejectedValue(networkError());

    await expect(auth.restoreSession('srv1', 'u1')).rejects.toThrow(
      'Network Error',
    );
    expect(await store.getToken('srv1', 'u1')).toBe('token-1');
  });

  it('returns undefined without calling the server when there is no token', async () => {
    const auth = await setup();
    expect(await auth.restoreSession('srv1', 'u1')).toBeUndefined();
    expect(userApi.getCurrentUser).not.toHaveBeenCalled();
  });
});

describe('logout', () => {
  it('ends the server session and clears the token, even if the server call fails', async () => {
    const auth = await setup();
    await store.saveLogin('srv1', {id: 'u1', name: 'melojms'}, 'token-1');
    sessionApi.reportSessionEnded.mockRejectedValue(networkError());
    const api = {} as Api;
    const session = {
      server: (await store.getServer('srv1'))!,
      user: {Id: 'u1', Name: 'melojms'},
      accessToken: 'token-1',
      api,
    } as Session;

    await auth.logout(session);

    expect(getSessionApi).toHaveBeenCalledWith(api);
    expect(sessionApi.reportSessionEnded).toHaveBeenCalled();
    expect(await store.getToken('srv1', 'u1')).toBeUndefined();
  });
});

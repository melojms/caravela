/* eslint-env jest */
import type {Api} from '@jellyfin/sdk';

import type {AuthService, Session} from '../../src/auth/authService';
import type {AuthState, AuthStore, StoredServer} from '../../src/auth/store';

export const server = (
  id: string,
  name: string,
  lastUsed: number,
  users: StoredServer['users'] = {},
): StoredServer => ({
  id,
  name,
  address: `https://${id}.example.com`,
  lastUsed,
  users,
});

export const HOME = server('srv1', 'Home', 2, {
  u1: {id: 'u1', name: 'melojms', accessToken: 'token-1', lastUsed: 2},
  u2: {id: 'u2', name: 'guest', lastUsed: 1},
});
export const CABIN = server('srv2', 'Cabin', 5);

// Deep copy, so a test can edit its state without leaking into the next one.
export const signedInState = (): AuthState =>
  JSON.parse(
    JSON.stringify({
      servers: {srv1: HOME, srv2: CABIN},
      lastServerId: 'srv1',
      lastUserId: 'u1',
      autoLogin: {mode: 'lastUser'},
    }),
  );

export const sessionFor = (
  stored: StoredServer = HOME,
  userId = 'u1',
): Session => ({
  server: stored,
  user: {Id: userId, Name: stored.users[userId]?.name ?? userId},
  accessToken: stored.users[userId]?.accessToken ?? 'token',
  api: {} as Api,
});

export const fakeStore = (state: AuthState) =>
  ({
    getState: jest.fn(async () => state),
    getServer: jest.fn(async (serverId: string) => state.servers[serverId]),
    clearToken: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<AuthStore>);

export const fakeService = () =>
  ({
    restoreSession: jest.fn(async () => sessionFor()),
    logout: jest.fn(async () => undefined),
    loginWithPassword: jest.fn(),
    startQuickConnect: jest.fn(),
    getPublicUsers: jest.fn(async () => []),
  } as unknown as jest.Mocked<AuthService>);

export const networkError = () =>
  Object.assign(new Error('Network Error'), {isAxiosError: true});

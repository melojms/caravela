import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistent store for saved servers, users and access tokens.
 *
 * Vega has no secure key/value storage for apps, so everything (tokens
 * included) lives in AsyncStorage: an unencrypted SQLite database inside the
 * app's sandbox. The store sits behind {@link AuthStore} so it can be mocked
 * or swapped for secure storage later.
 */

/** Minimal key/value backend; AsyncStorage satisfies it. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type AutoLogin =
  | {mode: 'disabled'}
  | {mode: 'lastUser'}
  | {mode: 'specificUser'; serverId: string; userId: string};

export interface StoredUser {
  id: string;
  name: string;
  /** Missing when the user logged out or the token was rejected. */
  accessToken?: string;
  lastUsed: number;
}

export interface StoredServer {
  id: string;
  name: string;
  /** Base URL picked by server discovery, without a trailing slash. */
  address: string;
  version?: string;
  lastUsed: number;
  users: Record<string, StoredUser>;
}

export interface AuthState {
  deviceId?: string;
  servers: Record<string, StoredServer>;
  lastServerId?: string;
  lastUserId?: string;
  autoLogin: AutoLogin;
}

export interface ServerInput {
  id: string;
  name: string;
  address: string;
  version?: string;
}

export interface UserInput {
  id: string;
  name: string;
}

export interface AuthStore {
  getState(): Promise<AuthState>;
  /** Returns the persisted device ID, generating it on first use. */
  getDeviceId(): Promise<string>;
  getServer(serverId: string): Promise<StoredServer | undefined>;
  getToken(serverId: string, userId: string): Promise<string | undefined>;
  /** Adds the server or updates its name/address/version; keeps its users. */
  upsertServer(server: ServerInput): Promise<StoredServer>;
  removeServer(serverId: string): Promise<void>;
  /** Saves the user's token and marks the server and user as last used. */
  saveLogin(
    serverId: string,
    user: UserInput,
    accessToken: string,
  ): Promise<void>;
  clearToken(serverId: string, userId: string): Promise<void>;
  removeUser(serverId: string, userId: string): Promise<void>;
  setAutoLogin(autoLogin: AutoLogin): Promise<void>;
}

export const STORAGE_KEY = 'caravela.auth.v1';

const emptyState = (): AuthState => ({
  servers: {},
  autoLogin: {mode: 'lastUser'},
});

/**
 * Random UUID v4. Hermes has no `crypto`, but the ID only has to be unique,
 * not secret.
 */
export function generateDeviceId(): string {
  const hex = '0123456789abcdef';
  const pick = (chars: string) =>
    chars[Math.floor(Math.random() * chars.length)];
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
    pick(c === 'x' ? hex : '89ab'),
  );
}

export function createAuthStore(
  storage: KeyValueStorage = AsyncStorage,
  now: () => number = Date.now,
): AuthStore {
  let cache: AuthState | undefined;
  // Serializes read-modify-write cycles so concurrent calls don't lose updates.
  let queue: Promise<unknown> = Promise.resolve();

  const load = async (): Promise<AuthState> => {
    if (!cache) {
      const raw = await storage.getItem(STORAGE_KEY);
      cache = raw ? {...emptyState(), ...JSON.parse(raw)} : emptyState();
    }
    return cache as AuthState;
  };

  const read = <T>(fn: (state: AuthState) => T): Promise<T> => {
    const result = queue.then(async () => fn(await load()));
    queue = result.catch(() => undefined);
    return result;
  };

  const write = <T>(fn: (state: AuthState) => T): Promise<T> => {
    const result = queue.then(async () => {
      const next: AuthState = clone(await load());
      const value = fn(next);
      await storage.setItem(STORAGE_KEY, JSON.stringify(next));
      cache = next;
      return value;
    });
    queue = result.catch(() => undefined);
    return result;
  };

  return {
    getState: () => read((state) => clone(state)),

    getDeviceId: async () => {
      const existing = await read((state) => state.deviceId);
      if (existing) {
        return existing;
      }
      return write((state) => {
        state.deviceId ??= generateDeviceId();
        return state.deviceId;
      });
    },

    getServer: (serverId) =>
      read((state) => {
        const server = state.servers[serverId];
        return server && clone(server);
      }),

    getToken: (serverId, userId) =>
      read((state) => state.servers[serverId]?.users[userId]?.accessToken),

    upsertServer: (input) =>
      write((state) => {
        const existing = state.servers[input.id];
        const server: StoredServer = {
          ...existing,
          ...input,
          users: existing?.users ?? {},
          lastUsed: now(),
        };
        state.servers[input.id] = server;
        return clone(server);
      }),

    removeServer: (serverId) =>
      write((state) => {
        delete state.servers[serverId];
        if (state.lastServerId === serverId) {
          state.lastServerId = undefined;
          state.lastUserId = undefined;
        }
        if (
          state.autoLogin.mode === 'specificUser' &&
          state.autoLogin.serverId === serverId
        ) {
          state.autoLogin = {mode: 'lastUser'};
        }
      }),

    saveLogin: (serverId, user, accessToken) =>
      write((state) => {
        const server = state.servers[serverId];
        if (!server) {
          throw new Error(`Unknown server ${serverId}`);
        }
        const timestamp = now();
        server.users[user.id] = {
          id: user.id,
          name: user.name,
          accessToken,
          lastUsed: timestamp,
        };
        server.lastUsed = timestamp;
        state.lastServerId = serverId;
        state.lastUserId = user.id;
      }),

    clearToken: (serverId, userId) =>
      write((state) => {
        const user = state.servers[serverId]?.users[userId];
        if (user) {
          delete user.accessToken;
        }
      }),

    removeUser: (serverId, userId) =>
      write((state) => {
        delete state.servers[serverId]?.users[userId];
        if (state.lastServerId === serverId && state.lastUserId === userId) {
          state.lastUserId = undefined;
        }
        if (
          state.autoLogin.mode === 'specificUser' &&
          state.autoLogin.serverId === serverId &&
          state.autoLogin.userId === userId
        ) {
          state.autoLogin = {mode: 'lastUser'};
        }
      }),

    setAutoLogin: (autoLogin) =>
      write((state) => {
        state.autoLogin = autoLogin;
      }),
  };
}

// The state is plain JSON, so a JSON round trip is a safe deep copy.
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

let defaultStore: AuthStore | undefined;

/** App-wide store backed by AsyncStorage. */
export function getAuthStore(): AuthStore {
  defaultStore ??= createAuthStore();
  return defaultStore;
}

import {
  createAuthStore,
  generateDeviceId,
  STORAGE_KEY,
} from '../../src/auth/store';
import type {KeyValueStorage} from '../../src/auth/store';

const memoryStorage = (): KeyValueStorage & {data: Map<string, string>} => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
};

const server = {
  id: 'srv1',
  name: 'Home',
  address: 'https://jellyfin.example.com',
  version: '10.11.2',
};

describe('auth store', () => {
  it('round-trips servers, users, tokens and settings through storage', async () => {
    const storage = memoryStorage();
    const store = createAuthStore(storage, () => 1000);

    await store.upsertServer(server);
    await store.saveLogin('srv1', {id: 'u1', name: 'melojms'}, 'token-1');
    await store.setAutoLogin({
      mode: 'specificUser',
      serverId: 'srv1',
      userId: 'u1',
    });
    const deviceId = await store.getDeviceId();

    // A fresh store over the same storage sees everything.
    const reloaded = createAuthStore(storage);
    expect(await reloaded.getState()).toEqual({
      deviceId,
      servers: {
        srv1: {
          ...server,
          lastUsed: 1000,
          users: {
            u1: {
              id: 'u1',
              name: 'melojms',
              accessToken: 'token-1',
              lastUsed: 1000,
            },
          },
        },
      },
      lastServerId: 'srv1',
      lastUserId: 'u1',
      autoLogin: {mode: 'specificUser', serverId: 'srv1', userId: 'u1'},
    });
    expect(await reloaded.getToken('srv1', 'u1')).toBe('token-1');
    expect(await reloaded.getDeviceId()).toBe(deviceId);
  });

  it('starts empty with auto-login set to the last user', async () => {
    const store = createAuthStore(memoryStorage());
    expect(await store.getState()).toEqual({
      servers: {},
      autoLogin: {mode: 'lastUser'},
    });
  });

  it('generates the device ID once, even under concurrent calls', async () => {
    const storage = memoryStorage();
    const store = createAuthStore(storage);
    const [a, b] = await Promise.all([
      store.getDeviceId(),
      store.getDeviceId(),
    ]);
    expect(a).toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!).deviceId).toBe(a);
  });

  it('keeps users when a server is updated', async () => {
    const store = createAuthStore(memoryStorage());
    await store.upsertServer(server);
    await store.saveLogin('srv1', {id: 'u1', name: 'melojms'}, 'token-1');
    await store.upsertServer({...server, address: 'http://10.0.0.2:8096'});

    const saved = await store.getServer('srv1');
    expect(saved?.address).toBe('http://10.0.0.2:8096');
    expect(saved?.users.u1.accessToken).toBe('token-1');
  });

  it('clears a token but keeps the user', async () => {
    const store = createAuthStore(memoryStorage());
    await store.upsertServer(server);
    await store.saveLogin('srv1', {id: 'u1', name: 'melojms'}, 'token-1');
    await store.clearToken('srv1', 'u1');

    expect(await store.getToken('srv1', 'u1')).toBeUndefined();
    expect((await store.getServer('srv1'))?.users.u1.name).toBe('melojms');
  });

  it('resets last ids and auto-login when the server is removed', async () => {
    const store = createAuthStore(memoryStorage());
    await store.upsertServer(server);
    await store.saveLogin('srv1', {id: 'u1', name: 'melojms'}, 'token-1');
    await store.setAutoLogin({
      mode: 'specificUser',
      serverId: 'srv1',
      userId: 'u1',
    });
    await store.removeServer('srv1');

    expect(await store.getState()).toEqual({
      servers: {},
      autoLogin: {mode: 'lastUser'},
    });
  });

  it('rejects a login for an unknown server', async () => {
    const store = createAuthStore(memoryStorage());
    await expect(
      store.saveLogin('nope', {id: 'u1', name: 'x'}, 't'),
    ).rejects.toThrow('Unknown server');
  });

  it('does not let callers mutate the stored state', async () => {
    const store = createAuthStore(memoryStorage());
    await store.upsertServer(server);
    const state = await store.getState();
    state.servers.srv1.name = 'changed';
    expect((await store.getServer('srv1'))?.name).toBe('Home');
  });

  it('generateDeviceId returns distinct ids', () => {
    expect(generateDeviceId()).not.toBe(generateDeviceId());
  });
});

import {
  CLIENT_NAME,
  createApi,
  DEVICE_NAME,
  getJellyfin,
  resetJellyfinForTests,
} from '../../src/api/client';
import type {AuthStore} from '../../src/auth/store';
import {version} from '../../package.json';

const storeWithDeviceId = (deviceId: string) =>
  ({getDeviceId: jest.fn(async () => deviceId)} as unknown as AuthStore);

describe('api client', () => {
  beforeEach(resetJellyfinForTests);

  it('builds one Jellyfin instance with Caravela client and device info', async () => {
    const store = storeWithDeviceId('device-1');
    const [a, b] = await Promise.all([getJellyfin(store), getJellyfin(store)]);

    expect(a).toBe(b);
    expect(store.getDeviceId).toHaveBeenCalledTimes(1);
    expect(a.clientInfo).toEqual({name: CLIENT_NAME, version});
    expect(a.deviceInfo).toEqual({name: DEVICE_NAME, id: 'device-1'});
  });

  it('sends the plain device name "Fire TV", with no "Vega" in it', () => {
    expect(DEVICE_NAME).toBe('Fire TV');
    expect(DEVICE_NAME).not.toMatch(/vega/i);
  });

  it('creates an Api for a server URL and token', async () => {
    await getJellyfin(storeWithDeviceId('device-1'));
    const api = await createApi('https://jellyfin.example.com/', 'token-1');

    expect(api.basePath).toBe('https://jellyfin.example.com');
    expect(api.accessToken).toBe('token-1');
    expect(api.authorizationHeader).toContain('Client="Caravela"');
    expect(api.authorizationHeader).toContain('DeviceId="device-1"');
    expect(api.authorizationHeader).toContain('Token="token-1"');
  });

  it('retries when loading the device ID fails', async () => {
    const failing = {
      getDeviceId: jest.fn(async () => {
        throw new Error('disk');
      }),
    } as unknown as AuthStore;
    await expect(getJellyfin(failing)).rejects.toThrow('disk');

    const jellyfin = await getJellyfin(storeWithDeviceId('device-2'));
    expect(jellyfin.deviceInfo.id).toBe('device-2');
  });
});

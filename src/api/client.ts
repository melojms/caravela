import {Jellyfin} from '@jellyfin/sdk';
import type {Api} from '@jellyfin/sdk';

import {version} from '../../package.json';
import {getAuthStore} from '../auth/store';
import type {AuthStore} from '../auth/store';

export const CLIENT_NAME = 'Caravela';
export const CLIENT_VERSION = version;
export const DEVICE_NAME = 'Fire TV';

/** Builds the SDK instance with Caravela's client info and the given device ID. */
export function createJellyfin(deviceId: string): Jellyfin {
  return new Jellyfin({
    clientInfo: {name: CLIENT_NAME, version: CLIENT_VERSION},
    deviceInfo: {name: DEVICE_NAME, id: deviceId},
  });
}

let jellyfin: Promise<Jellyfin> | undefined;

/**
 * Returns the app-wide SDK instance. It is built once, after the persisted
 * device ID is loaded (or generated), so every session reports the same device.
 */
export function getJellyfin(
  store: AuthStore = getAuthStore(),
): Promise<Jellyfin> {
  if (!jellyfin) {
    jellyfin = store.getDeviceId().then(createJellyfin);
    // Let a later call retry if storage failed.
    jellyfin.catch(() => {
      jellyfin = undefined;
    });
  }
  return jellyfin;
}

/** Creates an `Api` for a server, authenticated when `accessToken` is given. */
export async function createApi(
  serverUrl: string,
  accessToken?: string,
): Promise<Api> {
  return (await getJellyfin()).createApi(serverUrl, accessToken);
}

/** Test hook: forgets the cached SDK instance. */
export function resetJellyfinForTests(): void {
  jellyfin = undefined;
}

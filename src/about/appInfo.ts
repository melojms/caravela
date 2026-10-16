import type {Api} from '@jellyfin/sdk';
import {getSystemApi} from '@jellyfin/sdk/lib/utils/api/system-api';
import {skipToken, useQuery} from '@tanstack/react-query';

import {CLIENT_VERSION} from '../api/client';
import {useSession} from '../auth/SessionContext';

export const SOURCE_URL = 'https://github.com/melojms/caravela';
export const PRIVACY_URL = 'https://melojms.github.io/caravela/privacy';
export const LICENSE_NAME = 'GPL-2.0-or-later';

export interface AppVersion {
  version: string;
  build?: string;
}

/**
 * The build number for a version: major * 1000000 + minor * 1000 + patch
 * (0.1.1 -> 1001), the formula scripts/build-release.sh passes to the build.
 * It must never change: a later version could get a lower build number.
 * Undefined unless the version is plain X.Y.Z with minor and patch below 1000.
 */
export function getBuildNumber(version: string): number | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return undefined;
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor >= 1000 || patch >= 1000) {
    return undefined;
  }
  return major * 1000000 + minor * 1000 + patch;
}

/**
 * The app's version (package.json, which the release workflow bumps with
 * manifest.toml) and the build number the release build derives from it.
 */
export const getAppVersion = (version = CLIENT_VERSION): AppVersion => ({
  version,
  build: getBuildNumber(version)?.toString(),
});

export interface ServerInfo {
  name?: string;
  version?: string;
}

/** The server's name and Jellyfin version, from its public system info. */
export async function fetchServerInfo(api: Api): Promise<ServerInfo> {
  const {data} = await getSystemApi(api).getPublicSystemInfo();
  return {
    name: data.ServerName ?? undefined,
    version: data.Version ?? undefined,
  };
}

/** Query key; starts with the server and user so caches never mix. */
export const serverInfoKeys = (serverId: string, userId: string) =>
  ['serverInfo', serverId, userId] as const;

/**
 * The current server's name and version. The stored ones (from sign-in, so
 * stale after a server upgrade) show while the fetch loads or when it fails.
 * Undefined without a session.
 */
export function useServerInfo(): ServerInfo | undefined {
  const {session} = useSession();
  const api = session?.api;
  const {data} = useQuery({
    queryKey: serverInfoKeys(session?.server.id ?? '', session?.user.Id ?? ''),
    queryFn: api ? () => fetchServerInfo(api) : skipToken,
  });
  if (!session) {
    return undefined;
  }
  return {
    name: data?.name ?? session.server.name,
    version: data?.version ?? session.server.version,
  };
}

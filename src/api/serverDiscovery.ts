import {isAxiosError} from 'axios';
import type {PublicSystemInfo} from '@jellyfin/sdk/lib/generated-client/models/public-system-info';
import {getSystemApi} from '@jellyfin/sdk/lib/utils/api/system-api';
import {
  compareVersions,
  getDisplayVersion,
} from '@jellyfin/sdk/lib/utils/versioning';

import {createApi} from './client';

/** Matches the 12.x API that @jellyfin/sdk 1.0 is generated from. */
export const MIN_SERVER_VERSION = '12.0.0';

const HTTP_PORT = 8096;
const HTTPS_PORT = 8920;
const PROBE_TIMEOUT_MS = 5000;

export type ServerDiscoveryErrorCode =
  | 'invalid-address'
  | 'unreachable'
  | 'unsupported-version'
  | 'not-jellyfin';

export class ServerDiscoveryError extends Error {
  constructor(
    readonly code: ServerDiscoveryErrorCode,
    message: string,
    /** Server version, for `unsupported-version`. */
    readonly version?: string,
  ) {
    super(message);
    this.name = 'ServerDiscoveryError';
  }
}

export interface DiscoveredServer {
  address: string;
  systemInfo: PublicSystemInfo & {Id: string; Version: string};
}

export type Probe = (address: string) => Promise<PublicSystemInfo>;

// scheme? host (name, IPv4 or [IPv6]) port? path?
const ADDRESS_PATTERN =
  /^(?:(https?):\/\/)?(\[[0-9a-f:.]+\]|[^/:?#\s[\]]+)(?::(\d{1,5}))?(\/[^?#\s]*)?$/i;

/**
 * Turns a typed address into candidate base URLs, most preferred first.
 *
 * - No scheme: https is tried before http.
 * - No port: the bare address plus Jellyfin's default port for the scheme
 *   (8920 for https, 8096 for http).
 * - Scheme and port given: the address is used as is.
 */
export function getAddressCandidates(input: string): string[] {
  const match = ADDRESS_PATTERN.exec(input.trim());
  const port = match?.[3] === undefined ? undefined : Number(match[3]);
  if (!match || (port !== undefined && (port < 1 || port > 65535))) {
    throw new ServerDiscoveryError(
      'invalid-address',
      `"${input}" is not a valid server address.`,
    );
  }
  const scheme = match[1]?.toLowerCase();
  const host = match[2].toLowerCase();
  const path = (match[4] ?? '').replace(/\/+$/, '');

  const schemes = scheme ? [scheme] : ['https', 'http'];
  const candidates: string[] = [];
  for (const s of schemes) {
    if (port !== undefined) {
      candidates.push(`${s}://${host}:${port}${path}`);
    } else if (s === 'https') {
      candidates.push(
        `https://${host}${path}`,
        `https://${host}:${HTTPS_PORT}${path}`,
      );
    } else {
      candidates.push(
        `http://${host}:${HTTP_PORT}${path}`,
        `http://${host}${path}`,
      );
    }
  }
  return candidates;
}

/**
 * Pre-release suffixes such as "-rc1" are ignored; versions that still
 * aren't numeric count as unsupported.
 */
export function isVersionSupported(
  version: string,
  minimum: string = MIN_SERVER_VERSION,
): boolean {
  try {
    return compareVersions(version.split('-')[0], minimum) >= 0;
  } catch {
    return false;
  }
}

export const probePublicSystemInfo: Probe = async (address) => {
  const api = await createApi(address);
  const {data} = await getSystemApi(api).getPublicSystemInfo({
    timeout: PROBE_TIMEOUT_MS,
  });
  return data;
};

/**
 * Probes every candidate for a typed address in parallel and returns the most
 * preferred one that answers as a supported Jellyfin server.
 *
 * Errors, by priority: `unsupported-version` when a Jellyfin server answered
 * but is too old, `not-jellyfin` when something answered over HTTP but not as
 * Jellyfin, and `unreachable` when every candidate failed at the network level.
 */
export async function discoverServer(
  input: string,
  probe: Probe = probePublicSystemInfo,
): Promise<DiscoveredServer> {
  const candidates = getAddressCandidates(input);
  const results = await Promise.allSettled(candidates.map((c) => probe(c)));

  let unsupportedVersion: string | undefined;
  // Set when something answered over HTTP, but not as Jellyfin.
  let answered = false;
  for (let i = 0; i < candidates.length; i++) {
    const result = results[i];
    if (result.status !== 'fulfilled') {
      answered ||= isAxiosError(result.reason) && !!result.reason.response;
      continue;
    }
    const info = result.value;
    // A non-JSON body comes back as a string.
    if (typeof info !== 'object' || !info?.Id || !info.Version) {
      answered = true;
      continue;
    }
    if (!isVersionSupported(info.Version)) {
      unsupportedVersion ??= info.Version;
      continue;
    }
    return {
      address: candidates[i],
      systemInfo: {...info, Id: info.Id, Version: info.Version},
    };
  }

  if (unsupportedVersion) {
    throw new ServerDiscoveryError(
      'unsupported-version',
      `This server runs Jellyfin ${
        getDisplayVersion(unsupportedVersion) ?? unsupportedVersion
      }. Caravela needs ${getDisplayVersion(MIN_SERVER_VERSION)} or newer.`,
      unsupportedVersion,
    );
  }
  if (answered) {
    throw new ServerDiscoveryError(
      'not-jellyfin',
      `"${input}" doesn't look like a Jellyfin server.`,
    );
  }
  throw new ServerDiscoveryError(
    'unreachable',
    `Couldn't reach a Jellyfin server at "${input}".`,
  );
}

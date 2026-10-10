import type {PublicSystemInfo} from '@jellyfin/sdk/lib/generated-client/models/public-system-info';
import {getSystemApi} from '@jellyfin/sdk/lib/utils/api/system-api';

import {createApi} from './client';

/** Same minimum as jellyfin-androidtv. */
export const MIN_SERVER_VERSION = '10.11.0';

const HTTP_PORT = 8096;
const HTTPS_PORT = 8920;
const PROBE_TIMEOUT_MS = 5000;

export type ServerDiscoveryErrorCode =
  | 'invalid-address'
  | 'unreachable'
  | 'unsupported-version';

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

/** Compares dotted numeric versions; suffixes such as "-rc1" are ignored. */
export function isVersionSupported(
  version: string,
  minimum: string = MIN_SERVER_VERSION,
): boolean {
  const parse = (v: string) =>
    v
      .split('.')
      .slice(0, 3)
      .map((part) => parseInt(part, 10) || 0);
  const a = parse(version);
  const b = parse(minimum);
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff > 0;
    }
  }
  return true;
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
 */
export async function discoverServer(
  input: string,
  probe: Probe = probePublicSystemInfo,
): Promise<DiscoveredServer> {
  const candidates = getAddressCandidates(input);
  const results = await Promise.allSettled(candidates.map((c) => probe(c)));

  let unsupportedVersion: string | undefined;
  for (let i = 0; i < candidates.length; i++) {
    const result = results[i];
    if (result.status !== 'fulfilled') {
      continue;
    }
    const info = result.value;
    if (!info?.Id || !info.Version) {
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
      `This server runs Jellyfin ${unsupportedVersion}. Caravela needs ${MIN_SERVER_VERSION} or newer.`,
      unsupportedVersion,
    );
  }
  throw new ServerDiscoveryError(
    'unreachable',
    `Couldn't reach a Jellyfin server at "${input}".`,
  );
}

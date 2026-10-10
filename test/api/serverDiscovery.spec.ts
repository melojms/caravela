import {AxiosError, AxiosResponse} from 'axios';
import type {PublicSystemInfo} from '@jellyfin/sdk/lib/generated-client/models/public-system-info';

import {
  discoverServer,
  getAddressCandidates,
  isVersionSupported,
  ServerDiscoveryError,
} from '../../src/api/serverDiscovery';

describe('getAddressCandidates', () => {
  it('tries https then http, with default ports, when only a host is given', () => {
    expect(getAddressCandidates('jellyfin.example.com')).toEqual([
      'https://jellyfin.example.com',
      'https://jellyfin.example.com:8920',
      'http://jellyfin.example.com:8096',
      'http://jellyfin.example.com',
    ]);
  });

  it('keeps an explicit scheme and adds its default port', () => {
    expect(getAddressCandidates('http://jellyfin.example.com')).toEqual([
      'http://jellyfin.example.com:8096',
      'http://jellyfin.example.com',
    ]);
    expect(getAddressCandidates('https://jellyfin.example.com')).toEqual([
      'https://jellyfin.example.com',
      'https://jellyfin.example.com:8920',
    ]);
  });

  it('keeps an explicit port for both schemes', () => {
    expect(getAddressCandidates('jellyfin.example.com:9000')).toEqual([
      'https://jellyfin.example.com:9000',
      'http://jellyfin.example.com:9000',
    ]);
  });

  it('uses an address with scheme and port as is', () => {
    expect(getAddressCandidates('http://192.168.1.10:8096')).toEqual([
      'http://192.168.1.10:8096',
    ]);
  });

  it('handles IPv4 addresses', () => {
    expect(getAddressCandidates('192.168.1.10')).toEqual([
      'https://192.168.1.10',
      'https://192.168.1.10:8920',
      'http://192.168.1.10:8096',
      'http://192.168.1.10',
    ]);
  });

  it('handles bracketed IPv6 addresses', () => {
    expect(getAddressCandidates('http://[fe80::1]:8096')).toEqual([
      'http://[fe80::1]:8096',
    ]);
  });

  it('strips trailing slashes and whitespace, keeps a base path', () => {
    expect(getAddressCandidates('  https://Example.com/jellyfin/// ')).toEqual([
      'https://example.com/jellyfin',
      'https://example.com:8920/jellyfin',
    ]);
    expect(getAddressCandidates('http://example.com:8096/')).toEqual([
      'http://example.com:8096',
    ]);
  });

  it.each(['', '   ', 'ftp://example.com', 'example.com:99999', 'a b'])(
    'rejects %p',
    (input) => {
      expect(() => getAddressCandidates(input)).toThrow(ServerDiscoveryError);
    },
  );
});

describe('isVersionSupported', () => {
  it.each([
    ['12.0.0', true],
    ['12.2.0', true],
    ['12.2', true],
    ['13.0.0', true],
    ['12.0.0-rc1', true],
    ['11.9.9', false],
    ['10.11.5', false],
    ['not-a-version', false],
  ])('%s → %s', (version, expected) => {
    expect(isVersionSupported(version)).toBe(expected);
  });
});

describe('discoverServer', () => {
  const info = (version: string): PublicSystemInfo => ({
    Id: 'server-id',
    ServerName: 'Home',
    Version: version,
  });

  it('picks the most preferred candidate that answers', async () => {
    const probe = jest.fn(async (address: string) => {
      if (address.startsWith('https://')) {
        throw new Error('ECONNREFUSED');
      }
      return info('12.2.0');
    });

    const server = await discoverServer('192.168.1.10', probe);

    expect(probe).toHaveBeenCalledTimes(4);
    expect(server.address).toBe('http://192.168.1.10:8096');
    expect(server.systemInfo.Version).toBe('12.2.0');
  });

  it('prefers https when both answer', async () => {
    const server = await discoverServer('example.com', async () =>
      info('12.0.0'),
    );
    expect(server.address).toBe('https://example.com');
  });

  it('rejects servers older than 12.0 with a clear error', async () => {
    const error = await discoverServer('example.com', async () =>
      info('10.11.5'),
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ServerDiscoveryError);
    expect(error.code).toBe('unsupported-version');
    expect(error.version).toBe('10.11.5');
    expect(error.message).toBe(
      'This server runs Jellyfin 10.11.5. Caravela needs 12.0 or newer.',
    );
  });

  const httpError = (status: number) =>
    new AxiosError(
      `Request failed with status code ${status}`,
      'ERR_BAD_RESPONSE',
      undefined,
      undefined,
      {status} as AxiosResponse,
    );

  it('reports not-jellyfin when a 2xx response has no Id/Version', async () => {
    const error = await discoverServer('example.com', async () => ({})).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ServerDiscoveryError);
    expect(error.code).toBe('not-jellyfin');
    expect(error.message).toBe(
      '"example.com" doesn\'t look like a Jellyfin server.',
    );
  });

  it('reports not-jellyfin when the response is not JSON', async () => {
    const error = await discoverServer(
      'example.com',
      async () => '<html></html>' as unknown as PublicSystemInfo,
    ).catch((e) => e);
    expect(error.code).toBe('not-jellyfin');
  });

  it('reports not-jellyfin when a candidate answers with an HTTP error', async () => {
    const error = await discoverServer('example.com', async (address) => {
      if (address === 'https://example.com') {
        throw httpError(404);
      }
      throw new Error('ECONNREFUSED');
    }).catch((e) => e);
    expect(error.code).toBe('not-jellyfin');
  });

  it('prefers unsupported-version over not-jellyfin', async () => {
    const error = await discoverServer('example.com', async (address) => {
      if (address === 'https://example.com') {
        throw httpError(502);
      }
      if (address === 'http://example.com') {
        return {};
      }
      return info('10.11.5');
    }).catch((e) => e);
    expect(error.code).toBe('unsupported-version');
  });

  it('still returns a Jellyfin server when other candidates are not Jellyfin', async () => {
    const server = await discoverServer('example.com', async (address) => {
      if (address === 'https://example.com') {
        throw httpError(404);
      }
      return info('12.2.0');
    });
    expect(server.address).toBe('https://example.com:8920');
  });

  it('reports unreachable when nothing answers', async () => {
    const error = await discoverServer('example.com', async () => {
      throw new Error('timeout');
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ServerDiscoveryError);
    expect(error.code).toBe('unreachable');
    expect(error.message).toBe(
      'Couldn\'t reach a Jellyfin server at "example.com".',
    );
  });

  it('reports unreachable for Axios errors without a response', async () => {
    const error = await discoverServer('example.com', async () => {
      throw new AxiosError('timeout of 5000ms exceeded', 'ECONNABORTED');
    }).catch((e) => e);
    expect(error.code).toBe('unreachable');
  });
});

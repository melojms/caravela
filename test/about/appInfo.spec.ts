import {getSystemApi} from '@jellyfin/sdk/lib/utils/api/system-api';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {renderHook, waitFor} from '@testing-library/react-native';
import React, {type ReactNode} from 'react';

import {version as packageVersion} from '../../package.json';
import {
  fetchServerInfo,
  getAppVersion,
  getBuildNumber,
  serverInfoKeys,
  useServerInfo,
} from '../../src/about/appInfo';
import {useSession} from '../../src/auth/SessionContext';
import {HOME, sessionFor} from '../auth/fakes';

jest.mock('@jellyfin/sdk/lib/utils/api/system-api', () => ({
  getSystemApi: jest.fn(),
}));
jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

// The tsconfig has no Node types; Jest provides these.
declare const __dirname: string;
const {readFileSync} = jest.requireActual<{
  readFileSync(path: string, encoding: 'utf8'): string;
}>('fs');

const systemApi = {getPublicSystemInfo: jest.fn()};
const session = sessionFor({...HOME, version: '10.10.7'});

let client: QueryClient;

const wrapper = ({children}: {children: ReactNode}) =>
  React.createElement(QueryClientProvider, {client}, children);

beforeEach(() => {
  jest.clearAllMocks();
  (getSystemApi as jest.Mock).mockReturnValue(systemApi);
  (useSession as jest.Mock).mockReturnValue({session});
  client = new QueryClient({
    defaultOptions: {queries: {retry: false, gcTime: Infinity}},
  });
});

afterEach(() => client.clear());

describe('getBuildNumber', () => {
  it.each([
    ['0.1.1', 1001],
    ['1.0.0', 1000000],
    ['1.2.3', 1002003],
    ['10.20.30', 10020030],
  ])('turns %s into %d', (version, build) => {
    expect(getBuildNumber(version)).toBe(build);
  });

  it.each(['1.2', '1.2.3-rc1', 'v1.2.3', '', '1.1000.0', '1.0.1000'])(
    'has no build number for %j',
    (version) => {
      expect(getBuildNumber(version)).toBeUndefined();
    },
  );
});

describe('getAppVersion', () => {
  it("returns package.json's version and its build number", () => {
    expect(getAppVersion()).toEqual({
      version: packageVersion,
      build: String(getBuildNumber(packageVersion)),
    });
  });

  it('has no build number for a version that is not X.Y.Z', () => {
    expect(getAppVersion('1.2.3-beta')).toEqual({
      version: '1.2.3-beta',
      build: undefined,
    });
  });

  it("matches manifest.toml's package version, which the build uses", () => {
    const manifest = readFileSync(`${__dirname}/../../manifest.toml`, 'utf8');
    // The first version line, as scripts/build-release.sh reads it.
    const manifestVersion = /^version = "(.*)"$/m.exec(manifest)?.[1];
    expect(manifestVersion).toBe(packageVersion);
  });
});

describe('fetchServerInfo', () => {
  it("returns the server's public name and version", async () => {
    systemApi.getPublicSystemInfo.mockResolvedValue({
      data: {ServerName: 'Living room', Version: '12.0.0', Id: 'srv1'},
    });
    await expect(fetchServerInfo(session.api)).resolves.toEqual({
      name: 'Living room',
      version: '12.0.0',
    });
    expect(getSystemApi).toHaveBeenCalledWith(session.api);
  });

  it('leaves out what the server does not send', async () => {
    systemApi.getPublicSystemInfo.mockResolvedValue({data: {}});
    await expect(fetchServerInfo(session.api)).resolves.toEqual({
      name: undefined,
      version: undefined,
    });
  });
});

describe('useServerInfo', () => {
  it('uses the per-user query key', async () => {
    systemApi.getPublicSystemInfo.mockResolvedValue({
      data: {ServerName: 'Living room', Version: '12.0.0'},
    });
    renderHook(() => useServerInfo(), {wrapper});
    await waitFor(() =>
      expect(client.getQueryData(serverInfoKeys('srv1', 'u1'))).toEqual({
        name: 'Living room',
        version: '12.0.0',
      }),
    );
  });

  it('shows the stored name and version while loading', () => {
    systemApi.getPublicSystemInfo.mockReturnValue(new Promise(() => {}));
    const {result} = renderHook(() => useServerInfo(), {wrapper});
    expect(result.current).toEqual({name: 'Home', version: '10.10.7'});
  });

  it('shows the fetched name and version once loaded', async () => {
    systemApi.getPublicSystemInfo.mockResolvedValue({
      data: {ServerName: 'Living room', Version: '12.0.0'},
    });
    const {result} = renderHook(() => useServerInfo(), {wrapper});
    await waitFor(() =>
      expect(result.current).toEqual({name: 'Living room', version: '12.0.0'}),
    );
  });

  it('keeps the stored values when the fetch fails', async () => {
    systemApi.getPublicSystemInfo.mockRejectedValue(new Error('offline'));
    const {result} = renderHook(() => useServerInfo(), {wrapper});
    await waitFor(() =>
      expect(client.getQueryState(serverInfoKeys('srv1', 'u1'))?.status).toBe(
        'error',
      ),
    );
    expect(result.current).toEqual({name: 'Home', version: '10.10.7'});
  });

  it('fills a value the server leaves out from the stored one', async () => {
    systemApi.getPublicSystemInfo.mockResolvedValue({
      data: {Version: '12.0.0'},
    });
    const {result} = renderHook(() => useServerInfo(), {wrapper});
    await waitFor(() =>
      expect(result.current).toEqual({name: 'Home', version: '12.0.0'}),
    );
  });

  it('returns nothing without a session', () => {
    (useSession as jest.Mock).mockReturnValue({session: undefined});
    const {result} = renderHook(() => useServerInfo(), {wrapper});
    expect(result.current).toBeUndefined();
    expect(systemApi.getPublicSystemInfo).not.toHaveBeenCalled();
  });
});

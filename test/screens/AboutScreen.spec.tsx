import {getSystemApi} from '@jellyfin/sdk/lib/utils/api/system-api';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';

import {version} from '../../package.json';
import {getBuildNumber} from '../../src/about/appInfo';
import {createQueryClient} from '../../src/api/queryClient';
import {useSession} from '../../src/auth/SessionContext';
import {AboutScreen} from '../../src/screens/AboutScreen';
import {HOME, sessionFor} from '../auth/fakes';

jest.mock('@jellyfin/sdk/lib/utils/api/system-api', () => ({
  getSystemApi: jest.fn(),
}));
jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

const systemApi = {getPublicSystemInfo: jest.fn()};

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: {status},
  });

let client: QueryClient;
let navigate: jest.Mock;
let expireSession: jest.Mock;

const withSession = (version?: string) =>
  (useSession as jest.Mock).mockReturnValue({
    session: sessionFor({...HOME, version}),
    expireSession,
  });

const renderAbout = () =>
  render(
    <QueryClientProvider client={client}>
      <AboutScreen
        navigation={{navigate} as never}
        route={{key: 'About', name: 'About'} as never}
      />
    </QueryClientProvider>,
  );

const serverLine = () => screen.getByTestId('about-server');

beforeEach(() => {
  jest.clearAllMocks();
  (getSystemApi as jest.Mock).mockReturnValue(systemApi);
  systemApi.getPublicSystemInfo.mockReturnValue(new Promise(() => {}));
  navigate = jest.fn();
  expireSession = jest.fn();
  withSession('10.10.7');
  // The app's client: no retry on a 401, which expires the session.
  client = createQueryClient(expireSession);
  client.setDefaultOptions({
    queries: {...client.getDefaultOptions().queries, retry: false},
  });
});

afterEach(() => client.clear());

describe('AboutScreen', () => {
  it('shows the app version and build number', () => {
    renderAbout();
    expect(screen.getByTestId('about-screen')).toBeTruthy();
    expect(screen.getByText('Caravela')).toBeTruthy();
    expect(screen.getByTestId('about-version')).toHaveTextContent(
      `Version ${version} (build ${getBuildNumber(version)})`,
    );
  });

  it('shows the disclaimer, licence, source and privacy lines', () => {
    renderAbout();
    expect(
      screen.getByText(
        'Unofficial client, not affiliated with the Jellyfin project.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Licence: GPL-2.0-or-later')).toBeTruthy();
    expect(
      screen.getByText('Source: https://github.com/melojms/caravela'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Privacy policy: https://melojms.github.io/caravela/privacy',
      ),
    ).toBeTruthy();
  });

  it('shows the stored server name and version while loading', () => {
    renderAbout();
    expect(serverLine()).toHaveTextContent('Home · Jellyfin 10.10.7');
    expect(serverLine()).not.toHaveTextContent(HOME.address);
  });

  it('shows the fetched server name and version once loaded', async () => {
    systemApi.getPublicSystemInfo.mockResolvedValue({
      data: {ServerName: 'Living room', Version: '12.0.0'},
    });
    renderAbout();
    await waitFor(() =>
      expect(serverLine()).toHaveTextContent('Living room · Jellyfin 12.0'),
    );
  });

  it('keeps the stored server name and version after a failure', async () => {
    systemApi.getPublicSystemInfo.mockRejectedValue(httpError(500));
    renderAbout();
    await act(async () => {});
    expect(systemApi.getPublicSystemInfo).toHaveBeenCalled();
    expect(serverLine()).toHaveTextContent('Home · Jellyfin 10.10.7');
    expect(expireSession).not.toHaveBeenCalled();
  });

  it('shows only the name when no version is known', () => {
    withSession(undefined);
    renderAbout();
    expect(serverLine()).toHaveTextContent('Home');
    expect(serverLine()).not.toHaveTextContent('Jellyfin');
  });

  it('expires the session on a 401', async () => {
    systemApi.getPublicSystemInfo.mockRejectedValue(httpError(401));
    renderAbout();
    await waitFor(() => expect(expireSession).toHaveBeenCalledTimes(1));
  });

  it('opens the third-party licences', () => {
    renderAbout();
    const button = screen.getByTestId('about-licenses');
    expect(button).toHaveTextContent('Third-party licences');
    fireEvent.press(button);
    expect(navigate).toHaveBeenCalledWith('Licenses');
  });

  it('has the licences button as its only focusable item, focused', () => {
    renderAbout();
    const focusable = screen.getAllByRole('button');
    expect(focusable.map((button) => button.props.testID)).toEqual([
      'about-licenses',
    ]);
    expect(focusable[0].props.hasTVPreferredFocus).toBe(true);
  });
});

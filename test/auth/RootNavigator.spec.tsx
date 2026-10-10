import {act, fireEvent, render} from '@testing-library/react-native';
import React from 'react';
import {BackHandler} from 'react-native';

import {getAuthService} from '../../src/auth/authService';
import type {AuthState} from '../../src/auth/store';
import {getAuthStore} from '../../src/auth/store';
import {RootNavigator} from '../../src/navigation/RootNavigator';
import {fakeService, fakeStore, networkError, signedInState} from './fakes';

// The screens use the default service and store; point them at the fakes.
jest.mock('../../src/auth/authService', () => ({
  ...jest.requireActual('../../src/auth/authService'),
  getAuthService: jest.fn(),
}));
jest.mock('../../src/auth/store', () => ({
  ...jest.requireActual('../../src/auth/store'),
  getAuthStore: jest.fn(),
}));

const renderApp = (
  state: AuthState,
  service: ReturnType<typeof fakeService> = fakeService(),
) => {
  const store = fakeStore(state);
  (getAuthService as jest.Mock).mockReturnValue(service);
  (getAuthStore as jest.Mock).mockReturnValue(store);
  return render(<RootNavigator authService={service} authStore={store} />);
};

describe('RootNavigator', () => {
  it('shows Launch, then Home once signed in', async () => {
    const screen = renderApp(signedInState());

    expect(screen.getByTestId('launch-screen')).toBeTruthy();
    expect(screen.getByText('Caravela')).toBeTruthy();

    expect(await screen.findByTestId('home-screen')).toBeTruthy();
    expect(screen.queryByTestId('launch-screen')).toBeNull();
  });

  it('starts at AddServer when no server is saved', async () => {
    const screen = renderApp({servers: {}, autoLogin: {mode: 'lastUser'}});

    expect(await screen.findByTestId('add-server-screen')).toBeTruthy();
  });

  it('starts at UserPicker with the expired notice', async () => {
    const service = fakeService();
    service.restoreSession.mockResolvedValue(undefined);
    const screen = renderApp(signedInState(), service);

    expect(await screen.findByTestId('user-picker')).toBeTruthy();
    expect(screen.getByText('https://srv1.example.com')).toBeTruthy();
    expect(screen.getByTestId('user-picker-notice')).toHaveTextContent(
      'Your saved login for melojms has expired. Sign in again.',
    );
  });

  it('offers Retry when the server is offline', async () => {
    const service = fakeService();
    service.restoreSession.mockRejectedValueOnce(networkError());
    const screen = renderApp(signedInState(), service);

    expect(await screen.findByTestId('user-picker')).toBeTruthy();
    expect(screen.getByTestId('user-picker-notice')).toHaveTextContent(
      /^Can't reach Home\./,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('user-picker-retry'));
    });
    expect(await screen.findByTestId('home-screen')).toBeTruthy();
  });

  it('clears the notice once the user navigates', async () => {
    const service = fakeService();
    service.restoreSession.mockResolvedValue(undefined);
    const screen = renderApp(signedInState(), service);
    expect(await screen.findByTestId('user-picker-notice')).toBeTruthy();
    expect(await screen.findByTestId('user-picker-change-server')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('user-picker-change-server'));
    });
    expect(screen.getByTestId('add-server-screen')).toBeTruthy();
    expect(screen.queryByTestId('user-picker-notice')).toBeNull();
  });

  it('shows Retry on the launch screen when saved logins fail to load', async () => {
    const service = fakeService();
    const store = fakeStore(signedInState());
    store.getState.mockRejectedValueOnce(new Error('disk I/O'));
    (getAuthService as jest.Mock).mockReturnValue(service);
    (getAuthStore as jest.Mock).mockReturnValue(store);
    const screen = render(
      <RootNavigator authService={service} authStore={store} />,
    );

    expect(await screen.findByText("Couldn't load saved logins.")).toBeTruthy();
    expect(screen.getByTestId('launch-screen')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('launch-retry'));
    });
    expect(await screen.findByTestId('home-screen')).toBeTruthy();
  });

  it('opens AddServer from the picker and Back pops to it', async () => {
    const screen = renderApp({
      ...signedInState(),
      autoLogin: {mode: 'disabled'},
    });
    expect(await screen.findByTestId('user-picker-change-server')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('user-picker-change-server'));
    });
    expect(screen.getByTestId('add-server-screen')).toBeTruthy();

    // React Navigation registers the Back handler; it pops when it can.
    const addListener = BackHandler.addEventListener as jest.Mock;
    const handlers = addListener.mock.calls.map(([, handler]) => handler);
    let handled = false;
    await act(async () => {
      handled = handlers.some((handler) => handler());
    });
    expect(handled).toBe(true);
    expect(screen.getByTestId('user-picker')).toBeTruthy();

    // On the first auth screen nothing handles Back, so Vega exits the app.
    expect(handlers.some((handler) => handler())).toBe(false);
  });
});

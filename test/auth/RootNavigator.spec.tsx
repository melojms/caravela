import {act, fireEvent, render} from '@testing-library/react-native';
import React from 'react';
import {BackHandler} from 'react-native';

import type {AuthState} from '../../src/auth/store';
import {RootNavigator} from '../../src/navigation/RootNavigator';
import {fakeService, fakeStore, networkError, signedInState} from './fakes';

const renderApp = (
  state: AuthState,
  service: ReturnType<typeof fakeService> = fakeService(),
) =>
  render(<RootNavigator authService={service} authStore={fakeStore(state)} />);

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

    expect(await screen.findByTestId('auth-UserPicker')).toBeTruthy();
    expect(screen.getByText('{"serverId":"srv1"}')).toBeTruthy();
    expect(screen.getByTestId('auth-notice')).toHaveTextContent(
      'Your saved login for melojms has expired. Sign in again.',
    );
  });

  it('offers Retry when the server is offline', async () => {
    const service = fakeService();
    service.restoreSession.mockRejectedValueOnce(networkError());
    const screen = renderApp(signedInState(), service);

    expect(await screen.findByTestId('auth-UserPicker')).toBeTruthy();
    expect(screen.getByTestId('auth-notice')).toHaveTextContent(
      "Can't reach Home.",
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-placeholder-button'));
    });
    expect(await screen.findByTestId('home-screen')).toBeTruthy();
  });

  it('clears the notice once the user navigates', async () => {
    const service = fakeService();
    service.restoreSession.mockResolvedValue(undefined);
    const screen = renderApp(signedInState(), service);
    expect(await screen.findByTestId('auth-notice')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-placeholder-button'));
    });
    expect(screen.getByTestId('add-server-screen')).toBeTruthy();
    expect(screen.queryByTestId('auth-notice')).toBeNull();
  });

  it('shows Retry on the launch screen when saved logins fail to load', async () => {
    const store = fakeStore(signedInState());
    store.getState.mockRejectedValueOnce(new Error('disk I/O'));
    const screen = render(
      <RootNavigator authService={fakeService()} authStore={store} />,
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
    expect(await screen.findByTestId('auth-UserPicker')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-placeholder-button'));
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
    expect(screen.getByTestId('auth-UserPicker')).toBeTruthy();

    // On the first auth screen nothing handles Back, so Vega exits the app.
    expect(handlers.some((handler) => handler())).toBe(false);
  });
});

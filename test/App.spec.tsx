import 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';
import {BackHandler} from 'react-native';

import {App} from '../src/App';

// Start signed in: the saved token is accepted.
jest.mock('../src/auth/store', () => {
  const {fakeStore, signedInState} = require('./auth/fakes');
  const store = fakeStore(signedInState());
  return {getAuthStore: () => store};
});
jest.mock('../src/auth/authService', () => {
  const {fakeService} = require('./auth/fakes');
  const service = fakeService();
  return {
    ...jest.requireActual('../src/auth/authService'),
    getAuthService: () => service,
  };
});

const pressBack = async () => {
  const handlers = (BackHandler.addEventListener as jest.Mock).mock.calls.map(
    ([, handler]) => handler,
  );
  let handled = false;
  await act(async () => {
    handled = handlers.some((handler) => handler());
  });
  return handled;
};

const press = async (
  screen: ReturnType<typeof render>,
  testID: string,
): Promise<void> => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

describe('App', () => {
  beforeEach(() => {
    (BackHandler.addEventListener as jest.Mock).mockClear();
  });

  it('starts on Home with the toolbar and no side menu', async () => {
    const screen = render(<App />);

    expect(await screen.findByTestId('home-screen')).toBeTruthy();
    expect(screen.getByTestId('toolbar')).toBeTruthy();
    expect(
      screen.getByTestId('toolbar-home').props.accessibilityState,
    ).toMatchObject({selected: true});
    expect(screen.getByTestId('toolbar-user-image').props.source).toEqual({
      uri: expect.stringContaining('/Users/u1/Images/Primary'),
    });
    expect(screen.queryByTestId('side-menu')).toBeNull();
  });

  it('opens Search from the toolbar and Back returns to Home', async () => {
    const screen = render(<App />);
    await screen.findByTestId('home-screen');

    await press(screen, 'toolbar-search');
    expect(screen.getByTestId('search-screen')).toBeTruthy();
    expect(
      screen.getByTestId('toolbar-search').props.accessibilityState,
    ).toMatchObject({selected: true});

    expect(await pressBack()).toBe(true);
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.queryByTestId('search-screen')).toBeNull();

    // Home is the root: nothing handles Back, so Vega exits the app.
    expect(await pressBack()).toBe(false);
  });

  it("goes back to Home from Search's toolbar without a second Home", async () => {
    const screen = render(<App />);
    await screen.findByTestId('home-screen');

    await press(screen, 'toolbar-search');
    await press(screen, 'toolbar-home');
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.queryByTestId('search-screen')).toBeNull();
    expect(await pressBack()).toBe(false);
  });

  it('pressing the current entry stays put', async () => {
    const screen = render(<App />);
    await screen.findByTestId('home-screen');

    await press(screen, 'toolbar-home');
    expect(await pressBack()).toBe(false);

    await press(screen, 'toolbar-search');
    await press(screen, 'toolbar-search');
    expect(await pressBack()).toBe(true);
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(await pressBack()).toBe(false);
  });

  it('opens Settings from the toolbar and Back returns to Home', async () => {
    const screen = render(<App />);
    await screen.findByTestId('home-screen');

    await press(screen, 'toolbar-settings');
    expect(screen.getByTestId('settings-user-name')).toHaveTextContent(
      'melojms',
    );
    expect(screen.queryByTestId('toolbar')).toBeNull();

    expect(await pressBack()).toBe(true);
    expect(screen.getByTestId('home-screen')).toBeTruthy();
  });

  it('opens the user picker from the avatar', async () => {
    const screen = render(<App />);
    await screen.findByTestId('home-screen');

    await press(screen, 'toolbar-user');
    expect(await screen.findByTestId('user-picker')).toBeTruthy();
    expect(screen.queryByTestId('toolbar')).toBeNull();
  });

  it('opens Settings and signs out to the user picker', async () => {
    const screen = render(<App />);
    await screen.findByTestId('home-screen');

    await press(screen, 'toolbar-settings');
    await press(screen, 'settings-sign-out');
    expect(await screen.findByTestId('user-picker')).toBeTruthy();
    expect(screen.queryByTestId('toolbar')).toBeNull();
  });
});

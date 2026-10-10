import 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';

import {App} from '../src/App';
import {MENU_ENTRIES} from '../src/navigation/menuEntries';

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

describe('App', () => {
  it('shows a side menu with the five sections', async () => {
    const screen = render(<App />);
    await screen.findByTestId('home-screen');

    expect(MENU_ENTRIES.map((entry) => entry.route)).toEqual([
      'Home',
      'Movies',
      'Shows',
      'Search',
      'Settings',
    ]);
    for (const entry of MENU_ENTRIES) {
      expect(screen.getByTestId(`menu-item-${entry.route}`)).toBeTruthy();
    }
  });

  it('starts on Home with three rows', async () => {
    const screen = render(<App />);

    expect(await screen.findByTestId('home-screen')).toBeTruthy();
    expect(screen.getByTestId('row-continue')).toBeTruthy();
    expect(screen.getByTestId('row-latest-movies')).toBeTruthy();
    expect(screen.getByTestId('row-latest-shows')).toBeTruthy();
  });

  it('switches section from the menu and opens details from a card', async () => {
    const screen = render(<App />);
    await screen.findByTestId('home-screen');

    await act(async () => {
      fireEvent.press(screen.getByTestId('menu-item-Movies'));
    });
    expect(screen.getByTestId('movies-screen')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('poster-grid-item-0'));
    });
    expect(screen.getByTestId('details-screen')).toBeTruthy();
    expect(screen.getAllByText('Movie 1').length).toBeGreaterThan(0);
  });

  it('opens Settings and signs out to the user picker', async () => {
    const screen = render(<App />);
    await screen.findByTestId('home-screen');

    await act(async () => {
      fireEvent.press(screen.getByTestId('menu-item-Settings'));
    });
    expect(screen.getByTestId('settings-user-name')).toHaveTextContent(
      'melojms',
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-sign-out'));
    });
    expect(await screen.findByTestId('user-picker')).toBeTruthy();
    expect(screen.queryByTestId('side-menu')).toBeNull();
  });
});

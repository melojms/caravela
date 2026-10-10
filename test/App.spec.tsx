import 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';

import {App} from '../src/App';
import {MENU_ENTRIES} from '../src/navigation/menuEntries';

describe('App', () => {
  it('shows a side menu with the five sections', () => {
    const screen = render(<App />);

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

  it('starts on Home with three rows', () => {
    const screen = render(<App />);

    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.getByTestId('row-continue')).toBeTruthy();
    expect(screen.getByTestId('row-latest-movies')).toBeTruthy();
    expect(screen.getByTestId('row-latest-shows')).toBeTruthy();
  });

  it('switches section from the menu and opens details from a card', async () => {
    const screen = render(<App />);

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
});

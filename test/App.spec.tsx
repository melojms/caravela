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

// Home's rows: My media holds a Movies and a TV library, Continue watching
// one movie.
jest.mock('../src/api/home', () => {
  const loaded = (data: unknown) => ({
    data,
    isPending: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  });
  const sections = loaded(['myMedia', 'resume']);
  const myMedia = loaded([
    {Id: 'lib-movies', Name: 'Movies', CollectionType: 'movies'},
    {Id: 'lib-shows', Name: 'Shows', CollectionType: 'tvshows'},
  ]);
  const resume = loaded([{Id: 'r1', Name: 'Movie r1', Type: 'Movie'}]);
  const none = loaded([]);
  return {
    ...jest.requireActual('../src/api/home'),
    useHomeSections: () => sections,
    useMyMedia: () => myMedia,
    useResume: () => resume,
    useNextUp: () => none,
  };
});

// The library grid stays loading too.
jest.mock('../src/api/libraryPrefs', () => ({
  useLibraryPrefs: () => ({isPending: true, isError: false}),
  useSaveLibraryPrefs: () => ({mutate: jest.fn()}),
}));
jest.mock('../src/api/library', () => ({
  ...jest.requireActual('../src/api/library'),
  useLibraryItems: () => ({
    cards: [],
    total: 0,
    fetchNextPage: jest.fn(),
    isPending: true,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

// Details stays loading: these tests only check where cards lead.
jest.mock('../src/api/details', () => ({
  useItemDetails: () => ({isPending: true, isError: false, error: null}),
}));

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

  it("reaches the third-party licences from About and a package's text", async () => {
    const screen = render(<App />);
    await screen.findByTestId('home-screen');

    await press(screen, 'toolbar-settings');
    await press(screen, 'settings-about');
    await press(screen, 'about-licenses');
    expect(screen.getByTestId('licenses-screen')).toBeTruthy();

    await press(screen, 'licenses-row-0');
    expect(screen.getByTestId('license-text-screen')).toBeTruthy();

    expect(await pressBack()).toBe(true);
    expect(screen.getByTestId('licenses-screen')).toBeTruthy();
    expect(screen.queryByTestId('license-text-screen')).toBeNull();
    expect(await pressBack()).toBe(true);
    expect(screen.getByTestId('about-screen')).toBeTruthy();
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

  it("goes Home from a deeper screen's toolbar to a single Home", async () => {
    const screen = render(<App />);
    await screen.findByTestId('home-screen');

    // Home → Search → Settings, then Back to Search and its toolbar's Home.
    await press(screen, 'toolbar-search');
    await press(screen, 'toolbar-settings');
    expect(await pressBack()).toBe(true);
    expect(screen.getByTestId('search-screen')).toBeTruthy();
    await press(screen, 'toolbar-home');

    expect(screen.getAllByTestId('home-screen')).toHaveLength(1);
    expect(screen.queryByTestId('search-screen')).toBeNull();
    expect(await pressBack()).toBe(false);
  });

  it.each([
    ['row-myMedia-item-0', 'library-screen'],
    ['row-myMedia-item-1', 'library-screen'],
    ['row-resume-item-0', 'details-loading'],
  ])('opens %s and Back returns to Home', async (card, target) => {
    const screen = render(<App />);
    await screen.findByTestId('home-screen');

    await press(screen, card);
    expect(screen.getByTestId(target)).toBeTruthy();
    expect(screen.queryByTestId('toolbar')).toBeNull();

    expect(await pressBack()).toBe(true);
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.queryByTestId(target)).toBeNull();
    expect(await pressBack()).toBe(false);
  });
});

import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import React from 'react';
import {ScrollView} from 'react-native';
import type {ReactTestRendererJSON} from 'react-test-renderer';

import {createJellyfin} from '../src/api/client';
import {
  fetchLatest,
  type HomeSection,
  homeKeys,
  useHomeSections,
  useMyMedia,
  useNextUp,
  useResume,
} from '../src/api/home';
import {useSession} from '../src/auth/SessionContext';
import {
  BACKDROP_DELAY_MS,
  HomeScreen,
  RESTORE_FOCUS_DELAY_MS,
} from '../src/screens/HomeScreen';
import {sessionFor} from './auth/fakes';

jest.mock('../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

jest.mock('../src/api/home', () => ({
  ...jest.requireActual('../src/api/home'),
  useHomeSections: jest.fn(),
  useMyMedia: jest.fn(),
  useResume: jest.fn(),
  useNextUp: jest.fn(),
  fetchLatest: jest.fn(),
}));

let mockFocusEffect: (() => void) | undefined;
jest.mock('@amazon-devices/react-navigation__native', () => ({
  useFocusEffect: (effect: () => void) => {
    mockFocusEffect = effect;
  },
  // For the toolbar, which navigates on its own.
  useNavigation: () => ({popTo: jest.fn(), navigate: jest.fn()}),
}));

// FocusManager is a native TurboModule, and the package's getter for it
// throws under Jest. Swap in a recorder; everything else stays real.
const mockFocusManager = {focus: jest.fn()};
jest.mock('@amazon-devices/react-native-kepler', () => {
  const actual = jest.requireActual('@amazon-devices/react-native-kepler');
  return new Proxy(actual, {
    get: (target, key) =>
      key === 'FocusManager' ? mockFocusManager : target[key],
  });
});

const SERVER = 'https://jf.example.com';
const api = createJellyfin('device-1').createApi(SERVER, 'token-1');

type Query<T> = {
  data?: T;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: jest.Mock;
};

const loaded = <T,>(data: T): Query<T> => ({
  data,
  isPending: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
});
const pending = <T,>(): Query<T> => ({
  isPending: true,
  isError: false,
  error: null,
  refetch: jest.fn(),
});
const failed = <T,>(error: unknown = new Error('boom')): Query<T> => ({
  isPending: false,
  isError: true,
  error,
  refetch: jest.fn(),
});

const movie = (id: string, extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: id,
  Name: `Movie ${id}`,
  Type: BaseItemKind.Movie,
  ProductionYear: 2020,
  ...extra,
});

const library = (id: string, name: string, type: string): BaseItemDto => ({
  Id: id,
  Name: name,
  Type: BaseItemKind.CollectionFolder,
  CollectionType: type as BaseItemDto['CollectionType'],
});

const MOVIES = library('lib-movies', 'Movies', 'movies');
const SHOWS = library('lib-shows', 'Shows', 'tvshows');

let queries: {
  sections: Query<HomeSection[]>;
  myMedia: Query<BaseItemDto[]>;
  resume: Query<BaseItemDto[]>;
  nextUp: Query<BaseItemDto[]>;
};
let latestByLibrary: Record<string, BaseItemDto[]>;
let navigate: jest.Mock;
let client: QueryClient;

const renderHome = () => {
  render(
    <QueryClientProvider client={client}>
      <HomeScreen
        navigation={{navigate} as never}
        route={{key: 'Home', name: 'Home'} as never}
      />
    </QueryClientProvider>,
  );
};

const rerenderHome = () =>
  screen.rerender(
    <QueryClientProvider client={client}>
      <HomeScreen
        navigation={{navigate} as never}
        route={{key: 'Home', name: 'Home'} as never}
      />
    </QueryClientProvider>,
  );

const carouselFocus = (row: string) =>
  screen.UNSAFE_getByProps({uniqueId: row}).props.hasPreferredFocus;

const rowTitles = () =>
  screen
    .queryAllByTestId(/^row-(?!.*-(carousel|retry)$)[A-Za-z-]+$/)
    .map((row) => row.props.testID as string);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockFocusEffect = undefined;
  navigate = jest.fn();
  client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  queries = {
    sections: loaded<HomeSection[]>(['myMedia', 'resume', 'nextUp', 'latest']),
    myMedia: loaded([MOVIES, SHOWS]),
    resume: loaded([movie('r1')]),
    nextUp: loaded([movie('n1')]),
  };
  latestByLibrary = {
    'lib-movies': [movie('m1')],
    'lib-shows': [movie('s1')],
  };
  const session = sessionFor();
  session.api = api;
  (useSession as jest.Mock).mockReturnValue({session});
  (useHomeSections as jest.Mock).mockImplementation(() => queries.sections);
  (useMyMedia as jest.Mock).mockImplementation(() => queries.myMedia);
  (useResume as jest.Mock).mockImplementation(() => queries.resume);
  (useNextUp as jest.Mock).mockImplementation(() => queries.nextUp);
  (fetchLatest as jest.Mock).mockImplementation(
    async (_api: unknown, _userId: string, libraryId: string) =>
      latestByLibrary[libraryId] ?? [],
  );
});

afterEach(() => {
  client.clear();
});

describe('HomeScreen', () => {
  it('shows a spinner while the sections load', () => {
    queries.sections = pending();
    renderHome();

    expect(screen.getByTestId('home-loading')).toBeTruthy();
    expect(rowTitles()).toEqual([]);
  });

  it('shows the rows in the server order, with androidtv titles', async () => {
    queries.sections = loaded<HomeSection[]>([
      'latest',
      'nextUp',
      'myMedia',
      'resume',
    ]);
    renderHome();

    expect(await screen.findByText('Recently added in Shows')).toBeTruthy();
    expect(rowTitles()).toEqual([
      'row-latest-lib-movies',
      'row-latest-lib-shows',
      'row-nextUp',
      'row-myMedia',
      'row-resume',
    ]);
    expect(screen.getByText('Recently added in Movies')).toBeTruthy();
    expect(screen.getByText('Next up')).toBeTruthy();
    expect(screen.getByText('My media')).toBeTruthy();
    expect(screen.getByText('Continue watching')).toBeTruthy();
  });

  it('shows one Latest row per library, minus the excluded ones', async () => {
    const session = sessionFor();
    session.api = api;
    session.user.Configuration = {LatestItemsExcludes: ['lib-shows']};
    (useSession as jest.Mock).mockReturnValue({session});
    queries.sections = loaded<HomeSection[]>(['latest']);
    renderHome();

    expect(await screen.findByText('Recently added in Movies')).toBeTruthy();
    expect(screen.queryByText('Recently added in Shows')).toBeNull();
    expect(fetchLatest).toHaveBeenCalledWith(api, 'u1', 'lib-movies');
    expect(fetchLatest).not.toHaveBeenCalledWith(api, 'u1', 'lib-shows');
  });

  it('hides rows without items', async () => {
    queries.resume = loaded([]);
    latestByLibrary['lib-shows'] = [];
    renderHome();

    expect(await screen.findByText('Recently added in Movies')).toBeTruthy();
    expect(rowTitles()).toEqual([
      'row-myMedia',
      'row-nextUp',
      'row-latest-lib-movies',
    ]);
  });

  it('shows a failed row with a Retry that refetches it', () => {
    queries.sections = loaded<HomeSection[]>(['resume', 'nextUp']);
    queries.resume = failed();
    renderHome();

    expect(screen.getByText('Continue watching')).toBeTruthy();
    expect(screen.getByText("Couldn't load this row.")).toBeTruthy();
    fireEvent.press(screen.getByTestId('row-resume-retry'));
    expect(queries.resume.refetch).toHaveBeenCalled();
    expect(screen.getByTestId('row-nextUp-item-0')).toBeTruthy();
  });

  it('hides a row that fails with a 401', () => {
    queries.sections = loaded<HomeSection[]>(['resume', 'nextUp']);
    queries.resume = failed({
      isAxiosError: true,
      response: {status: 401},
    });
    renderHome();

    expect(screen.queryByText('Continue watching')).toBeNull();
    expect(screen.queryByTestId('row-resume-retry')).toBeNull();
    expect(screen.getByText('Next up')).toBeTruthy();
  });

  it('says so when every row is empty', () => {
    queries.sections = loaded<HomeSection[]>(['myMedia', 'resume', 'nextUp']);
    queries.myMedia = loaded([]);
    queries.resume = loaded([]);
    queries.nextUp = loaded([]);
    renderHome();

    expect(screen.getByTestId('home-empty')).toBeTruthy();
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it('keeps the spinner while no row has loaded yet', () => {
    queries.sections = loaded<HomeSection[]>(['resume', 'nextUp']);
    queries.resume = loaded([]);
    queries.nextUp = pending();
    renderHome();

    expect(screen.getByTestId('home-loading')).toBeTruthy();
    expect(screen.queryByTestId('home-empty')).toBeNull();
  });

  it('gives focus to the first row with items, once', () => {
    queries.sections = loaded<HomeSection[]>(['resume', 'nextUp']);
    queries.resume = pending();
    renderHome();

    expect(carouselFocus('row-nextUp')).toBe(true);

    // Continue Watching loads later, above Next Up: focus stays put.
    queries.resume = loaded([movie('r1')]);
    rerenderHome();
    expect(carouselFocus('row-resume')).toBe(false);
    expect(carouselFocus('row-nextUp')).toBe(true);
  });

  it('stops asking for focus once a card has had it', () => {
    // Otherwise the Carousel takes focus again when Home comes back, over
    // the card the user left from.
    queries.sections = loaded<HomeSection[]>(['resume', 'nextUp']);
    renderHome();
    expect(carouselFocus('row-resume')).toBe(true);

    fireEvent(screen.getByTestId('row-resume-item-0'), 'focus');
    expect(carouselFocus('row-resume')).toBe(false);
    expect(carouselFocus('row-nextUp')).toBe(false);
  });

  it('opens the details of a pressed card', () => {
    queries.sections = loaded<HomeSection[]>(['resume']);
    renderHome();

    fireEvent.press(screen.getByTestId('row-resume-item-0'));
    expect(navigate).toHaveBeenCalledWith('Details', {
      itemId: 'r1',
      title: 'Movie r1',
    });
  });

  it('shows the focused card backdrop once focus settles', () => {
    jest.useFakeTimers();
    queries.sections = loaded<HomeSection[]>(['resume']);
    queries.resume = loaded([
      movie('r1', {BackdropImageTags: ['bd1']}),
      movie('r2', {BackdropImageTags: ['bd2']}),
      movie('r3'),
    ]);
    renderHome();
    const backdrop = () =>
      screen.queryByTestId('backdrop-image', {includeHiddenElements: true})
        ?.props.source.uri as string | undefined;

    fireEvent(screen.getByTestId('row-resume-item-0'), 'focus');
    act(() => jest.advanceTimersByTime(BACKDROP_DELAY_MS - 1));
    fireEvent(screen.getByTestId('row-resume-item-1'), 'focus');
    act(() => jest.advanceTimersByTime(BACKDROP_DELAY_MS - 1));
    // Moving on before it settles loads nothing.
    expect(backdrop()).toBeUndefined();

    act(() => jest.advanceTimersByTime(1));
    expect(backdrop()).toContain('/Items/r2/Images/Backdrop');

    // A card without a backdrop clears it.
    fireEvent(screen.getByTestId('row-resume-item-2'), 'focus');
    act(() => jest.advanceTimersByTime(BACKDROP_DELAY_MS + 1000));
    expect(backdrop()).toBeUndefined();
  });

  it('refetches stale Home queries when Home regains focus', () => {
    const refetch = jest
      .spyOn(client, 'refetchQueries')
      .mockResolvedValue(undefined);
    renderHome();

    act(() => mockFocusEffect?.());
    expect(refetch).not.toHaveBeenCalled();

    act(() => mockFocusEffect?.());
    expect(refetch).toHaveBeenCalledWith(
      {queryKey: homeKeys.all('srv1', 'u1'), type: 'active', stale: true},
      {cancelRefetch: false},
    );
  });

  it.each([
    ['movies', 0, 'lib-movies', 'Movies'],
    ['tvshows', 1, 'lib-shows', 'Shows'],
  ] as const)(
    'opens the %s library from My media',
    (collectionType, index, libraryId, title) => {
      queries.sections = loaded<HomeSection[]>(['myMedia']);
      queries.myMedia = loaded([
        {...MOVIES, DisplayPreferencesId: 'dp-movies'},
        {...SHOWS, DisplayPreferencesId: 'dp-shows'},
      ]);
      renderHome();

      fireEvent.press(screen.getByTestId(`row-myMedia-item-${index}`));
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('Library', {
        libraryId,
        title,
        collectionType,
        displayPreferencesId: libraryId.replace('lib-', 'dp-'),
      });
    },
  );

  it("uses the library's id when it has no DisplayPreferencesId", () => {
    queries.sections = loaded<HomeSection[]>(['myMedia']);
    renderHome();

    fireEvent.press(screen.getByTestId('row-myMedia-item-1'));
    expect(navigate).toHaveBeenCalledWith('Library', {
      libraryId: 'lib-shows',
      title: 'Shows',
      collectionType: 'tvshows',
      displayPreferencesId: 'lib-shows',
    });
  });

  it('opens the details of a My media card of another type', () => {
    queries.sections = loaded<HomeSection[]>(['myMedia']);
    queries.myMedia = loaded([library('lib-mixed', 'Mixed', 'mixed')]);
    renderHome();

    fireEvent.press(screen.getByTestId('row-myMedia-item-0'));
    expect(navigate).toHaveBeenCalledWith('Details', {
      itemId: 'lib-mixed',
      title: 'Mixed',
    });
  });

  it('draws the backdrop behind the toolbar, across the whole screen', () => {
    queries.sections = loaded<HomeSection[]>(['resume']);
    renderHome();

    // Not inside the content area below the toolbar.
    expect(
      within(screen.getByTestId('home-screen')).queryByTestId('backdrop', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    // The screen's first child, so the toolbar draws over it.
    const tree = screen.toJSON() as ReactTestRendererJSON;
    expect(
      tree.children?.map(
        (child) => (child as ReactTestRendererJSON).props.testID,
      ),
    ).toEqual(['backdrop', 'toolbar', 'home-screen']);
  });

  it('focuses the Home button until a row can take focus', () => {
    queries.sections = pending();
    renderHome();
    expect(screen.getByTestId('toolbar-home').props.hasTVPreferredFocus).toBe(
      true,
    );

    queries.sections = loaded<HomeSection[]>(['resume']);
    rerenderHome();
    expect(screen.getByTestId('toolbar-home').props.hasTVPreferredFocus).toBe(
      false,
    );
    expect(carouselFocus('row-resume')).toBe(true);
  });

  it('scrolls to the top when a first-row card gets focus', () => {
    queries.sections = loaded<HomeSection[]>(['myMedia', 'resume']);
    renderHome();
    const scrollTo = jest.fn();
    screen.UNSAFE_getByType(ScrollView).instance.scrollTo = scrollTo;

    // Below the first row, the list scrolls only as far as the card needs.
    fireEvent(screen.getByTestId('row-resume-item-0'), 'focus');
    expect(scrollTo).not.toHaveBeenCalled();

    // In the first row, the row title shows too, so Up reaches the toolbar.
    fireEvent(screen.getByTestId('row-myMedia-item-1'), 'focus');
    expect(scrollTo).toHaveBeenCalledWith({y: 0});
  });

  describe('coming back to Home', () => {
    const focusCard = (testID: string, tag: number) =>
      fireEvent(screen.getByTestId(testID), 'focus', {
        nativeEvent: {target: tag},
      });
    // The navigator runs the focus effect on mount and on every return.
    const returnToHome = () => {
      act(() => mockFocusEffect?.());
      act(() => jest.advanceTimersByTime(RESTORE_FOCUS_DELAY_MS));
    };

    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(client, 'refetchQueries').mockResolvedValue(undefined);
      queries.sections = loaded<HomeSection[]>(['myMedia', 'resume', 'nextUp']);
      queries.resume = loaded([movie('r1'), movie('r2')]);
    });

    it('focuses the last focused card again', () => {
      renderHome();
      act(() => mockFocusEffect?.());
      focusCard('row-myMedia-item-0', 101);
      focusCard('row-resume-item-1', 202);

      returnToHome();
      expect(mockFocusManager.focus).toHaveBeenCalledTimes(1);
      expect(mockFocusManager.focus).toHaveBeenCalledWith(202);
    });

    it('waits for Vega to settle focus first', () => {
      renderHome();
      act(() => mockFocusEffect?.());
      focusCard('row-resume-item-0', 202);

      act(() => mockFocusEffect?.());
      act(() => jest.advanceTimersByTime(RESTORE_FOCUS_DELAY_MS - 1));
      expect(mockFocusManager.focus).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(1));
      expect(mockFocusManager.focus).toHaveBeenCalledWith(202);
    });

    it("falls back to the first row's card when that card is gone", () => {
      renderHome();
      act(() => mockFocusEffect?.());
      focusCard('row-myMedia-item-0', 101);
      focusCard('row-resume-item-1', 202);
      // Watched to the end elsewhere: r2 left Continue watching.
      queries.resume = loaded([movie('r1')]);
      rerenderHome();

      returnToHome();
      expect(mockFocusManager.focus).toHaveBeenCalledWith(101);
    });

    it('does nothing on the first visit or before any card had focus', () => {
      renderHome();
      act(() => mockFocusEffect?.());
      act(() => jest.advanceTimersByTime(RESTORE_FOCUS_DELAY_MS));
      returnToHome();

      expect(mockFocusManager.focus).not.toHaveBeenCalled();
    });

    describe('when a row reorders (R7-e)', () => {
      const {mockScrollToKey} = jest.requireMock<{
        mockScrollToKey: jest.Mock;
      }>('@amazon-devices/vega-carousel');

      it('follows the item it was on, not the slot', () => {
        queries.resume = loaded([movie('r1'), movie('r2'), movie('r3')]);
        renderHome();
        act(() => mockFocusEffect?.());
        focusCard('row-resume-item-1', 202);

        returnToHome();
        mockScrollToKey.mockClear();
        // Played just now: r2 moves to the front of Continue watching.
        queries.resume = loaded([movie('r2'), movie('r1'), movie('r3')]);
        rerenderHome();
        expect(mockScrollToKey).toHaveBeenCalledTimes(1);
        expect(mockScrollToKey).toHaveBeenCalledWith('row-resume', 'r2', false);
      });

      it('follows it when the reorder came before the restore', () => {
        queries.resume = loaded([movie('r1'), movie('r2'), movie('r3')]);
        renderHome();
        act(() => mockFocusEffect?.());
        focusCard('row-resume-item-1', 202);
        queries.resume = loaded([movie('r2'), movie('r1'), movie('r3')]);
        rerenderHome();
        mockScrollToKey.mockClear();

        returnToHome();
        expect(mockFocusManager.focus).toHaveBeenCalledWith(202);
        expect(mockScrollToKey).toHaveBeenCalledWith('row-resume', 'r2', false);
      });

      it('does nothing when the order stays', () => {
        queries.resume = loaded([movie('r1'), movie('r2')]);
        renderHome();
        act(() => mockFocusEffect?.());
        focusCard('row-resume-item-1', 202);
        mockScrollToKey.mockClear();

        queries.resume = loaded([movie('r1'), movie('r2')]);
        rerenderHome();
        expect(mockScrollToKey).not.toHaveBeenCalled();
      });

      it('stays on the slot when the item left the row', () => {
        queries.resume = loaded([movie('r1'), movie('r2'), movie('r3')]);
        renderHome();
        act(() => mockFocusEffect?.());
        focusCard('row-resume-item-1', 202);
        mockScrollToKey.mockClear();

        queries.resume = loaded([movie('r1'), movie('r3')]);
        rerenderHome();
        expect(mockScrollToKey).not.toHaveBeenCalled();
      });
    });

    it('tells apart the same item in two rows', () => {
      queries.nextUp = loaded([movie('r1')]);
      renderHome();
      act(() => mockFocusEffect?.());
      focusCard('row-resume-item-0', 202);
      focusCard('row-nextUp-item-0', 303);

      returnToHome();
      expect(mockFocusManager.focus).toHaveBeenCalledWith(303);
    });
  });
});

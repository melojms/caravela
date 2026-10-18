import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {act, fireEvent, render, screen} from '@testing-library/react-native';
import React from 'react';

import {createJellyfin} from '../../src/api/client';
import {
  SEARCH_GROUPS,
  type SearchGroupKey,
  type SearchGroupResult,
  useSearch,
} from '../../src/api/search';
import {useSession} from '../../src/auth/SessionContext';
import {SEARCH_DEBOUNCE_MS, SearchScreen} from '../../src/screens/SearchScreen';
import {layout} from '../../src/theme';
import {sessionFor} from '../auth/fakes';

jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

// useSearch is mocked: these tests drive what each group returns and check
// the term the screen asks for.
jest.mock('../../src/api/search', () => ({
  ...jest.requireActual('../../src/api/search'),
  useSearch: jest.fn(),
}));

jest.mock('@amazon-devices/react-navigation__native', () => ({
  ...jest.requireActual('@amazon-devices/react-navigation__native'),
  useFocusEffect: jest.fn(),
  // For the toolbar, which navigates on its own.
  useNavigation: () => ({popTo: jest.fn(), navigate: jest.fn()}),
}));

const SERVER = 'https://jf.example.com';
const api = createJellyfin('device-1').createApi(SERVER, 'token-1');

type Query = {
  data?: BaseItemDto[];
  isPending: boolean;
  isError: boolean;
  isPlaceholderData: boolean;
  error: unknown;
  refetch: jest.Mock;
};

const loaded = (data: BaseItemDto[]): Query => ({
  data,
  isPending: false,
  isError: false,
  isPlaceholderData: false,
  error: null,
  refetch: jest.fn(),
});
const pending = (): Query => ({
  isPending: true,
  isError: false,
  isPlaceholderData: false,
  error: null,
  refetch: jest.fn(),
});
const placeholder = (data: BaseItemDto[]): Query => ({
  ...loaded(data),
  isPlaceholderData: true,
});
const failed = (error: unknown = new Error('boom')): Query => ({
  isPending: false,
  isError: true,
  isPlaceholderData: false,
  error,
  refetch: jest.fn(),
});

const item = (id: string, type: BaseItemKind): BaseItemDto => ({
  Id: id,
  Name: `Item ${id}`,
  Type: type,
});

let groups: Record<SearchGroupKey, Query>;
let navigate: jest.Mock;

/** The term of the latest useSearch call. */
const searchedTerm = () => {
  const calls = (useSearch as jest.Mock).mock.calls;
  return calls[calls.length - 1][0] as string;
};
/** Every distinct term useSearch was called with, in order. */
const searchedTerms = () =>
  (useSearch as jest.Mock).mock.calls
    .map(([term]) => term as string)
    .filter((term, index, all) => index === 0 || term !== all[index - 1]);

const renderSearch = () =>
  render(
    <SearchScreen
      navigation={{navigate} as never}
      route={{key: 'Search', name: 'Search'} as never}
    />,
  );
const rerenderSearch = () =>
  screen.rerender(
    <SearchScreen
      navigation={{navigate} as never}
      route={{key: 'Search', name: 'Search'} as never}
    />,
  );

const input = () => screen.getByTestId('search-input');
const type = (text: string) => fireEvent.changeText(input(), text);
const submit = (submitAction?: string) =>
  fireEvent(input(), 'submitEditing', {
    nativeEvent: {text: '', submitAction},
  });
const settle = () => act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS));

const rowIds = () =>
  screen
    .queryAllByTestId(/^search-row-[a-z]+$/)
    .map((row) => row.props.testID as string);
const carousel = (key: SearchGroupKey) =>
  screen.UNSAFE_getByProps({uniqueId: `search-row-${key}`}).props;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  navigate = jest.fn();
  groups = {movies: pending(), shows: pending(), episodes: pending()};
  const session = sessionFor();
  session.api = api;
  (useSession as jest.Mock).mockReturnValue({session});
  (useSearch as jest.Mock).mockImplementation(
    (term: string): SearchGroupResult[] =>
      SEARCH_GROUPS.map((group) => ({
        ...group,
        // An empty term fetches nothing.
        query: (term.trim()
          ? groups[group.key]
          : {...pending(), data: undefined}) as never,
      })),
  );
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SearchScreen', () => {
  it('opens with the hint, no request and focus on the toolbar', () => {
    renderSearch();

    expect(screen.getByTestId('search-screen')).toBeTruthy();
    expect(screen.getByTestId('search-hint')).toBeTruthy();
    expect(screen.getByText('Search movies, shows and episodes')).toBeTruthy();
    expect(searchedTerms()).toEqual(['']);
    expect(screen.queryByTestId('search-loading')).toBeNull();
    expect(
      screen.getByTestId('toolbar-search').props.hasTVPreferredFocus,
    ).toBe(true);
    expect(input().props.hasTVPreferredFocus).toBeFalsy();
    // Vega opens its keyboard on focus otherwise; Enter on the field does.
    expect(input().props.showSoftInputOnFocus).toBe(false);
    expect(input().props.placeholder).toBe(
      'Search movies, shows and episodes',
    );
  });

  it('searches the trimmed term once typing settles', () => {
    renderSearch();

    type('pio');
    act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    type('pion');
    act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    // Each keystroke restarts the delay.
    expect(searchedTerm()).toBe('');

    type(' pioneer ');
    act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(searchedTerm()).toBe('');
    act(() => jest.advanceTimersByTime(1));
    expect(searchedTerm()).toBe('pioneer');
    expect(searchedTerms()).toEqual(['', 'pioneer']);
  });

  it('searches at once on submit', () => {
    renderSearch();

    type('pioneer');
    submit('search');
    expect(searchedTerm()).toBe('pioneer');

    // The pending debounce doesn't search again.
    settle();
    expect(searchedTerms()).toEqual(['', 'pioneer']);
  });

  it("ignores the keyboard's other actions", () => {
    renderSearch();

    type('pioneer');
    submit('showPassword');
    expect(searchedTerm()).toBe('');
  });

  it('shows the rows in order with their variants', () => {
    groups = {
      movies: loaded([item('m1', BaseItemKind.Movie)]),
      shows: loaded([item('s1', BaseItemKind.Series)]),
      episodes: loaded([item('e1', BaseItemKind.Episode)]),
    };
    renderSearch();
    type('a');
    settle();

    expect(rowIds()).toEqual([
      'search-row-movies',
      'search-row-shows',
      'search-row-episodes',
    ]);
    expect(screen.getByText('Movies')).toBeTruthy();
    expect(screen.getByText('Shows')).toBeTruthy();
    expect(screen.getByText('Episodes')).toBeTruthy();
    const width = (key: SearchGroupKey) =>
      screen.getByTestId(`search-row-${key}-item-0`).props.style.width;
    expect(width('movies')).toBe(layout.posterCard.width);
    expect(width('shows')).toBe(layout.posterCard.width);
    expect(width('episodes')).toBe(layout.landscapeCard.width);
    expect(screen.queryByTestId('search-hint')).toBeNull();
  });

  it('hides groups without results', () => {
    groups = {
      movies: loaded([]),
      shows: loaded([item('s1', BaseItemKind.Series)]),
      episodes: loaded([]),
    };
    renderSearch();
    type('pioneer');
    settle();

    expect(rowIds()).toEqual(['search-row-shows']);
    expect(screen.queryByText('Movies')).toBeNull();
  });

  it('opens the details of a pressed card', () => {
    groups = {
      movies: loaded([]),
      shows: loaded([item('s1', BaseItemKind.Series)]),
      episodes: loaded([]),
    };
    renderSearch();
    type('pioneer');
    settle();

    fireEvent.press(screen.getByTestId('search-row-shows-item-0'));
    expect(navigate).toHaveBeenCalledWith('Details', {
      itemId: 's1',
      title: 'Item s1',
    });
  });

  it('shows a spinner while a new term has nothing to show', () => {
    renderSearch();
    type('pioneer');
    settle();

    expect(screen.getByTestId('search-loading')).toBeTruthy();
    expect(screen.queryByTestId('search-hint')).toBeNull();

    // Still loading while one group is.
    groups.movies = loaded([]);
    groups.shows = loaded([]);
    rerenderSearch();
    expect(screen.getByTestId('search-loading')).toBeTruthy();
  });

  it('says so when nothing matches', () => {
    groups = {movies: loaded([]), shows: loaded([]), episodes: loaded([])};
    renderSearch();
    type(' zzzxq ');
    settle();

    expect(screen.getByText('No results for “zzzxq”')).toBeTruthy();
    expect(screen.queryByTestId('search-loading')).toBeNull();
  });

  it('shows a failed group with a Retry that refetches only it', () => {
    groups = {
      movies: failed(),
      shows: loaded([item('s1', BaseItemKind.Series)]),
      episodes: loaded([]),
    };
    renderSearch();
    type('pioneer');
    settle();

    expect(rowIds()).toEqual(['search-row-movies', 'search-row-shows']);
    expect(screen.getByText("Couldn't load this row.")).toBeTruthy();
    fireEvent.press(screen.getByTestId('search-row-movies-retry'));
    expect(groups.movies.refetch).toHaveBeenCalledTimes(1);
    expect(groups.shows.refetch).not.toHaveBeenCalled();
    expect(groups.episodes.refetch).not.toHaveBeenCalled();
  });

  it('shows a failed group even when nothing else matched', () => {
    groups = {movies: failed(), shows: loaded([]), episodes: loaded([])};
    renderSearch();
    type('pioneer');
    settle();

    expect(screen.getByTestId('search-row-movies-retry')).toBeTruthy();
    expect(screen.queryByText(/No results/)).toBeNull();
  });

  it('shows no error row for a 401', () => {
    groups = {
      movies: failed({isAxiosError: true, response: {status: 401}}),
      shows: loaded([item('s1', BaseItemKind.Series)]),
      episodes: loaded([]),
    };
    renderSearch();
    type('pioneer');
    settle();

    expect(rowIds()).toEqual(['search-row-shows']);
    expect(screen.queryByText("Couldn't load this row.")).toBeNull();
  });

  it('keeps the previous rows while the next term loads', () => {
    groups = {
      movies: loaded([]),
      shows: loaded([item('s1', BaseItemKind.Series)]),
      episodes: loaded([]),
    };
    renderSearch();
    type('pioneer');
    settle();

    groups = {
      movies: placeholder([]),
      shows: placeholder([item('s1', BaseItemKind.Series)]),
      episodes: placeholder([]),
    };
    type('earthfall');
    settle();
    expect(searchedTerm()).toBe('earthfall');
    expect(rowIds()).toEqual(['search-row-shows']);
    expect(screen.queryByTestId('search-loading')).toBeNull();
    expect(screen.queryByText(/No results/)).toBeNull();
  });

  it('shows a spinner, not "No results", while empty old results stand in', () => {
    groups = {
      movies: placeholder([]),
      shows: placeholder([]),
      episodes: placeholder([]),
    };
    renderSearch();
    type('earthfall');
    settle();

    expect(screen.getByTestId('search-loading')).toBeTruthy();
    expect(screen.queryByText(/No results/)).toBeNull();
  });

  it('goes back to the hint when the field is cleared', () => {
    groups = {
      movies: loaded([item('m1', BaseItemKind.Movie)]),
      shows: loaded([]),
      episodes: loaded([]),
    };
    renderSearch();
    type('pioneer');
    settle();
    expect(rowIds()).toEqual(['search-row-movies']);

    type('');
    settle();
    expect(searchedTerm()).toBe('');
    expect(screen.getByTestId('search-hint')).toBeTruthy();
    expect(rowIds()).toEqual([]);
  });

  describe('focus after submit', () => {
    it('moves to the first row with results', () => {
      groups = {
        movies: loaded([]),
        shows: loaded([item('s1', BaseItemKind.Series)]),
        episodes: loaded([item('e1', BaseItemKind.Episode)]),
      };
      renderSearch();
      type('pioneer');
      settle();
      // Typing alone doesn't take focus from the field.
      expect(carousel('shows').hasPreferredFocus).toBe(false);

      submit('search');
      expect(carousel('shows').hasPreferredFocus).toBe(true);
      expect(carousel('episodes').hasPreferredFocus).toBe(false);

      // Once a card has focus, no row asks for it again.
      fireEvent(screen.getByTestId('search-row-shows-item-0'), 'focus');
      expect(carousel('shows').hasPreferredFocus).toBe(false);
    });

    it('waits for the results of the submitted term', () => {
      renderSearch();
      type('pioneer');
      submit('search');
      expect(screen.getByTestId('search-loading')).toBeTruthy();

      groups = {
        movies: loaded([item('m1', BaseItemKind.Movie)]),
        shows: pending(),
        episodes: pending(),
      };
      rerenderSearch();
      expect(carousel('movies').hasPreferredFocus).toBe(true);
    });

    it("doesn't move to the previous term's results", () => {
      groups = {
        movies: loaded([item('m1', BaseItemKind.Movie)]),
        shows: loaded([]),
        episodes: loaded([]),
      };
      renderSearch();
      type('big');
      settle();

      groups = {
        movies: placeholder([item('m1', BaseItemKind.Movie)]),
        shows: placeholder([]),
        episodes: placeholder([]),
      };
      type('pioneer');
      submit('search');
      expect(carousel('movies').hasPreferredFocus).toBe(false);

      groups = {
        movies: loaded([]),
        shows: loaded([item('s1', BaseItemKind.Series)]),
        episodes: loaded([]),
      };
      rerenderSearch();
      expect(carousel('shows').hasPreferredFocus).toBe(true);
    });

    it('stays on the field when nothing matches', () => {
      groups = {movies: loaded([]), shows: loaded([]), episodes: loaded([])};
      renderSearch();
      type('zzzxq');
      submit('search');
      expect(screen.getByText('No results for “zzzxq”')).toBeTruthy();

      // A later search by typing doesn't take focus from the field.
      groups = {
        movies: loaded([item('m1', BaseItemKind.Movie)]),
        shows: loaded([]),
        episodes: loaded([]),
      };
      type('big');
      settle();
      expect(carousel('movies').hasPreferredFocus).toBe(false);
    });
  });
});

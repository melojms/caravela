import {CollectionType} from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import {ItemSortBy} from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import {SortOrder} from '@jellyfin/sdk/lib/generated-client/models/sort-order';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {act, fireEvent, render, screen} from '@testing-library/react-native';
import {AxiosError, AxiosHeaders} from 'axios';
import React, {useSyncExternalStore} from 'react';
import {BackHandler} from 'react-native';

import {useLibraryItems} from '../src/api/library';
import {useLibraryPrefs, useSaveLibraryPrefs} from '../src/api/libraryPrefs';
import {
  DEFAULT_LIBRARY_PREFS,
  type LibraryKind,
  type LibraryPrefs,
  type LibraryQuery,
} from '../src/api/libraryTypes';
import {useSession} from '../src/auth/SessionContext';
import type {CardItem} from '../src/components/types';
import {RESTORE_FOCUS_DELAY_MS} from '../src/screens/HomeScreen';
import {LibraryScreen} from '../src/screens/LibraryScreen';
import {sessionFor} from './auth/fakes';

jest.mock('../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

jest.mock('../src/api/library', () => ({
  ...jest.requireActual('../src/api/library'),
  useLibraryItems: jest.fn(),
}));

jest.mock('../src/api/libraryPrefs', () => ({
  useLibraryPrefs: jest.fn(),
  useSaveLibraryPrefs: jest.fn(),
}));

let mockFocusEffect: (() => void | (() => void)) | undefined;
jest.mock('@amazon-devices/react-navigation__native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocusEffect = effect;
  },
  useNavigation: () => ({popTo: jest.fn(), navigate: jest.fn()}),
}));

// FocusManager is a native TurboModule; swap in a recorder.
const mockFocusManager = {
  focus: jest.fn(),
  getFocused: jest.fn((): number | undefined => undefined),
};
jest.mock('@amazon-devices/react-native-kepler', () => {
  const actual = jest.requireActual('@amazon-devices/react-native-kepler');
  return new Proxy(actual, {
    get: (target, key) =>
      key === 'FocusManager' ? mockFocusManager : target[key],
  });
});

const addListener = BackHandler.addEventListener as jest.Mock;

const unauthorized = () =>
  new AxiosError('401', '401', undefined, undefined, {
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config: {headers: new AxiosHeaders()},
    data: null,
  });

const cardsOf = (count: number, prefix = 'm'): CardItem[] =>
  Array.from({length: count}, (_, i) => ({
    id: `${prefix}${i}`,
    title: `Title ${prefix}${i}`,
  }));

type Items = ReturnType<typeof useLibraryItems>;

const itemsState = (extra: Partial<Items> = {}): Items =>
  ({
    cards: cardsOf(3),
    total: 3,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    status: 'success',
    isPending: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    ...extra,
  } as Items);

// The prefs live in a tiny store, so a save re-renders the screen like the
// real cache update does.
let prefsValue: LibraryPrefs | undefined;
let prefsError = false;
const listeners = new Set<() => void>();
const setPrefs = (prefs: LibraryPrefs | undefined) => {
  prefsValue = prefs;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

let items: Items;
let mutate: jest.Mock;
let navigate: jest.Mock;
let client: QueryClient;

const lastQuery = (): LibraryQuery | undefined => {
  const calls = jest.mocked(useLibraryItems).mock.calls;
  return calls[calls.length - 1][2];
};

const renderLibrary = (kind: LibraryKind = CollectionType.Movies) =>
  render(
    <QueryClientProvider client={client}>
      <LibraryScreen
        navigation={{navigate} as never}
        route={
          {
            key: 'Library',
            name: 'Library',
            params: {
              libraryId: 'lib-1',
              title: kind === CollectionType.Movies ? 'Movies' : 'Shows',
              collectionType: kind,
              displayPreferencesId: 'dp-1',
            },
          } as never
        }
      />
    </QueryClientProvider>,
  );

// Re-renders with the current `items` (the hook mock reads it on render).
const refresh = () => act(() => setPrefs(prefsValue && {...prefsValue}));

const text = (testID: string) =>
  [screen.getByTestId(testID).props.children].flat().join('');

const preferredCards = () =>
  screen
    .queryAllByTestId(/^library-grid-item-\d+$/)
    .filter((card) => card.props.hasTVPreferredFocus)
    .map((card) => card.props.testID);

const backHandler = () => {
  const calls = addListener.mock.calls;
  return calls[calls.length - 1][1] as () => boolean;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockFocusEffect = undefined;
  listeners.clear();
  prefsValue = DEFAULT_LIBRARY_PREFS;
  prefsError = false;
  items = itemsState();
  navigate = jest.fn();
  client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  mutate = jest.fn((prefs: LibraryPrefs) => setPrefs(prefs));
  jest.mocked(useSession).mockReturnValue({session: sessionFor()} as never);
  jest.mocked(useLibraryPrefs).mockImplementation(
    () =>
      ({
        data: useSyncExternalStore(subscribe, () => prefsValue),
        isError: prefsError,
      } as never),
  );
  jest.mocked(useSaveLibraryPrefs).mockReturnValue({mutate} as never);
  jest.mocked(useLibraryItems).mockImplementation(() => items);
});

describe('LibraryScreen', () => {
  describe('prefs', () => {
    it('waits for the saved prefs before querying', () => {
      prefsValue = undefined;
      items = itemsState({cards: [], status: 'pending', isPending: true});
      renderLibrary();

      expect(lastQuery()).toBeUndefined();
      expect(screen.getByTestId('library-loading')).toBeTruthy();

      act(() =>
        setPrefs({
          ...DEFAULT_LIBRARY_PREFS,
          sortBy: ItemSortBy.DateCreated,
          sortOrder: SortOrder.Descending,
        }),
      );
      expect(lastQuery()).toEqual({
        sortBy: ItemSortBy.DateCreated,
        sortOrder: SortOrder.Descending,
        filters: DEFAULT_LIBRARY_PREFS.filters,
        letter: undefined,
      });
    });

    it('queries the library by id and kind', () => {
      renderLibrary(CollectionType.Tvshows);
      expect(jest.mocked(useLibraryItems)).toHaveBeenLastCalledWith(
        'lib-1',
        CollectionType.Tvshows,
        expect.anything(),
      );
      expect(jest.mocked(useLibraryPrefs)).toHaveBeenCalledWith(
        'dp-1',
        CollectionType.Tvshows,
      );
    });
  });

  describe('sort', () => {
    it('opens Sort by with the library kind options, the current one checked', () => {
      renderLibrary(CollectionType.Tvshows);
      fireEvent.press(screen.getByTestId('library-header-sort'));

      expect(screen.getByText('Sort by')).toBeTruthy();
      expect(screen.getByText('Date episode added')).toBeTruthy();
      expect(
        screen.getByTestId('library-sort-picker-row-0').props
          .accessibilityState,
      ).toEqual({checked: true});
    });

    it('saves the picked sort, closes and remounts the grid', () => {
      renderLibrary();
      const grid = screen.getByTestId('library-grid');
      fireEvent.press(screen.getByTestId('library-header-sort'));
      // Date added
      fireEvent.press(screen.getByTestId('library-sort-picker-row-1'));

      expect(mutate).toHaveBeenCalledWith({
        ...DEFAULT_LIBRARY_PREFS,
        sortBy: ItemSortBy.DateCreated,
        sortOrder: SortOrder.Descending,
      });
      expect(screen.queryByTestId('library-sort-picker')).toBeNull();
      expect(lastQuery()?.sortBy).toBe(ItemSortBy.DateCreated);
      expect(screen.getByTestId('library-grid')).not.toBe(grid);
    });

    it("doesn't save when the current sort is picked again", () => {
      renderLibrary();
      fireEvent.press(screen.getByTestId('library-header-sort'));
      fireEvent.press(screen.getByTestId('library-sort-picker-row-0'));

      expect(mutate).not.toHaveBeenCalled();
      expect(screen.queryByTestId('library-sort-picker')).toBeNull();
    });

    it('clears the letter and hides its button when sorting away from Name', () => {
      renderLibrary();
      fireEvent.press(screen.getByTestId('library-header-letter'));
      fireEvent.press(screen.getByTestId('library-letter-picker-K'));
      expect(lastQuery()?.letter).toBe('K');

      fireEvent.press(screen.getByTestId('library-header-sort'));
      fireEvent.press(screen.getByTestId('library-sort-picker-row-1'));

      expect(lastQuery()?.letter).toBeUndefined();
      expect(screen.queryByTestId('library-header-letter')).toBeNull();
    });

    it('closes on Back without saving', () => {
      renderLibrary();
      fireEvent.press(screen.getByTestId('library-header-sort'));
      let handled: boolean | undefined;
      act(() => {
        handled = backHandler()();
      });

      expect(handled).toBe(true);
      expect(screen.queryByTestId('library-sort-picker')).toBeNull();
      expect(mutate).not.toHaveBeenCalled();
    });

    it('focuses the Sort button again once the picker has closed', () => {
      jest.useFakeTimers();
      mockFocusManager.getFocused.mockReturnValue(41);
      renderLibrary();
      fireEvent.press(screen.getByTestId('library-header-sort'));
      fireEvent.press(screen.getByTestId('library-sort-picker-row-2'));

      // Vega drops focus when the picker unmounts; focusing at once is lost.
      act(() => jest.advanceTimersByTime(RESTORE_FOCUS_DELAY_MS - 1));
      expect(mockFocusManager.focus).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(1));
      expect(mockFocusManager.focus).toHaveBeenCalledWith(41);
    });
  });

  describe('filters', () => {
    it('saves Unwatched and Favorites toggles', () => {
      renderLibrary();

      fireEvent.press(screen.getByTestId('library-header-unwatched'));
      expect(mutate).toHaveBeenLastCalledWith({
        ...DEFAULT_LIBRARY_PREFS,
        filters: {unwatchedOnly: true, favoritesOnly: false},
      });

      fireEvent.press(screen.getByTestId('library-header-favorites'));
      expect(mutate).toHaveBeenLastCalledWith({
        ...DEFAULT_LIBRARY_PREFS,
        filters: {unwatchedOnly: true, favoritesOnly: true},
      });

      fireEvent.press(screen.getByTestId('library-header-unwatched'));
      expect(mutate).toHaveBeenLastCalledWith({
        ...DEFAULT_LIBRARY_PREFS,
        filters: {unwatchedOnly: false, favoritesOnly: true},
      });
      expect(lastQuery()?.filters).toEqual({
        unwatchedOnly: false,
        favoritesOnly: true,
      });
      expect(
        screen.getByTestId('library-header-favorites').props.accessibilityState,
      ).toEqual({selected: true});
    });
  });

  describe('letter', () => {
    it('opens the picker on the current letter and sets the picked one', () => {
      renderLibrary();
      fireEvent.press(screen.getByTestId('library-header-letter'));
      expect(screen.getByTestId('library-letter-picker')).toBeTruthy();
      fireEvent.press(screen.getByTestId('library-letter-picker-B'));

      expect(screen.queryByTestId('library-letter-picker')).toBeNull();
      expect(lastQuery()?.letter).toBe('B');
      expect(mutate).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('library-header-letter'));
      expect(
        screen.getByTestId('library-letter-picker-B').props.hasTVPreferredFocus,
      ).toBe(true);
    });

    it('clears the letter when it is picked again', () => {
      renderLibrary();
      fireEvent.press(screen.getByTestId('library-header-letter'));
      fireEvent.press(screen.getByTestId('library-letter-picker-B'));
      fireEvent.press(screen.getByTestId('library-header-letter'));
      fireEvent.press(screen.getByTestId('library-letter-picker-B'));

      expect(lastQuery()?.letter).toBeUndefined();
    });

    it('closes on Back, keeps the letter and refocuses the button', () => {
      jest.useFakeTimers();
      mockFocusManager.getFocused.mockReturnValue(44);
      renderLibrary();
      fireEvent.press(screen.getByTestId('library-header-letter'));
      fireEvent.press(screen.getByTestId('library-letter-picker-C'));
      fireEvent.press(screen.getByTestId('library-header-letter'));
      act(() => {
        backHandler()();
      });

      expect(screen.queryByTestId('library-letter-picker')).toBeNull();
      expect(lastQuery()?.letter).toBe('C');
      mockFocusManager.focus.mockClear();
      act(() => jest.advanceTimersByTime(RESTORE_FOCUS_DELAY_MS - 1));
      expect(mockFocusManager.focus).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(1));
      expect(mockFocusManager.focus).toHaveBeenCalledWith(44);
    });
  });

  describe('header', () => {
    it('shows the status text', () => {
      renderLibrary();
      expect(text('library-header-status')).toBe(
        "Showing all items from 'Movies' sorted by Name",
      );

      fireEvent.press(screen.getByTestId('library-header-favorites'));
      fireEvent.press(screen.getByTestId('library-header-letter'));
      fireEvent.press(screen.getByTestId('library-letter-picker-D'));
      expect(text('library-header-status')).toBe(
        "Showing favorites beginning with those whose name starts with D from 'Movies' sorted by Name",
      );
    });

    it('shows the focused card name and counter, reset by a new query', () => {
      items = itemsState({total: 120});
      renderLibrary();
      expect(text('library-header-counter')).toBe('');

      fireEvent(screen.getByTestId('library-grid-item-2'), 'focus');
      expect(text('library-header-focused-name')).toBe('Title m2');
      expect(text('library-header-counter')).toBe('3 | 120');

      fireEvent.press(screen.getByTestId('library-header-unwatched'));
      expect(text('library-header-focused-name')).toBe('');
      expect(text('library-header-counter')).toBe('');
    });
  });

  describe('grid', () => {
    it('focuses the first card on open and after each query change', () => {
      renderLibrary();
      expect(preferredCards()).toEqual(['library-grid-item-0']);

      fireEvent(screen.getByTestId('library-grid-item-1'), 'focus');
      expect(preferredCards()).toEqual([]);

      fireEvent.press(screen.getByTestId('library-header-favorites'));
      expect(preferredCards()).toEqual(['library-grid-item-0']);
    });

    it('focuses the first card again when an earlier query comes back', () => {
      // `#` matches nothing, so no card takes focus under it.
      jest
        .mocked(useLibraryItems)
        .mockImplementation((_id, _kind, query) =>
          query?.letter === '#' ? itemsState({cards: [], total: 0}) : items,
        );
      renderLibrary();
      fireEvent(screen.getByTestId('library-grid-item-2'), 'focus');
      expect(preferredCards()).toEqual([]);

      fireEvent.press(screen.getByTestId('library-header-letter'));
      fireEvent.press(screen.getByTestId('library-letter-picker-#'));
      expect(screen.getByTestId('library-empty')).toBeTruthy();
      // Picking # again clears it: the query is the first one again.
      fireEvent.press(screen.getByTestId('library-header-letter'));
      fireEvent.press(screen.getByTestId('library-letter-picker-#'));

      expect(lastQuery()?.letter).toBeUndefined();
      expect(preferredCards()).toEqual(['library-grid-item-0']);
      expect(text('library-header-focused-name')).toBe('');
      expect(text('library-header-counter')).toBe('');
    });

    it('loads the next page at the end, repeatedly', () => {
      const fetchNextPage = jest.fn();
      items = itemsState({fetchNextPage, hasNextPage: true});
      renderLibrary();
      const grid = screen.getByTestId('library-grid');

      fireEvent(grid, 'endReached');
      fireEvent(grid, 'endReached');
      expect(fetchNextPage).toHaveBeenCalledTimes(2);
    });

    it('shows a spinner while the next page loads', () => {
      renderLibrary();
      expect(screen.queryByTestId('library-loading-more')).toBeNull();

      items = itemsState({isFetchingNextPage: true});
      refresh();
      expect(screen.getByTestId('library-loading-more')).toBeTruthy();
    });

    it('opens Details for a movie', () => {
      renderLibrary();
      fireEvent.press(screen.getByTestId('library-grid-item-1'));
      expect(navigate).toHaveBeenCalledWith('Details', {
        itemId: 'm1',
        title: 'Title m1',
      });
    });

    it('opens the placeholder for a series', () => {
      renderLibrary(CollectionType.Tvshows);
      fireEvent.press(screen.getByTestId('library-grid-item-0'));
      expect(navigate).toHaveBeenCalledWith('DetailsPlaceholder', {
        itemId: 'm0',
        title: 'Title m0',
      });
    });
  });

  describe('states', () => {
    it('shows a spinner while the first page loads', () => {
      items = itemsState({cards: [], status: 'pending', isPending: true});
      renderLibrary();
      expect(screen.getByTestId('library-loading')).toBeTruthy();
      expect(screen.queryByTestId('library-grid')).toBeNull();
    });

    it('shows an error with Retry', () => {
      const refetch = jest.fn();
      items = itemsState({
        cards: [],
        status: 'error',
        isError: true,
        error: new Error('boom'),
        refetch,
      });
      renderLibrary();

      expect(screen.getByText("Couldn't load this library.")).toBeTruthy();
      fireEvent.press(screen.getByTestId('library-retry'));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('shows nothing for a 401 (the session goes to the picker)', () => {
      items = itemsState({
        cards: [],
        status: 'error',
        isError: true,
        error: unauthorized(),
      });
      renderLibrary();
      expect(screen.queryByTestId('library-error')).toBeNull();
      expect(screen.queryByTestId('library-loading')).toBeNull();
    });

    it('shows "No items found" without a hint when nothing is filtered', () => {
      items = itemsState({cards: [], total: 0});
      renderLibrary();
      expect(screen.getByText('No items found')).toBeTruthy();
      expect(screen.queryByTestId('library-empty-hint')).toBeNull();
    });

    it('hints at the filters when they are on', () => {
      prefsValue = {
        ...DEFAULT_LIBRARY_PREFS,
        filters: {unwatchedOnly: true, favoritesOnly: false},
      };
      items = itemsState({cards: [], total: 0});
      renderLibrary();
      expect(screen.getByTestId('library-empty-hint')).toBeTruthy();
    });

    it('hints at the letter when one is set', () => {
      renderLibrary();
      items = itemsState({cards: [], total: 0});
      fireEvent.press(screen.getByTestId('library-header-letter'));
      fireEvent.press(screen.getByTestId('library-letter-picker-Q'));
      expect(screen.getByTestId('library-empty-hint')).toBeTruthy();
    });
  });

  describe('coming back', () => {
    const focusCard = (index: number, tag: number) =>
      fireEvent(screen.getByTestId(`library-grid-item-${index}`), 'focus', {
        nativeEvent: {target: tag},
      });
    const comeBack = () => {
      act(() => mockFocusEffect?.());
      act(() => jest.advanceTimersByTime(RESTORE_FOCUS_DELAY_MS));
    };

    beforeEach(() => jest.useFakeTimers());

    it('does nothing on the first focus', () => {
      const refetch = jest.spyOn(client, 'refetchQueries');
      renderLibrary();
      focusCard(1, 77);
      comeBack();

      expect(mockFocusManager.focus).not.toHaveBeenCalled();
      expect(refetch).not.toHaveBeenCalled();
    });

    it('focuses the last card again and refetches stale library queries', () => {
      const refetch = jest.spyOn(client, 'refetchQueries');
      renderLibrary();
      act(() => mockFocusEffect?.());
      focusCard(2, 77);

      act(() => mockFocusEffect?.());
      act(() => jest.advanceTimersByTime(RESTORE_FOCUS_DELAY_MS - 1));
      expect(mockFocusManager.focus).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(1));

      expect(mockFocusManager.focus).toHaveBeenCalledWith(77);
      expect(refetch).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['library', 'srv1', 'u1'],
          type: 'active',
          stale: true,
        }),
        {cancelRefetch: false},
      );
    });

    it('focuses the first card when the last one is gone', () => {
      renderLibrary();
      let leave: void | (() => void);
      act(() => {
        leave = mockFocusEffect?.();
      });
      focusCard(2, 77);
      const grid = screen.getByTestId('library-grid');
      act(() => leave?.());

      // Changed while Details is on top: nothing moves until the screen is back.
      items = itemsState({cards: cardsOf(2)});
      refresh();
      expect(screen.getByTestId('library-grid')).toBe(grid);
      comeBack();

      expect(mockFocusManager.focus).not.toHaveBeenCalled();
      expect(screen.getByTestId('library-grid')).not.toBe(grid);
      expect(preferredCards()).toEqual(['library-grid-item-0']);
    });

    it('focuses the first card when a refetch drops the focused one', () => {
      renderLibrary();
      act(() => mockFocusEffect?.());
      focusCard(1, 77);
      comeBack();
      expect(mockFocusManager.focus).toHaveBeenCalledWith(77);

      items = itemsState({cards: [cardsOf(3)[0], cardsOf(3)[2]]});
      refresh();
      expect(preferredCards()).toEqual(['library-grid-item-0']);
    });
  });
});

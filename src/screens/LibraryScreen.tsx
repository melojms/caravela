import {FocusManager} from '@amazon-devices/react-native-kepler';
import {useFocusEffect} from '@amazon-devices/react-navigation__native';
import {CollectionType} from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import {ItemSortBy} from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import {useQueryClient} from '@tanstack/react-query';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {isUnauthorized} from '../api/home';
import {libraryKeys, libraryStatusText, useLibraryItems} from '../api/library';
import {useLibraryPrefs, useSaveLibraryPrefs} from '../api/libraryPrefs';
import {LIBRARY_SORT_OPTIONS, type LibraryQuery} from '../api/libraryTypes';
import {useSession} from '../auth/SessionContext';
import {FocusableButton} from '../components/FocusableButton';
import {LetterPicker} from '../components/LetterPicker';
import {LibraryHeader} from '../components/LibraryHeader';
import {PosterGrid} from '../components/PosterGrid';
import {TrackPicker} from '../components/TrackPicker';
import {CardItem} from '../components/types';
import {RootStackScreenProps} from '../navigation/types';
import {colors, layout, spacing, typography} from '../theme';
import {RESTORE_FOCUS_DELAY_MS} from './HomeScreen';
import {ScreenContainer} from './ScreenContainer';

type Picker = 'sort' | 'letter';

/** The last focused card, with the query it was focused under. */
type FocusedCard = {
  queryKey: string;
  id: string;
  name: string;
  index: number;
  tag?: number;
};

/**
 * A movies or TV shows library as a poster grid, like androidtv's
 * BrowseGridFragment: the header (name, focused item, status line, counter
 * and toolbar) over the grid. The sort and filters are saved in the
 * library's display preferences; the jump letter only lasts while the screen
 * is open.
 */
export const LibraryScreen = ({
  navigation,
  route,
}: RootStackScreenProps<'Library'>) => {
  const {libraryId, title, collectionType, displayPreferencesId} = route.params;
  const {session} = useSession();
  const serverId = session?.server.id ?? '';
  const userId = session?.user.Id ?? '';

  const sortOptions = LIBRARY_SORT_OPTIONS[collectionType];
  const prefs = useLibraryPrefs(displayPreferencesId, collectionType);
  const savePrefs = useSaveLibraryPrefs(displayPreferencesId, collectionType);
  const [letter, setLetter] = useState<string>();

  // No query until the prefs are read, so the first page has the saved sort.
  const query = useMemo<LibraryQuery | undefined>(
    () => (prefs.data ? {...prefs.data, letter} : undefined),
    [prefs.data, letter],
  );
  const items = useLibraryItems(libraryId, collectionType, query);
  const queryKey = query ? JSON.stringify(query) : '';

  // A new query remounts the grid, which focuses its first card again (the
  // grid keeps its top row in a ref). `remount` also does when the last
  // focused card is gone.
  const [remount, setRemount] = useState(0);
  const gridKey = `${queryKey}#${remount}`;
  const gridKeyRef = useRef(gridKey);
  gridKeyRef.current = gridKey;
  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;
  // The grid key a card was focused under. Until then the first card asks for
  // focus; after, nothing does, so a first card that's scrolled back into
  // view doesn't take focus.
  const [focusTakenKey, setFocusTakenKey] = useState<string>();

  const [focused, setFocused] = useState<FocusedCard>();
  const lastFocused = useRef<FocusedCard>(undefined);
  const onItemFocus = useCallback(
    (item: CardItem, index: number, tag?: number) => {
      const card = {
        queryKey: queryKeyRef.current,
        id: item.id,
        name: item.title,
        index,
        tag,
      };
      lastFocused.current = card;
      setFocused(card);
      setFocusTakenKey(gridKeyRef.current);
    },
    [],
  );
  // The header only shows a focused card from the current query.
  const current = focused?.queryKey === queryKey ? focused : undefined;

  const [picker, setPicker] = useState<Picker>();
  // The toolbar button that opened the picker, focused again when it closes.
  const pickerOpener = useRef<number>(undefined);
  const openPicker = useCallback((which: Picker) => {
    pickerOpener.current = FocusManager.getFocused();
    setPicker(which);
  }, []);
  const closePicker = useCallback(() => setPicker(undefined), []);
  const onSortPress = useCallback(() => openPicker('sort'), [openPicker]);
  const onLetterPress = useCallback(() => openPicker('letter'), [openPicker]);
  // Vega drops focus when the picker's focused view unmounts, and a focus()
  // straight away is lost, so wait like Home does after a pop.
  useEffect(() => {
    const opener = pickerOpener.current;
    if (picker || opener === undefined) {
      return;
    }
    pickerOpener.current = undefined;
    const timer = setTimeout(
      () => FocusManager.focus(opener),
      RESTORE_FOCUS_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [picker]);

  const selectedSort = sortOptions.findIndex(
    (option) => option.sortBy === query?.sortBy,
  );
  const sortRows = useMemo(
    () => sortOptions.map(({label}, index) => ({index, label})),
    [sortOptions],
  );
  const onSortSelect = useCallback(
    (index: number) => {
      const option = sortOptions[index];
      const unchanged =
        option?.sortBy === prefs.data?.sortBy &&
        option?.sortOrder === prefs.data?.sortOrder;
      if (prefs.data && option && !unchanged) {
        savePrefs.mutate({
          ...prefs.data,
          sortBy: option.sortBy,
          sortOrder: option.sortOrder,
        });
        // androidtv hides the letter button for other sorts.
        if (option.sortBy !== ItemSortBy.SortName) {
          setLetter(undefined);
        }
      }
      closePicker();
    },
    [sortOptions, prefs.data, savePrefs, closePicker],
  );

  const toggleFilter = useCallback(
    (filter: 'unwatchedOnly' | 'favoritesOnly') => {
      if (prefs.data) {
        const {filters} = prefs.data;
        savePrefs.mutate({
          ...prefs.data,
          filters: {...filters, [filter]: !filters[filter]},
        });
      }
    },
    [prefs.data, savePrefs],
  );
  const onToggleUnwatched = useCallback(
    () => toggleFilter('unwatchedOnly'),
    [toggleFilter],
  );
  const onToggleFavorites = useCallback(
    () => toggleFilter('favoritesOnly'),
    [toggleFilter],
  );

  const onLetterSelect = useCallback(
    (picked: string) => {
      setLetter((previous) => (previous === picked ? undefined : picked));
      closePicker();
    },
    [closePicker],
  );

  const onItemPress = useCallback(
    (item: CardItem) => {
      const params = {itemId: item.id, title: item.title};
      if (collectionType === CollectionType.Movies) {
        navigation.navigate('Details', params);
      } else {
        // Series details come in a later task.
        navigation.navigate('DetailsPlaceholder', params);
      }
    },
    [navigation, collectionType],
  );

  // The card to come back to: the last focused one if it's still in the grid.
  // Otherwise the grid remounts, which focuses its first card.
  const {cards} = items;
  const screenFocused = useRef(false);
  const restoreFocus = useRef<() => void>(undefined);
  restoreFocus.current = () => {
    const last = lastFocused.current;
    if (!last || last.queryKey !== queryKey || !cards.length) {
      return;
    }
    if (cards.some((card) => card.id === last.id)) {
      if (last.tag !== undefined) {
        FocusManager.focus(last.tag);
      }
    } else {
      lastFocused.current = undefined;
      setRemount((count) => count + 1);
    }
  };
  // A refetch after coming back can drop the focused card (e.g. it was
  // unfavourited with the Favorites filter on).
  useEffect(() => {
    const last = lastFocused.current;
    if (
      screenFocused.current &&
      last?.queryKey === queryKey &&
      cards.length &&
      !cards.some((card) => card.id === last.id)
    ) {
      lastFocused.current = undefined;
      setRemount((count) => count + 1);
    }
  }, [cards, queryKey]);

  // Coming back from Details focuses the last card again, like Home, and
  // refetches stale library queries (Details can change favourites and
  // played state). The first focus is the mount.
  const queryClient = useQueryClient();
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      screenFocused.current = true;
      if (!focusedBefore.current) {
        focusedBefore.current = true;
        return () => {
          screenFocused.current = false;
        };
      }
      const restoreTimer = setTimeout(
        () => restoreFocus.current?.(),
        RESTORE_FOCUS_DELAY_MS,
      );
      queryClient
        .refetchQueries(
          {
            queryKey: libraryKeys.all(serverId, userId),
            type: 'active',
            stale: true,
          },
          {cancelRefetch: false},
        )
        .catch(() => undefined);
      return () => {
        screenFocused.current = false;
        clearTimeout(restoreTimer);
      };
    }, [queryClient, serverId, userId]),
  );

  const filtered =
    !!query && (query.filters.unwatchedOnly || query.filters.favoritesOnly);

  let content;
  if (prefs.isError || (items.isError && isUnauthorized(items.error))) {
    // Only a 401 gets here; the session sends the user to the picker.
    content = null;
  } else if (items.isError) {
    content = (
      <View style={styles.center} testID="library-error">
        <Text style={styles.message}>Couldn't load this library.</Text>
        <View style={styles.retry}>
          <FocusableButton
            testID="library-retry"
            label="Retry"
            hasTVPreferredFocus
            onPress={() => items.refetch()}
          />
        </View>
      </View>
    );
  } else if (!query || items.isPending) {
    content = (
      <View style={styles.center} testID="library-loading">
        <ActivityIndicator size="large" color={colors.cyan} />
      </View>
    );
  } else if (!cards.length) {
    content = (
      <View style={styles.center} testID="library-empty">
        <Text style={styles.message}>No items found</Text>
        {filtered || query.letter ? (
          <Text style={styles.hint} testID="library-empty-hint">
            Turn off the filters or the letter to see more.
          </Text>
        ) : null}
      </View>
    );
  } else {
    content = (
      <View style={styles.grid}>
        <PosterGrid
          key={gridKey}
          items={cards}
          onItemPress={onItemPress}
          onItemFocus={onItemFocus}
          onEndReached={items.fetchNextPage}
          focusFirstItem={focusTakenKey !== gridKey}
          testID="library-grid"
        />
        {items.isFetchingNextPage ? (
          <View style={styles.more} testID="library-loading-more">
            <ActivityIndicator size="small" color={colors.cyan} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenContainer testID="library-screen">
        {/* The header pads its own edges; ScreenContainer's left padding
            would double it. */}
        <View style={styles.header}>
          <LibraryHeader
            title={title}
            statusText={
              query ? libraryStatusText(title, query, sortOptions) : ''
            }
            focusedName={current?.name}
            focusedIndex={current?.index}
            total={
              query && items.status === 'success' ? items.total : undefined
            }
            filters={
              query?.filters ?? {unwatchedOnly: false, favoritesOnly: false}
            }
            letter={letter}
            showLetterButton={query?.sortBy === ItemSortBy.SortName}
            onSortPress={onSortPress}
            onToggleUnwatched={onToggleUnwatched}
            onToggleFavorites={onToggleFavorites}
            onLetterPress={onLetterPress}
          />
        </View>
        {content}
      </ScreenContainer>
      {picker === 'sort' ? (
        <TrackPicker
          testID="library-sort-picker"
          title="Sort by"
          tracks={sortRows}
          selectedIndex={selectedSort >= 0 ? selectedSort : undefined}
          onSelect={onSortSelect}
          onClose={closePicker}
        />
      ) : null}
      {picker === 'letter' ? (
        <LetterPicker
          testID="library-letter-picker"
          selected={letter}
          onSelect={onLetterSelect}
          onClose={closePicker}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    marginLeft: -layout.screenPadding,
  },
  grid: {
    flex: 1,
    marginTop: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: layout.screenPadding,
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  retry: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  // Over the grid's bottom edge while the next page loads.
  more: {
    position: 'absolute',
    left: 0,
    right: layout.screenPadding,
    bottom: spacing.sm,
    alignItems: 'center',
  },
});

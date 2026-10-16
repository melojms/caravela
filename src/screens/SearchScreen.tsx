import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {TextInput} from '@amazon-devices/react-native-kepler';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInputSubmitEditingEventData,
  View,
} from 'react-native';

import {isUnauthorized} from '../api/home';
import {toCardItem} from '../api/items';
import {
  type SearchGroupKey,
  type SearchGroupResult,
  useSearch,
} from '../api/search';
import {useSession} from '../auth/SessionContext';
import {ContentRow} from '../components/ContentRow';
import type {CardVariant} from '../components/FocusableCard';
import {FocusableButton} from '../components/FocusableButton';
import {CardItem} from '../components/types';
import {RootStackScreenProps} from '../navigation/types';
import {
  colors,
  focus,
  layout,
  px,
  radius,
  spacing,
  typography,
} from '../theme';
import {ScreenContainer} from './ScreenContainer';

/** How long typing must pause before the term is searched (androidtv's). */
export const SEARCH_DEBOUNCE_MS = 600;

const HINT = 'Search movies, shows and episodes';

const VARIANTS: Record<SearchGroupKey, CardVariant> = {
  movies: 'poster',
  shows: 'poster',
  episodes: 'landscape',
};

/**
 * Vega's keyboard also calls onSubmitEditing for its own actions, so only
 * the return key's action submits (as on Add server). The event has no
 * submitAction outside Vega.
 */
const isSubmitKey = (
  event: NativeSyntheticEvent<TextInputSubmitEditingEventData>,
) => {
  const action = (event.nativeEvent as {submitAction?: string}).submitAction;
  return action === undefined || action === 'search';
};

const hasFailed = ({query}: SearchGroupResult) =>
  query.isError && !isUnauthorized(query.error);

/**
 * Search, like androidtv's SearchFragment: a field under the toolbar and one
 * row each for movies, shows and episodes. Typing searches once it pauses;
 * submitting searches at once and moves focus to the results, which also
 * closes Vega's full-screen keyboard.
 */
export const SearchScreen = ({navigation}: RootStackScreenProps<'Search'>) => {
  const {session} = useSession();
  const api = session?.api;

  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const cancelDebounce = useCallback(() => {
    if (debounce.current !== undefined) {
      clearTimeout(debounce.current);
      debounce.current = undefined;
    }
  }, []);
  useEffect(() => cancelDebounce, [cancelDebounce]);

  // Set on submit, until a result card takes focus or nothing matched.
  const [focusResults, setFocusResults] = useState(false);
  const submits = useRef(0);

  const onChangeText = useCallback(
    (value: string) => {
      setText(value);
      setFocusResults(false);
      cancelDebounce();
      const trimmed = value.trim();
      if (!trimmed) {
        // Back to the hint at once.
        setTerm('');
        return;
      }
      debounce.current = setTimeout(() => {
        debounce.current = undefined;
        setTerm(trimmed);
      }, SEARCH_DEBOUNCE_MS);
    },
    [cancelDebounce],
  );

  const onSubmitEditing = useCallback(
    (event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      if (!isSubmitKey(event)) {
        return;
      }
      cancelDebounce();
      const trimmed = text.trim();
      submits.current += 1;
      setTerm(trimmed);
      setFocusResults(!!trimmed);
    },
    [cancelDebounce, text],
  );

  const groups = useSearch(term);

  // Query data keeps its identity until it changes, so each group's cards
  // are mapped once per fetch and the Carousels don't re-render on focus.
  const cardCache = useRef(new WeakMap<BaseItemDto[], CardItem[]>());
  const cardsFor = (group: SearchGroupResult): CardItem[] => {
    const data = group.query.data;
    if (!data || !api) {
      return [];
    }
    let cards = cardCache.current.get(data);
    if (!cards) {
      cards = data.map((item) =>
        toCardItem(item, api, {variant: VARIANTS[group.key]}),
      );
      cardCache.current.set(data, cards);
    }
    return cards;
  };
  const groupCards = groups.map(cardsFor);

  const shown = groups.filter(
    (group, index) => groupCards[index].length || hasFailed(group),
  );
  // Old results standing in for the term's count as loading.
  const loading = groups.some(
    ({query}) => query.isPending || query.isPlaceholderData,
  );

  // After a submit, the first row with the term's own results takes focus.
  // Its Carousel is remounted with preferred focus, so it takes focus even
  // when it was already on screen.
  const focusTarget = focusResults
    ? groups.find(
        ({query}, index) =>
          !query.isPlaceholderData && groupCards[index].length,
      )?.key
    : undefined;
  const targetedSubmit = useRef(0);
  const rowSubmit = useRef(new Map<SearchGroupKey, number>());
  if (focusTarget && targetedSubmit.current !== submits.current) {
    targetedSubmit.current = submits.current;
    rowSubmit.current.set(focusTarget, submits.current);
  }
  const noTarget = focusResults && !loading && !focusTarget;
  useEffect(() => {
    // Nothing to focus: focus stays on the field.
    if (noTarget) {
      setFocusResults(false);
    }
  }, [noTarget]);

  // A focused card scrolls the list only as far as the card needs, which can
  // hide the first row's title; Up then only scrolls it back in. So a
  // first-row card scrolls to the top, and one Up reaches the field.
  const scrollRef = useRef<ScrollView>(null);
  const firstRow = useRef<SearchGroupKey | undefined>(undefined);
  firstRow.current = shown[0]?.key;
  const focusHandlers = useRef(new Map<SearchGroupKey, () => void>());
  const onItemFocusFor = (key: SearchGroupKey) => {
    let handler = focusHandlers.current.get(key);
    if (!handler) {
      handler = () => {
        setFocusResults(false);
        if (key === firstRow.current) {
          scrollRef.current?.scrollTo({y: 0});
        }
      };
      focusHandlers.current.set(key, handler);
    }
    return handler;
  };

  const openDetails = useCallback(
    (item: CardItem) =>
      navigation.navigate('Details', {
        itemId: item.id,
        title: item.title,
      }),
    [navigation],
  );

  let content;
  if (!term) {
    content = (
      <View style={styles.center}>
        <Text style={styles.message} testID="search-hint">
          {HINT}
        </Text>
      </View>
    );
  } else if (!shown.length && loading) {
    content = (
      <View style={styles.center} testID="search-loading">
        <ActivityIndicator size="large" color={colors.cyan} />
      </View>
    );
  } else if (!shown.length) {
    content = (
      <View style={styles.center}>
        <Text style={styles.message} testID="search-empty">
          {`No results for “${term}”`}
        </Text>
      </View>
    );
  } else {
    content = (
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        {shown.map((group) => {
          const testID = `search-row-${group.key}`;
          if (hasFailed(group)) {
            return (
              <View key={group.key} style={styles.errorRow} testID={testID}>
                <Text style={styles.rowTitle}>{group.title}</Text>
                <Text style={styles.message}>Couldn't load this row.</Text>
                <View style={styles.retry}>
                  <FocusableButton
                    testID={`${testID}-retry`}
                    label="Retry"
                    onPress={() => group.query.refetch()}
                  />
                </View>
              </View>
            );
          }
          return (
            <ContentRow
              key={`${group.key}-${rowSubmit.current.get(group.key) ?? 0}`}
              testID={testID}
              title={group.title}
              variant={VARIANTS[group.key]}
              items={groupCards[groups.indexOf(group)]}
              onItemPress={openDetails}
              onItemFocus={onItemFocusFor(group.key)}
              hasPreferredFocus={group.key === focusTarget}
            />
          );
        })}
      </ScrollView>
    );
  }

  return (
    <ScreenContainer toolbar="search" testID="search-screen">
      <TextInput
        testID="search-input"
        style={[styles.input, inputFocused && styles.inputFocused]}
        value={text}
        onChangeText={onChangeText}
        placeholder={HINT}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Search"
        // Titles the Vega TV keyboard, which otherwise reads "Enter".
        auxOptions="title:Search"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        // Focus alone (Down from the toolbar) doesn't open Vega's full-screen
        // keyboard; pressing Enter on the field does.
        showSoftInputOnFocus={false}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
      />
      {content}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  input: {
    ...typography.heading,
    maxWidth: px(960),
    minHeight: px(88),
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    textAlignVertical: 'center',
    borderRadius: radius.md,
    borderWidth: focus.borderWidth,
    borderColor: colors.transparent,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  inputFocused: {
    borderColor: colors.focus,
    backgroundColor: colors.surfaceRaised,
  },
  content: {
    paddingRight: layout.screenPadding,
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorRow: {
    marginBottom: spacing.lg,
  },
  rowTitle: {
    ...typography.heading,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
  },
  retry: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
});

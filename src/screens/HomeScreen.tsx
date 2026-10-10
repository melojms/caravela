import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {CollectionType} from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import {FocusManager} from '@amazon-devices/react-native-kepler';
import {useFocusEffect} from '@amazon-devices/react-navigation__native';
import {useQueries, useQueryClient} from '@tanstack/react-query';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  fetchLatest,
  homeKeys,
  isUnauthorized,
  latestLibraries,
  useHomeSections,
  useMyMedia,
  useNextUp,
  useResume,
} from '../api/home';
import {toCardItem} from '../api/items';
import {useSession} from '../auth/SessionContext';
import {Backdrop} from '../components/Backdrop';
import {ContentRow} from '../components/ContentRow';
import type {CardVariant} from '../components/FocusableCard';
import {FocusableButton} from '../components/FocusableButton';
import {CardItem} from '../components/types';
import {RootStackScreenProps} from '../navigation/types';
import {colors, layout, spacing, typography} from '../theme';
import {ScreenContainer} from './ScreenContainer';

/** How long focus must rest on a card before its backdrop loads, in ms. */
export const BACKDROP_DELAY_MS = 300;

/**
 * How long after Home regains focus it focuses the last card again, in ms.
 * Vega first gives focus back to what was focused when Home was left.
 */
export const RESTORE_FOCUS_DELAY_MS = 100;

/** The parts of a row's query Home reads. */
type RowQuery = {
  data?: BaseItemDto[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
};

type HomeRow = {
  key: string;
  title: string;
  variant: CardVariant;
  preferParentThumb?: boolean;
  query: RowQuery;
};

const hasFailed = (query: RowQuery) =>
  query.isError && !isUnauthorized(query.error);

/**
 * Home: one row per server Home section, in the user's order, over the
 * focused card's backdrop. Row titles follow androidtv.
 */
export const HomeScreen = ({navigation}: RootStackScreenProps<'Home'>) => {
  const {session} = useSession();
  const api = session?.api;
  const serverId = session?.server.id ?? '';
  const userId = session?.user.Id ?? '';

  const sections = useHomeSections();
  const myMedia = useMyMedia();
  const resume = useResume();
  const nextUp = useNextUp();

  const showsLatest = !!sections.data?.includes('latest');
  const libraries = useMemo(
    () =>
      showsLatest && myMedia.data && session
        ? latestLibraries(myMedia.data, session.user)
        : [],
    [showsLatest, myMedia.data, session],
  );
  // One query per library; useLatest can't be called a variable number of times.
  const latest = useQueries({
    queries: libraries.map((library) => {
      const libraryId = library.Id ?? '';
      return {
        queryKey: homeKeys.latest(serverId, userId, libraryId),
        queryFn: () => fetchLatest(api as Api, userId, libraryId),
        enabled: !!api,
      };
    }),
  });

  const rows = useMemo(() => {
    const result: HomeRow[] = [];
    for (const section of sections.data ?? []) {
      if (section === 'myMedia') {
        result.push({
          key: 'myMedia',
          title: 'My media',
          variant: 'landscape',
          query: myMedia,
        });
      } else if (section === 'resume') {
        result.push({
          key: 'resume',
          title: 'Continue watching',
          variant: 'landscape',
          preferParentThumb: true,
          query: resume,
        });
      } else if (section === 'nextUp') {
        result.push({
          key: 'nextUp',
          title: 'Next up',
          variant: 'landscape',
          preferParentThumb: true,
          query: nextUp,
        });
      } else if (myMedia.isPending || myMedia.isError) {
        // The Latest rows need the libraries first. Until then they count as
        // loading; if the libraries fail and My Media isn't shown to report
        // it, the error shows here.
        const reported = sections.data?.includes('myMedia');
        result.push({
          key: 'latest',
          title: 'Recently added',
          variant: 'poster',
          query: {
            isPending: myMedia.isPending,
            isError: myMedia.isError && !reported,
            error: myMedia.error,
            refetch: myMedia.refetch,
          },
        });
      } else {
        libraries.forEach((library, index) =>
          result.push({
            key: `latest-${library.Id}`,
            title: `Recently added in ${library.Name ?? ''}`,
            variant: 'poster',
            query: latest[index],
          }),
        );
      }
    }
    return result;
  }, [sections.data, myMedia, resume, nextUp, libraries, latest]);

  // Query data keeps its identity until it changes, so each row's cards are
  // mapped once per fetch and the Carousels don't re-render on focus changes.
  const cardCache = useRef(new WeakMap<BaseItemDto[], CardItem[]>());
  const cardsFor = (row: HomeRow): CardItem[] => {
    const data = row.query.data;
    if (!data || !api) {
      return [];
    }
    let cards = cardCache.current.get(data);
    if (!cards) {
      cards = data.map((item) =>
        toCardItem(item, api, {
          variant: row.variant,
          preferParentThumb: row.preferParentThumb,
        }),
      );
      cardCache.current.set(data, cards);
    }
    return cards;
  };
  const rowCards = rows.map(cardsFor);

  // The first row with cards takes focus once. A row above it that loads
  // later doesn't take focus away.
  const firstRow = rows.find((_, index) => rowCards[index].length)?.key;
  const preferredRow = useRef<string | undefined>(undefined);
  if (!preferredRow.current) {
    preferredRow.current = firstRow;
  }

  // The last focused row, and each row's last focused card with its native
  // tag, so coming back to Home can focus that card again.
  const lastFocusedRow = useRef<string | undefined>(undefined);
  const rowFocus = useRef(new Map<string, {id: string; tag?: number}>());
  // Each row's card-focus handler, kept stable so the Carousels don't
  // re-render.
  const focusHandlers = useRef(
    new Map<string, (item: CardItem, tag?: number) => void>(),
  );

  const [backdropUri, setBackdropUri] = useState<string>();
  const backdropTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // Like androidtv's BackgroundService: the backdrop follows the focused
  // card, once focus settles, so scrolling fast doesn't load every image.
  const cancelBackdrop = useCallback(() => {
    if (backdropTimer.current !== undefined) {
      clearTimeout(backdropTimer.current);
    }
  }, []);
  const showBackdrop = useCallback(
    (uri?: string) => {
      cancelBackdrop();
      backdropTimer.current = setTimeout(
        () => setBackdropUri(uri),
        BACKDROP_DELAY_MS,
      );
    },
    [cancelBackdrop],
  );
  useEffect(() => cancelBackdrop, [cancelBackdrop]);
  const onItemFocusFor = (rowKey: string) => {
    let handler = focusHandlers.current.get(rowKey);
    if (!handler) {
      handler = (item: CardItem, tag?: number) => {
        lastFocusedRow.current = rowKey;
        rowFocus.current.set(rowKey, {id: item.id, tag});
        showBackdrop(item.backdropUris?.[0]);
      };
      focusHandlers.current.set(rowKey, handler);
    }
    return handler;
  };
  const clearBackdrop = useCallback(() => showBackdrop(), [showBackdrop]);

  const openDetails = useCallback(
    (item: CardItem) =>
      navigation.navigate('DetailsPlaceholder', {
        itemId: item.id,
        title: item.title,
      }),
    [navigation],
  );
  // My media cards open their library's screen, by the library's type.
  const libraryTypes = useRef(new Map<string, BaseItemDto['CollectionType']>());
  libraryTypes.current = new Map(
    (myMedia.data ?? []).map((view) => [view.Id ?? '', view.CollectionType]),
  );
  const openLibrary = useCallback(
    (item: CardItem) => {
      const type = libraryTypes.current.get(item.id);
      if (type === CollectionType.Movies) {
        navigation.navigate('Movies');
      } else if (type === CollectionType.Tvshows) {
        navigation.navigate('Shows');
      } else {
        openDetails(item);
      }
    },
    [navigation, openDetails],
  );

  // Coming back to Home focuses the last focused card again. Vega doesn't
  // restore focus after a pop: it focuses what was focused when Home was left
  // (e.g. the toolbar's Search). So Home focuses the card's native view
  // itself, once that has happened. If the card is gone after a refetch, the
  // first row's last focused card (Home's first focus lands there).
  const restoreFocus = useRef<() => void>(undefined);
  restoreFocus.current = () => {
    const tagIn = (rowKey?: string) => {
      const focused = rowKey ? rowFocus.current.get(rowKey) : undefined;
      const index = rows.findIndex((row) => row.key === rowKey);
      return index >= 0 &&
        rowCards[index].some((card) => card.id === focused?.id)
        ? focused?.tag
        : undefined;
    };
    const tag = tagIn(lastFocusedRow.current) ?? tagIn(firstRow);
    if (tag !== undefined) {
      FocusManager.focus(tag);
    }
  };

  // Coming back to Home also refetches what is older than the stale time.
  // The first focus is the mount, which fetches anyway.
  const queryClient = useQueryClient();
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedBefore.current) {
        focusedBefore.current = true;
        return;
      }
      const restoreTimer = setTimeout(
        () => restoreFocus.current?.(),
        RESTORE_FOCUS_DELAY_MS,
      );
      queryClient
        .refetchQueries(
          {
            queryKey: homeKeys.all(serverId, userId),
            type: 'active',
            stale: true,
          },
          {cancelRefetch: false},
        )
        .catch(() => undefined);
      return () => clearTimeout(restoreTimer);
    }, [queryClient, serverId, userId]),
  );

  const anyShown = rows.some(
    (row, index) => rowCards[index].length || hasFailed(row.query),
  );
  const loading =
    sections.isPending ||
    (!anyShown && rows.some((row) => row.query.isPending));

  let content;
  if (loading) {
    content = (
      <View style={styles.center} testID="home-loading">
        <ActivityIndicator size="large" color={colors.cyan} />
      </View>
    );
  } else if (sections.isError) {
    // Only a 401 gets here; the session sends the user to the picker.
    content = null;
  } else if (!anyShown) {
    content = (
      <View style={styles.center}>
        <Text style={styles.message} testID="home-empty">
          Nothing here yet
        </Text>
      </View>
    );
  } else {
    content = (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        {rows.map((row, index) =>
          hasFailed(row.query) ? (
            <View
              key={row.key}
              style={styles.errorRow}
              testID={`row-${row.key}`}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.message}>Couldn't load this row.</Text>
              <View style={styles.retry}>
                <FocusableButton
                  testID={`row-${row.key}-retry`}
                  label="Retry"
                  onFocus={clearBackdrop}
                  onPress={() => row.query.refetch()}
                />
              </View>
            </View>
          ) : (
            <ContentRow
              key={row.key}
              testID={`row-${row.key}`}
              title={row.title}
              variant={row.variant}
              items={rowCards[index]}
              onItemPress={row.key === 'myMedia' ? openLibrary : openDetails}
              onItemFocus={onItemFocusFor(row.key)}
              hasPreferredFocus={row.key === preferredRow.current}
            />
          ),
        )}
      </ScrollView>
    );
  }

  return (
    <ScreenContainer
      toolbar="home"
      focusToolbar={!anyShown}
      background={<Backdrop uri={backdropUri} />}
      testID="home-screen">
      {content}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
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

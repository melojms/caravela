import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {ImageType} from '@jellyfin/sdk/lib/generated-client/models/image-type';
import {uses24HourClock} from '@amazon-devices/react-native-localize';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import React, {useCallback, useMemo, useRef} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useItemDetails,
  useSimilarItems,
  useToggleFavorite,
  useTogglePlayed,
} from '../api/details';
import {isUnauthorized} from '../api/home';
import {
  detailsInfoItems,
  infoRowEntries,
  peopleToCards,
  resumeLabel,
  resumePositionMs,
} from '../api/itemInfo';
import {
  backdropUris,
  cardImageSize,
  imageUrl,
  placeholderColor,
  toCardItem,
} from '../api/items';
import {useSession} from '../auth/SessionContext';
import {Backdrop} from '../components/Backdrop';
import {ContentRow} from '../components/ContentRow';
import {DetailsActions} from '../components/DetailsActions';
import {DetailsHeader} from '../components/DetailsHeader';
import {FocusableButton} from '../components/FocusableButton';
import {CardItem, DetailsAction} from '../components/types';
import {RootStackScreenProps} from '../navigation/types';
import {colors, layout, spacing, typography} from '../theme';
import {DetailsPlaceholder} from './DetailsPlaceholder';
import {ScreenContainer} from './ScreenContainer';

type DetailsProps = RootStackScreenProps<'Details'>;

/**
 * Item details, after androidtv's FullDetailsFragment. Movies get the full
 * page; other kinds keep the placeholder until their own task.
 */
export const DetailsScreen = ({route, navigation}: DetailsProps) => {
  const {itemId, title} = route.params;
  const {
    data: item,
    isPending,
    isError,
    error,
    refetch,
  } = useItemDetails(itemId);

  if (isPending) {
    return (
      <ScreenContainer testID="details-loading">
        <View style={styles.center}>
          <Text style={styles.loadingTitle}>{title}</Text>
          <ActivityIndicator size="large" color={colors.cyan} />
        </View>
      </ScreenContainer>
    );
  }
  if (isError) {
    // A 401 sends the user to the picker; nothing to show meanwhile.
    if (isUnauthorized(error)) {
      return null;
    }
    return (
      <ScreenContainer testID="details-error">
        <View style={styles.center}>
          <Text style={styles.loadingTitle}>{title}</Text>
          <Text style={styles.message}>Couldn't load this item.</Text>
          <View style={styles.retry}>
            <FocusableButton
              testID="details-retry"
              label="Retry"
              hasTVPreferredFocus
              onPress={() => refetch()}
            />
          </View>
        </View>
      </ScreenContainer>
    );
  }
  if (item.Type !== BaseItemKind.Movie) {
    // Same params and only goBack is used, so the placeholder fits as is.
    return (
      <DetailsPlaceholder
        route={
          route as unknown as RootStackScreenProps<'DetailsPlaceholder'>['route']
        }
        navigation={
          navigation as unknown as RootStackScreenProps<'DetailsPlaceholder'>['navigation']
        }
      />
    );
  }
  return <MovieDetails item={item} navigation={navigation} />;
};

type MovieDetailsProps = {
  item: BaseItemDto;
  navigation: DetailsProps['navigation'];
};

const MovieDetails = ({item, navigation}: MovieDetailsProps) => {
  const {session} = useSession();
  const api = session?.api as Api;
  const itemId = item.Id ?? '';

  const favorite = useToggleFavorite(itemId);
  const played = useTogglePlayed(itemId);
  const similar = useSimilarItems(itemId);

  const posterTag = item.ImageTags?.[ImageType.Primary];
  const posterUri =
    posterTag && itemId
      ? imageUrl(
          api,
          {itemId, type: ImageType.Primary, tag: posterTag},
          cardImageSize('poster'),
        )
      : undefined;
  const backdropUri = useMemo(() => backdropUris(item, api)[0], [item, api]);
  const infoRow = useMemo(() => infoRowEntries(item), [item]);
  const infoItems = detailsInfoItems(item, {use24Hour: uses24HourClock()});

  // `navigate`, not `push`: pressing Play twice mustn't stack two players.
  const onPlay = (startMs: number) =>
    navigation.navigate('Player', {itemId, title: item.Name ?? '', startMs});

  const resumeMs = resumePositionMs(item);
  const actions: DetailsAction[] = [];
  if (resumeMs !== undefined) {
    actions.push({
      key: 'resume',
      label: resumeLabel(resumeMs),
      icon: 'resume',
      onPress: () => onPlay(resumeMs),
    });
  }
  actions.push(
    {key: 'play', label: 'Play', icon: 'play', onPress: () => onPlay(0)},
    {
      key: 'watched',
      label: 'Watched',
      icon: 'watched',
      active: item.UserData?.Played === true,
      disabled: played.isPending,
      onPress: played.toggle,
    },
    {
      key: 'favorite',
      label: 'Favorite',
      icon: 'favorite',
      active: item.UserData?.IsFavorite === true,
      disabled: favorite.isPending,
      onPress: favorite.toggle,
    },
  );
  // Only the first action on open takes focus. If it goes away later (Resume
  // after marking watched), the new first button mustn't grab focus.
  const initialFirst = useRef(actions[0].key);

  // One person can be listed twice (e.g. Director and Writer), and the row
  // keys cards by id, so each card gets its position in the id.
  const people = item.People;
  const castCards = useMemo(
    () =>
      peopleToCards(item, api).map((card, index) => ({
        ...card,
        id: `${card.id}-${index}`,
      })),
    // People is what the cards come from; other item fields don't matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, api],
  );
  const similarCards = useMemo(
    () =>
      similar.isError
        ? []
        : (similar.data ?? []).map((similarItem) =>
            toCardItem(similarItem, api, {variant: 'poster'}),
          ),
    [similar.data, similar.isError, api],
  );

  const openPerson = useCallback(
    (card: CardItem) => {
      const index = castCards.indexOf(card);
      const person = people?.[index];
      navigation.push('DetailsPlaceholder', {
        itemId: person?.Id ?? card.id,
        title: card.title,
      });
    },
    [castCards, people, navigation],
  );
  const openSimilar = useCallback(
    (card: CardItem) =>
      navigation.push('Details', {itemId: card.id, title: card.title}),
    [navigation],
  );

  // Like androidtv's overview row: when the buttons get focus again (Up from
  // the rows), the whole header scrolls back into view.
  const scrollRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(
    () => scrollRef.current?.scrollTo({y: 0}),
    [],
  );

  return (
    <ScreenContainer
      background={<Backdrop uri={backdropUri} />}
      testID="details-movie">
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        <DetailsHeader
          title={item.Name ?? ''}
          posterUri={posterUri}
          placeholderColor={placeholderColor(itemId)}
          infoRow={infoRow}
          genres={item.Genres ?? undefined}
          overview={item.Overview ?? undefined}
          infoItems={infoItems}
        />
        {/* Up from a card anywhere in the rows lands on the buttons. */}
        <TVFocusGuideView
          autoFocus
          style={styles.actions}
          onFocus={scrollToTop}>
          <DetailsActions
            actions={actions}
            hasTVPreferredFocus={actions[0].key === initialFirst.current}
          />
        </TVFocusGuideView>
        <ContentRow
          testID="row-cast"
          title="Cast & crew"
          variant="poster"
          items={castCards}
          onItemPress={openPerson}
        />
        <ContentRow
          testID="row-similar"
          title="More like this"
          variant="poster"
          items={similarCards}
          onItemPress={openSimilar}
        />
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.md,
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
  },
  retry: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  content: {
    paddingRight: layout.screenPadding,
    paddingBottom: spacing.xxl,
  },
  actions: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
});

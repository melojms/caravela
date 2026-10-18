import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {uses24HourClock} from '@amazon-devices/react-native-localize';
import React, {useCallback, useMemo} from 'react';

import {
  useSimilarItems,
  useToggleFavorite,
  useTogglePlayed,
} from '../../api/details';
import {
  detailsInfoItems,
  infoRowEntries,
  peopleToCards,
  resumeLabel,
  resumePositionMs,
} from '../../api/itemInfo';
import {
  backdropUris,
  cardImageSize,
  placeholderColor,
  toCardItem,
} from '../../api/items';
import {useSession} from '../../auth/SessionContext';
import {ContentRow} from '../../components/ContentRow';
import {CardItem, DetailsAction} from '../../components/types';
import {useMinuteClock} from '../../components/useMinuteClock';
import {RootStackScreenProps} from '../../navigation/types';
import {DetailsLayout, primaryImageUri} from './DetailsLayout';

type MovieDetailsProps = {
  item: BaseItemDto;
  navigation: RootStackScreenProps<'Details'>['navigation'];
};

/** A movie's details: Resume/Play and the toggles, cast and similar items. */
export const MovieDetails = ({item, navigation}: MovieDetailsProps) => {
  const {session} = useSession();
  const api = session?.api as Api;
  const itemId = item.Id ?? '';

  const favorite = useToggleFavorite(itemId);
  const played = useTogglePlayed(itemId);
  const similar = useSimilarItems(itemId);

  const posterUri = primaryImageUri(item, api, cardImageSize('poster'));
  const backdropUri = useMemo(() => backdropUris(item, api)[0], [item, api]);
  const infoRow = useMemo(() => infoRowEntries(item), [item]);
  const infoItems = detailsInfoItems(item, {
    // Current whenever Details shows: it ticks, and catches up on return.
    now: useMinuteClock(),
    use24Hour: uses24HourClock(),
  });

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
      navigation.push('Details', {
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

  return (
    <DetailsLayout
      testID="details-movie"
      backdropUri={backdropUri}
      header={{
        title: item.Name ?? '',
        posterUri,
        placeholderColor: placeholderColor(itemId),
        infoRow,
        genres: item.Genres ?? undefined,
        overview: item.Overview ?? undefined,
        infoItems,
      }}
      actions={actions}>
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
    </DetailsLayout>
  );
};

import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {PersonKind} from '@jellyfin/sdk/lib/generated-client/models/person-kind';
import {uses24HourClock} from '@amazon-devices/react-native-localize';
import React, {useCallback, useMemo} from 'react';

import {useToggleFavorite, useTogglePlayed} from '../../api/details';
import {
  detailsInfoItems,
  detailsTitles,
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
import {useNextEpisodes, usePreviousEpisode} from '../../api/tvDetails';
import {useSession} from '../../auth/SessionContext';
import {ContentRow} from '../../components/ContentRow';
import {CardItem, DetailsAction} from '../../components/types';
import {RootStackScreenProps} from '../../navigation/types';
import {DetailsLayout, primaryImageUri} from './DetailsLayout';

type EpisodeDetailsProps = {
  item: BaseItemDto;
  navigation: RootStackScreenProps<'Details'>['navigation'];
};

const GUEST_STARS = [PersonKind.GuestStar];

/**
 * An episode's details, after androidtv: Resume/Play, the toggles, Previous
 * episode and Go to series, then the next episodes and the guest stars.
 */
export const EpisodeDetails = ({item, navigation}: EpisodeDetailsProps) => {
  const {session} = useSession();
  const api = session?.api as Api;
  const itemId = item.Id ?? '';

  const favorite = useToggleFavorite(itemId);
  const played = useTogglePlayed(itemId);
  const previous = usePreviousEpisode(item);
  const nextEpisodes = useNextEpisodes(item);

  // An episode's Primary is its 16:9 still.
  const posterUri = primaryImageUri(item, api, cardImageSize('landscape'));
  // The episode's own backdrop, else its series'.
  const backdropUri = useMemo(() => backdropUris(item, api)[0], [item, api]);
  const titles = detailsTitles(item);
  const infoRow = useMemo(() => infoRowEntries(item), [item]);
  const infoItems = detailsInfoItems(item, {use24Hour: uses24HourClock()});

  // `navigate`, not `push`: pressing Play twice mustn't stack two players.
  const onPlay = (startMs: number) =>
    navigation.navigate('Player', {itemId, title: item.Name ?? '', startMs});

  const resumeMs = resumePositionMs(item);
  const previousEpisode = previous.isError ? null : previous.data ?? null;
  const seriesId = item.SeriesId;
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
  // Shows up once the lookup finds one, after the buttons have focus; the
  // layout only focuses the first action on open, so it can't steal focus.
  if (previousEpisode?.Id) {
    const previousId = previousEpisode.Id;
    actions.push({
      key: 'previous',
      label: 'Previous episode',
      icon: 'previous',
      onPress: () =>
        navigation.push('Details', {
          itemId: previousId,
          title: previousEpisode.Name ?? '',
        }),
    });
  }
  if (seriesId) {
    actions.push({
      key: 'series',
      label: 'Go to series',
      icon: 'series',
      onPress: () =>
        navigation.push('Details', {
          itemId: seriesId,
          title: item.SeriesName ?? '',
        }),
    });
  }

  const nextCards = useMemo(
    () =>
      nextEpisodes.isError
        ? []
        : (nextEpisodes.data ?? []).map((episode) =>
            toCardItem(episode, api, {variant: 'landscape'}),
          ),
    [nextEpisodes.data, nextEpisodes.isError, api],
  );

  // One person can be listed twice, and the row keys cards by id, so each
  // card gets its position in the id; `guests` keeps the same order.
  const people = item.People;
  const guests = useMemo(
    () =>
      (people ?? []).filter((person) => person.Type === PersonKind.GuestStar),
    [people],
  );
  const guestCards = useMemo(
    () =>
      peopleToCards(item, api, GUEST_STARS).map((card, index) => ({
        ...card,
        id: `${card.id}-${index}`,
      })),
    // People is what the cards come from; other item fields don't matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, api],
  );

  const openEpisode = useCallback(
    (card: CardItem) =>
      navigation.push('Details', {itemId: card.id, title: card.title}),
    [navigation],
  );
  const openGuest = useCallback(
    (card: CardItem) => {
      const person = guests[guestCards.indexOf(card)];
      navigation.push('Details', {
        itemId: person?.Id ?? card.id,
        title: card.title,
      });
    },
    [guests, guestCards, navigation],
  );

  return (
    <DetailsLayout
      testID="details-episode"
      backdropUri={backdropUri}
      header={{
        title: titles.title,
        subtitle: titles.subtitle,
        posterUri,
        posterShape: 'wide',
        placeholderColor: placeholderColor(itemId),
        infoRow,
        genres: item.Genres ?? undefined,
        overview: item.Overview ?? undefined,
        infoItems,
      }}
      actions={actions}>
      <ContentRow
        testID="row-next-episodes"
        title="Next episodes"
        variant="landscape"
        items={nextCards}
        onItemPress={openEpisode}
      />
      <ContentRow
        testID="row-guest-stars"
        title="Guest stars"
        variant="poster"
        items={guestCards}
        onItemPress={openGuest}
      />
    </DetailsLayout>
  );
};

import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {uses24HourClock} from '@amazon-devices/react-native-localize';
import {useQueryClient} from '@tanstack/react-query';
import React, {useCallback, useEffect, useMemo, useRef} from 'react';

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
  seriesShowsResume,
} from '../../api/itemInfo';
import {
  backdropUris,
  cardImageSize,
  placeholderColor,
  toCardItem,
} from '../../api/items';
import {
  fetchSeasonEpisodes,
  fetchSeasons,
  tvDetailsKeys,
  useSeasons,
  useSeriesNextUp,
} from '../../api/tvDetails';
import {useSession} from '../../auth/SessionContext';
import {ContentRow} from '../../components/ContentRow';
import {CardItem, DetailsAction} from '../../components/types';
import {RootStackScreenProps} from '../../navigation/types';
import {DetailsLayout, primaryImageUri} from './DetailsLayout';
import {DetailsLoading, playEpisode, useOpenDetails} from './shared';

type DetailsNavigation = RootStackScreenProps<'Details'>['navigation'];

type SeriesDetailsProps = {
  item: BaseItemDto;
  navigation: DetailsNavigation;
};

/**
 * The series' first episode: the first season that isn't specials (specials
 * only when they're the only season), then its first episode.
 */
const useFirstEpisode = (seriesId: string) => {
  const queryClient = useQueryClient();
  const {session} = useSession();
  const serverId = session?.server.id ?? '';
  const userId = session?.user.Id ?? '';
  const api = session?.api;
  return useCallback(async (): Promise<BaseItemDto | undefined> => {
    if (!api || !seriesId) {
      return undefined;
    }
    const seasons = await queryClient.fetchQuery({
      queryKey: tvDetailsKeys.seasons(serverId, userId, seriesId),
      queryFn: () => fetchSeasons(api, userId, seriesId),
    });
    const season =
      seasons.find((candidate) => candidate.IndexNumber !== 0) ?? seasons[0];
    if (!season?.Id) {
      return undefined;
    }
    const seasonId = season.Id;
    const episodes = await queryClient.fetchQuery({
      queryKey: tvDetailsKeys.seasonEpisodes(
        serverId,
        userId,
        seriesId,
        seasonId,
      ),
      queryFn: () => fetchSeasonEpisodes(api, userId, seriesId, seasonId),
    });
    return episodes[0];
  }, [queryClient, api, serverId, userId, seriesId]);
};

/**
 * A series' details, after androidtv's FullDetailsFragment: Resume / Play of
 * the next-up episode, the toggles, then Next up, Seasons, Cast & crew and
 * More like this.
 */
export const SeriesDetails = ({item, navigation}: SeriesDetailsProps) => {
  const {session} = useSession();
  const api = session?.api as Api;
  const itemId = item.Id ?? '';

  const favorite = useToggleFavorite(itemId);
  const played = useTogglePlayed(itemId);
  const nextUp = useSeriesNextUp(itemId);
  const seasons = useSeasons(itemId);
  const similar = useSimilarItems(itemId);
  const firstEpisode = useFirstEpisode(itemId);

  // The first-episode fetch is async: ignore a second press meanwhile, and
  // don't open the player once the page is gone.
  const fetchingFirst = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const posterUri = primaryImageUri(item, api, cardImageSize('poster'));
  const backdropUri = useMemo(() => backdropUris(item, api)[0], [item, api]);
  const infoRow = useMemo(() => infoRowEntries(item), [item]);
  const infoItems = detailsInfoItems(item, {use24Hour: uses24HourClock()});

  // androidtv's next-up lookup logs its errors and goes on without one.
  const nextUpItems = useMemo(
    () => (nextUp.isError ? [] : nextUp.data ?? []),
    [nextUp.data, nextUp.isError],
  );
  const nextEpisode: BaseItemDto | undefined = nextUpItems[0];

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
  const nextUpCards = useMemo(
    () =>
      nextUpItems.map((episode) =>
        toCardItem(episode, api, {variant: 'landscape'}),
      ),
    [nextUpItems, api],
  );
  const seasonCards = useMemo(
    () =>
      seasons.isError
        ? []
        : (seasons.data ?? []).map((season) =>
            toCardItem(season, api, {variant: 'poster'}),
          ),
    [seasons.data, seasons.isError, api],
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

  const openDetails = useOpenDetails(navigation);
  const openPerson = useCallback(
    (card: CardItem) => {
      const person = people?.[castCards.indexOf(card)];
      navigation.push('Details', {
        itemId: person?.Id ?? card.id,
        title: card.title,
      });
    },
    [castCards, people, navigation],
  );

  // Until next up settles, Resume/Play aren't known: keep the spinner so focus
  // lands on the right first button. `isLoading`, not `isPending`: a disabled
  // query stays pending forever.
  if (nextUp.isLoading) {
    return <DetailsLoading title={item.Name ?? ''} />;
  }

  // With no next-up episode (all watched, or nothing started) Play starts the
  // series from its first episode, fetched on press.
  const playFirstEpisode = async () => {
    if (fetchingFirst.current) {
      return;
    }
    fetchingFirst.current = true;
    try {
      const episode = await firstEpisode();
      if (episode && mounted.current) {
        playEpisode(navigation, episode, 0);
      }
    } catch {
      // Nothing to play; androidtv shows a toast, which we don't have yet.
    } finally {
      fetchingFirst.current = false;
    }
  };

  const actions: DetailsAction[] = [];
  // androidtv shows Resume when the series is started and not finished, and
  // plays the next-up episode from its position (from 0 when it has none).
  if (nextEpisode && seriesShowsResume(item, nextEpisode)) {
    const resumeMs = resumePositionMs(nextEpisode) ?? 0;
    actions.push({
      key: 'resume',
      label: resumeLabel(resumeMs),
      icon: 'resume',
      onPress: () => playEpisode(navigation, nextEpisode, resumeMs),
    });
  }
  actions.push(
    {
      key: 'play',
      label: 'Play',
      icon: 'play',
      onPress: nextEpisode
        ? () => playEpisode(navigation, nextEpisode, 0)
        : playFirstEpisode,
    },
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

  return (
    <DetailsLayout
      testID="details-series"
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
        testID="row-next-up"
        title="Next up"
        variant="landscape"
        items={nextUpCards}
        onItemPress={openDetails}
      />
      <ContentRow
        testID="row-seasons"
        title="Seasons"
        variant="poster"
        items={seasonCards}
        onItemPress={openDetails}
      />
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
        onItemPress={openDetails}
      />
    </DetailsLayout>
  );
};

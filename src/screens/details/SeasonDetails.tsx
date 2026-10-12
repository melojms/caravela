import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {ImageType} from '@jellyfin/sdk/lib/generated-client/models/image-type';
import React, {useMemo} from 'react';

import {useToggleFavorite, useTogglePlayed} from '../../api/details';
import {
  detailsTitles,
  infoRowEntries,
  resumeLabel,
  resumePositionMs,
  seasonPlayTarget,
} from '../../api/itemInfo';
import {
  backdropUris,
  cardImageSize,
  imageUrl,
  placeholderColor,
  toCardItem,
} from '../../api/items';
import {useSeasonEpisodes} from '../../api/tvDetails';
import {useSession} from '../../auth/SessionContext';
import {ContentRow} from '../../components/ContentRow';
import {DetailsAction} from '../../components/types';
import {RootStackScreenProps} from '../../navigation/types';
import {DetailsLayout, primaryImageUri} from './DetailsLayout';
import {DetailsLoading, playEpisode, useOpenDetails} from './shared';

type SeasonDetailsProps = {
  item: BaseItemDto;
  navigation: RootStackScreenProps<'Details'>['navigation'];
};

/** The season's Primary, else its series' poster. */
const seasonPosterUri = (item: BaseItemDto, api: Api): string | undefined => {
  const size = cardImageSize('poster');
  const own = primaryImageUri(item, api, size);
  if (own) {
    return own;
  }
  const {SeriesId: seriesId, SeriesPrimaryImageTag: tag} = item;
  return seriesId && tag
    ? imageUrl(api, {itemId: seriesId, type: ImageType.Primary, tag}, size)
    : undefined;
};

/**
 * A season's details, after androidtv's FullDetailsFragment: Resume / Play of
 * its first unwatched episode, the toggles, then its episodes.
 */
export const SeasonDetails = ({item, navigation}: SeasonDetailsProps) => {
  const {session} = useSession();
  const api = session?.api as Api;
  const itemId = item.Id ?? '';

  const favorite = useToggleFavorite(itemId);
  const played = useTogglePlayed(itemId);
  const episodes = useSeasonEpisodes(item.SeriesId ?? '', itemId);

  const posterUri = seasonPosterUri(item, api);
  // A season without backdrops gets its series' through the parent backdrop.
  const backdropUri = useMemo(() => backdropUris(item, api)[0], [item, api]);
  const infoRow = useMemo(() => infoRowEntries(item), [item]);
  const {title, subtitle} = detailsTitles(item);

  const episodeItems = useMemo(
    () => (episodes.isError ? [] : episodes.data ?? []),
    [episodes.data, episodes.isError],
  );
  const episodeCards = useMemo(
    () =>
      episodeItems.map((episode) =>
        toCardItem(episode, api, {variant: 'landscape'}),
      ),
    [episodeItems, api],
  );
  const openDetails = useOpenDetails(navigation);

  // The episodes decide Resume/Play: keep the spinner until they settle.
  if (episodes.isLoading) {
    return <DetailsLoading title={item.Name ?? ''} />;
  }

  const actions: DetailsAction[] = [];
  const target = seasonPlayTarget(episodeItems);
  if (target) {
    const resumeMs = resumePositionMs(target);
    if (resumeMs !== undefined) {
      actions.push({
        key: 'resume',
        label: resumeLabel(resumeMs),
        icon: 'resume',
        onPress: () => playEpisode(navigation, target, resumeMs),
      });
    }
    actions.push({
      key: 'play',
      label: 'Play',
      icon: 'play',
      onPress: () => playEpisode(navigation, target, 0),
    });
  }
  actions.push(
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
      testID="details-season"
      backdropUri={backdropUri}
      header={{
        title,
        subtitle,
        posterUri,
        placeholderColor: placeholderColor(itemId),
        infoRow,
        overview: item.Overview ?? undefined,
        // "Directed by" makes no sense for a season.
        infoItems: [],
      }}
      actions={actions}>
      <ContentRow
        testID="row-episodes"
        title="Episodes"
        variant="landscape"
        items={episodeCards}
        onItemPress={openDetails}
      />
    </DetailsLayout>
  );
};

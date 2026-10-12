import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import React, {useCallback, useMemo} from 'react';

import {useToggleFavorite} from '../../api/details';
import {infoRowEntries} from '../../api/itemInfo';
import {cardImageSize, placeholderColor, toCardItem} from '../../api/items';
import {PersonItemKind, usePersonItems} from '../../api/tvDetails';
import {useSession} from '../../auth/SessionContext';
import {CardVariant} from '../../components/FocusableCard';
import {ContentRow} from '../../components/ContentRow';
import {CardItem, DetailsAction} from '../../components/types';
import {RootStackScreenProps} from '../../navigation/types';
import {DetailsLayout, primaryImageUri} from './DetailsLayout';

type PersonDetailsProps = {
  item: BaseItemDto;
  navigation: RootStackScreenProps<'Details'>['navigation'];
};

/** One of a person's rows; nothing while it loads, when empty or when it fails. */
const usePersonCards = (
  personId: string,
  kind: PersonItemKind,
  variant: CardVariant,
  api: Api,
): CardItem[] => {
  const query = usePersonItems(personId, kind);
  return useMemo(
    () =>
      query.isError
        ? []
        : (query.data ?? []).map((personItem) =>
            toCardItem(personItem, api, {variant}),
          ),
    [query.data, query.isError, variant, api],
  );
};

/**
 * A person's details, after androidtv: photo, born / died / birthplace and
 * the biography, a Favorite button (androidtv's only one for a person), then
 * their movies, series and episodes.
 */
export const PersonDetails = ({item, navigation}: PersonDetailsProps) => {
  const {session} = useSession();
  const api = session?.api as Api;
  const itemId = item.Id ?? '';

  const favorite = useToggleFavorite(itemId);
  const movies = usePersonCards(itemId, BaseItemKind.Movie, 'poster', api);
  const series = usePersonCards(itemId, BaseItemKind.Series, 'poster', api);
  const episodes = usePersonCards(
    itemId,
    BaseItemKind.Episode,
    'landscape',
    api,
  );

  const posterUri = primaryImageUri(item, api, cardImageSize('poster'));
  const infoRow = useMemo(() => infoRowEntries(item), [item]);

  // Favorite is the first action, so it takes focus on open whatever the rows
  // do, and a person with no items still has something to focus.
  const actions: DetailsAction[] = [
    {
      key: 'favorite',
      label: 'Favorite',
      icon: 'favorite',
      active: item.UserData?.IsFavorite === true,
      disabled: favorite.isPending,
      onPress: favorite.toggle,
    },
  ];

  const openItem = useCallback(
    (card: CardItem) =>
      navigation.push('Details', {itemId: card.id, title: card.title}),
    [navigation],
  );

  return (
    // People have no backdrop.
    <DetailsLayout
      testID="details-person"
      header={{
        title: item.Name ?? '',
        posterUri,
        posterShape: 'poster',
        placeholderColor: placeholderColor(itemId),
        infoRow,
        overview: item.Overview ?? undefined,
        infoItems: [],
      }}
      actions={actions}>
      <ContentRow
        testID="row-person-movies"
        title="Movies"
        variant="poster"
        items={movies}
        onItemPress={openItem}
      />
      <ContentRow
        testID="row-person-series"
        title="TV series"
        variant="poster"
        items={series}
        onItemPress={openItem}
      />
      <ContentRow
        testID="row-person-episodes"
        title="Episodes"
        variant="landscape"
        items={episodes}
        onItemPress={openItem}
      />
    </DetailsLayout>
  );
};

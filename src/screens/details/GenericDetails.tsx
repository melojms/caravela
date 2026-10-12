import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import React, {useMemo} from 'react';

import {useToggleFavorite} from '../../api/details';
import {infoRowEntries} from '../../api/itemInfo';
import {backdropUris, cardImageSize, placeholderColor} from '../../api/items';
import {useSession} from '../../auth/SessionContext';
import {DetailsAction} from '../../components/types';
import {RootStackScreenProps} from '../../navigation/types';
import {DetailsLayout, primaryImageUri} from './DetailsLayout';

type GenericDetailsProps = {
  item: BaseItemDto;
  navigation: RootStackScreenProps<'Details'>['navigation'];
};

/** Any other kind of item: its header and Favorite, with no rows. */
export const GenericDetails = ({item}: GenericDetailsProps) => {
  const {session} = useSession();
  const api = session?.api as Api;
  const itemId = item.Id ?? '';

  const favorite = useToggleFavorite(itemId);

  const posterUri = primaryImageUri(item, api, cardImageSize('poster'));
  const backdropUri = useMemo(() => backdropUris(item, api)[0], [item, api]);
  const infoRow = useMemo(() => infoRowEntries(item), [item]);

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

  return (
    <DetailsLayout
      testID="details-generic"
      backdropUri={backdropUri}
      header={{
        title: item.Name ?? '',
        posterUri,
        placeholderColor: placeholderColor(itemId),
        infoRow,
        genres: item.Genres ?? undefined,
        overview: item.Overview ?? undefined,
        infoItems: [],
      }}
      actions={actions}
    />
  );
};

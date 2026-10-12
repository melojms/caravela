import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import React, {ComponentType} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {useItemDetails} from '../api/details';
import {isUnauthorized} from '../api/home';
import {FocusableButton} from '../components/FocusableButton';
import {RootStackScreenProps} from '../navigation/types';
import {colors, spacing, typography} from '../theme';
import {EpisodeDetails} from './details/EpisodeDetails';
import {GenericDetails} from './details/GenericDetails';
import {MovieDetails} from './details/MovieDetails';
import {PersonDetails} from './details/PersonDetails';
import {SeasonDetails} from './details/SeasonDetails';
import {SeriesDetails} from './details/SeriesDetails';
import {DetailsLoading} from './details/shared';
import {ScreenContainer} from './ScreenContainer';

type DetailsProps = RootStackScreenProps<'Details'>;

type DetailsPage = ComponentType<{
  item: BaseItemDto;
  navigation: DetailsProps['navigation'];
}>;

/** Each item kind's page; anything not listed gets `GenericDetails`. */
const PAGES: Partial<Record<BaseItemKind, DetailsPage>> = {
  [BaseItemKind.Movie]: MovieDetails,
  [BaseItemKind.Video]: MovieDetails,
  [BaseItemKind.MusicVideo]: MovieDetails,
  [BaseItemKind.Trailer]: MovieDetails,
  [BaseItemKind.Series]: SeriesDetails,
  [BaseItemKind.Season]: SeasonDetails,
  [BaseItemKind.Episode]: EpisodeDetails,
  [BaseItemKind.Person]: PersonDetails,
};

/**
 * Item details, after androidtv's FullDetailsFragment: loads the item, then
 * shows the page for its kind.
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
    return <DetailsLoading title={title} />;
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
  const Page = (item.Type && PAGES[item.Type]) || GenericDetails;
  return <Page item={item} navigation={navigation} />;
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
});

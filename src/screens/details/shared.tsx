import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import React, {useCallback} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {CardItem} from '../../components/types';
import {RootStackScreenProps} from '../../navigation/types';
import {colors, spacing, typography} from '../../theme';
import {ScreenContainer} from '../ScreenContainer';

type DetailsNavigation = RootStackScreenProps<'Details'>['navigation'];

/**
 * The spinner with the title that `DetailsScreen` shows while an item loads.
 * Pages keep it up until whatever decides their buttons has settled, so the
 * first button is right when focus lands.
 */
export const DetailsLoading = ({title}: {title: string}) => (
  <ScreenContainer testID="details-loading">
    <View style={styles.center}>
      <Text style={styles.loadingTitle}>{title}</Text>
      <ActivityIndicator size="large" color={colors.cyan} />
    </View>
  </ScreenContainer>
);

/** Opens the episode in the player; `navigate`, so a double press opens one. */
export const playEpisode = (
  navigation: DetailsNavigation,
  episode: BaseItemDto,
  startMs: number,
) =>
  navigation.navigate('Player', {
    itemId: episode.Id ?? '',
    title: episode.Name ?? '',
    startMs,
  });

/** Cards push another Details page (seasons, episodes, similar series, people). */
export const useOpenDetails = (navigation: DetailsNavigation) =>
  useCallback(
    (card: CardItem) =>
      navigation.push('Details', {itemId: card.id, title: card.title}),
    [navigation],
  );

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
});

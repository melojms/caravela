import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {useItemDetails} from '../api/details';
import {isUnauthorized} from '../api/home';
import {FocusableButton} from '../components/FocusableButton';
import {RootStackScreenProps} from '../navigation/types';
import {colors, spacing, typography} from '../theme';
import {DetailsPlaceholder} from './DetailsPlaceholder';
import {MovieDetails} from './details/MovieDetails';
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

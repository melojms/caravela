import React, {useCallback} from 'react';
import {ScrollView, StyleSheet} from 'react-native';

import {ContentRow} from '../components/ContentRow';
import {CardItem} from '../components/types';
import {
  mockContinueWatching,
  mockLatestMovies,
  mockLatestShows,
} from '../dev/mockItems';
import {MenuScreenProps} from '../navigation/types';
import {layout, spacing} from '../theme';
import {ScreenContainer} from './ScreenContainer';

export const HomeScreen = ({navigation}: MenuScreenProps<'Home'>) => {
  const openDetails = useCallback(
    (item: CardItem) =>
      navigation.navigate('DetailsPlaceholder', {
        itemId: item.id,
        title: item.title,
      }),
    [navigation],
  );

  return (
    <ScreenContainer testID="home-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        <ContentRow
          testID="row-continue"
          title="Continue Watching"
          variant="landscape"
          items={mockContinueWatching}
          onItemPress={openDetails}
          hasPreferredFocus
        />
        <ContentRow
          testID="row-latest-movies"
          title="Latest Movies"
          items={mockLatestMovies}
          onItemPress={openDetails}
        />
        <ContentRow
          testID="row-latest-shows"
          title="Latest Shows"
          items={mockLatestShows}
          onItemPress={openDetails}
        />
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingRight: layout.screenPadding,
    paddingBottom: spacing.xxl,
  },
});

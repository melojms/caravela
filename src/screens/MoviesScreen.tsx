import React, {useCallback, useState} from 'react';

import {PosterGrid} from '../components/PosterGrid';
import {CardItem} from '../components/types';
import {MOCK_MOVIES_PAGE_SIZE, mockMoviesPage} from '../dev/mockItems';
import {RootStackScreenProps} from '../navigation/types';
import {ScreenContainer} from './ScreenContainer';

export const MoviesScreen = ({navigation}: RootStackScreenProps<'Movies'>) => {
  const [items, setItems] = useState<CardItem[]>(() => mockMoviesPage(0));

  // Derive the next page from what is loaded, so a repeated onEndReached
  // can't append the same page twice.
  const loadMore = useCallback(() => {
    setItems((current) => {
      const next = mockMoviesPage(current.length / MOCK_MOVIES_PAGE_SIZE);
      return next.length ? [...current, ...next] : current;
    });
  }, []);

  const openDetails = useCallback(
    (item: CardItem) =>
      navigation.navigate('DetailsPlaceholder', {
        itemId: item.id,
        title: item.title,
      }),
    [navigation],
  );

  return (
    <ScreenContainer title="Movies" testID="movies-screen">
      <PosterGrid
        items={items}
        onItemPress={openDetails}
        onEndReached={loadMore}
      />
    </ScreenContainer>
  );
};

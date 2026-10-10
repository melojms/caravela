import React, {memo, ReactElement, useCallback} from 'react';
import {FlatList, ListRenderItemInfo, StyleSheet, View} from 'react-native';

import {focus, layout, spacing} from '../theme';
import {cardOuterHeight, cardSize} from './FocusableCard';
import {renderCard} from './renderCard';
import {CardItem} from './types';

export type PosterGridProps = {
  items: CardItem[];
  numColumns?: number;
  onItemPress?: (item: CardItem) => void;
  /** Called when focus/scroll gets near the end, to load the next page. */
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  ListHeaderComponent?: ReactElement;
  focusFirstItem?: boolean;
  testID?: string;
};

const ROW_HEIGHT =
  cardOuterHeight('poster') +
  layout.cardGap +
  cardSize('poster').height * (focus.scale - 1);

const keyExtractor = (item: CardItem) => item.id;

/**
 * Vertical poster grid. FlatList virtualizes rows (only a few screens of
 * cards are mounted) and fixed row heights let it skip measuring. The Vega
 * Carousel is single-axis, so it doesn't fit a multi-column grid.
 */
export const PosterGrid = memo(
  ({
    items,
    numColumns = 6,
    onItemPress,
    onEndReached,
    onEndReachedThreshold = 1,
    ListHeaderComponent,
    focusFirstItem = false,
    testID = 'poster-grid',
  }: PosterGridProps) => {
    const renderItem = useCallback(
      ({item, index}: ListRenderItemInfo<CardItem>) => (
        <View style={styles.cell}>
          {renderCard({
            item,
            variant: 'poster',
            onPress: onItemPress,
            hasTVPreferredFocus: focusFirstItem && index === 0,
            testID: `${testID}-item-${index}`,
          })}
        </View>
      ),
      [onItemPress, focusFirstItem, testID],
    );

    const getItemLayout = useCallback(
      (_: ArrayLike<CardItem> | null | undefined, index: number) => {
        const row = Math.floor(index / numColumns);
        return {length: ROW_HEIGHT, offset: ROW_HEIGHT * row, index};
      },
      [numColumns],
    );

    return (
      <FlatList
        testID={testID}
        data={items}
        key={numColumns}
        numColumns={numColumns}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold}
        ListHeaderComponent={ListHeaderComponent}
        initialNumToRender={numColumns * 3}
        maxToRenderPerBatch={numColumns * 2}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      />
    );
  },
);

const styles = StyleSheet.create({
  content: {
    paddingVertical: spacing.md,
  },
  cell: {
    height: ROW_HEIGHT,
    marginRight: layout.cardGap,
    justifyContent: 'center',
  },
});

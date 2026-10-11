import React, {memo, ReactElement, useCallback, useRef} from 'react';
import {
  FlatList,
  LayoutChangeEvent,
  ListRenderItemInfo,
  StyleSheet,
  View,
} from 'react-native';

import {focus, layout, spacing} from '../theme';
import {cardOuterHeight, cardSize} from './FocusableCard';
import {renderCard} from './renderCard';
import {CardItem} from './types';

export type PosterGridProps = {
  items: CardItem[];
  numColumns?: number;
  onItemPress?: (item: CardItem) => void;
  /**
   * A card got focus: its item, grid index and native tag (focus it again
   * later with FocusManager).
   */
  onItemFocus?: (item: CardItem, index: number, tag?: number) => void;
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

// The focused frame grows by (scale - 1) / 2 on each side. The list clips its
// content, so the first column needs that much room on the left.
const SIDE_INSET = Math.ceil(
  (cardSize('poster').width * (focus.scale - 1)) / 2 + focus.borderWidth,
);
const TOP_INSET = spacing.md;

const keyExtractor = (item: CardItem) => item.id;

// With numColumns, VirtualizedList lays out rows, so `index` is a row index.
export const getRowLayout = (
  _: ArrayLike<CardItem> | null | undefined,
  index: number,
) => ({length: ROW_HEIGHT, offset: TOP_INSET + ROW_HEIGHT * index, index});

/**
 * The scroll offset that shows `row` with whole rows only at the top.
 * `top` is the row currently at the top; rows above the list's content
 * (`headerHeight`, the top padding) only show when the top row is 0.
 */
export const gridTopRow = (
  row: number,
  top: number,
  viewportHeight: number,
  headerHeight: number,
) => {
  if (row < top) {
    return row;
  }
  const rowsOffset = TOP_INSET + headerHeight;
  const offsetOf = (r: number) => (r === 0 ? 0 : rowsOffset + r * ROW_HEIGHT);
  const rowBottom = rowsOffset + (row + 1) * ROW_HEIGHT;
  let next = top;
  while (next < row && rowBottom > offsetOf(next) + viewportHeight) {
    next++;
  }
  return next;
};

export const gridRowOffset = (row: number, headerHeight: number) =>
  row === 0 ? 0 : TOP_INSET + headerHeight + row * ROW_HEIGHT;

/**
 * Vertical poster grid. FlatList virtualizes rows (only a few screens of
 * cards are mounted) and fixed row heights let it skip measuring. The Vega
 * Carousel is single-axis, so it doesn't fit a multi-column grid.
 *
 * Focus drives the scrolling: the list only ever stops on a row boundary, so
 * no half-scrolled row (its titles and years) shows above the first full
 * one, the way androidtv's leanback grid keeps whole rows in view.
 */
export const PosterGrid = memo(
  ({
    items,
    numColumns = 6,
    onItemPress,
    onItemFocus,
    onEndReached,
    onEndReachedThreshold = 1,
    ListHeaderComponent,
    focusFirstItem = false,
    testID = 'poster-grid',
  }: PosterGridProps) => {
    const listRef = useRef<FlatList<CardItem>>(null);
    const topRow = useRef(0);
    const viewportHeight = useRef(0);
    const headerHeight = useRef(0);

    const handleLayout = useCallback((event: LayoutChangeEvent) => {
      viewportHeight.current = event.nativeEvent.layout.height;
    }, []);
    const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
      headerHeight.current = event.nativeEvent.layout.height;
    }, []);

    const handleFocus = useCallback(
      (item: CardItem, index: number, tag?: number) => {
        onItemFocus?.(item, index, tag);
        if (viewportHeight.current <= 0) {
          return;
        }
        const row = Math.floor(index / numColumns);
        const next = gridTopRow(
          row,
          topRow.current,
          viewportHeight.current,
          headerHeight.current,
        );
        if (next !== topRow.current) {
          topRow.current = next;
          listRef.current?.scrollToOffset({
            offset: gridRowOffset(next, headerHeight.current),
            animated: true,
          });
        }
      },
      [numColumns, onItemFocus],
    );

    const renderItem = useCallback(
      ({item, index}: ListRenderItemInfo<CardItem>) => (
        <View style={styles.cell}>
          {renderCard({
            item,
            variant: 'poster',
            onPress: onItemPress,
            onFocus: (focusedItem, tag) => handleFocus(focusedItem, index, tag),
            hasTVPreferredFocus: focusFirstItem && index === 0,
            testID: `${testID}-item-${index}`,
          })}
        </View>
      ),
      [onItemPress, handleFocus, focusFirstItem, testID],
    );

    return (
      <FlatList
        ref={listRef}
        testID={testID}
        data={items}
        key={numColumns}
        numColumns={numColumns}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getRowLayout}
        onLayout={handleLayout}
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold}
        ListHeaderComponent={
          ListHeaderComponent ? (
            <View onLayout={handleHeaderLayout}>{ListHeaderComponent}</View>
          ) : undefined
        }
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
  // A row of room below the last one: the offset that puts a whole row on
  // top can be up to a row past the content's end, and a clamped scroll
  // would cut the top row.
  content: {
    paddingTop: TOP_INSET,
    paddingBottom: ROW_HEIGHT,
    paddingLeft: SIDE_INSET,
  },
  cell: {
    height: ROW_HEIGHT,
    marginRight: layout.cardGap,
    justifyContent: 'center',
  },
});

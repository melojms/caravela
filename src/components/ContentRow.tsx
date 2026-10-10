import {Carousel, CarouselRenderInfo} from '@amazon-devices/vega-carousel';
import React, {memo, useCallback, useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {colors, focus, layout, spacing, typography} from '../theme';
import {CardVariant, cardOuterHeight, cardSize} from './FocusableCard';
import {renderCard} from './renderCard';
import {CardItem} from './types';

// The card draws its own focus ring and scale, so the carousel doesn't scale.
const ITEM_STYLE = {
  itemPadding: layout.cardGap,
  selectedItemScaleFactor: 1,
  pressedItemScaleFactor: 0.95,
};

export type ContentRowProps = {
  title: string;
  items: CardItem[];
  variant?: CardVariant;
  onItemPress?: (item: CardItem) => void;
  hasPreferredFocus?: boolean;
  testID?: string;
};

/**
 * A titled horizontal row backed by the Vega Carousel, which recycles item
 * views natively and is the documented choice for TV browse rows.
 */
export const ContentRow = memo(
  ({
    title,
    items,
    variant = 'poster',
    onItemPress,
    hasPreferredFocus = false,
    testID = 'content-row',
  }: ContentRowProps) => {
    const getItem = useCallback(
      (index: number) =>
        index >= 0 && index < items.length ? items[index] : undefined,
      [items],
    );
    const getItemCount = useCallback(() => items.length, [items]);
    const getItemKey = useCallback(
      (info: CarouselRenderInfo<CardItem>) => info.item.id,
      [],
    );
    const notifyDataError = useCallback(() => false, []);
    const dataAdapter = useMemo(
      () => ({getItem, getItemCount, getItemKey, notifyDataError}),
      [getItem, getItemCount, getItemKey, notifyDataError],
    );

    const renderItem = useCallback(
      ({item, index}: CarouselRenderInfo<CardItem>) =>
        renderCard({
          item,
          variant,
          onPress: onItemPress,
          testID: `${testID}-item-${index}`,
        }),
      [variant, onItemPress, testID],
    );

    // Leave room for the focus scale so the ring isn't clipped.
    const focusBleed = cardSize(variant).height * (focus.scale - 1);
    const containerStyle = useMemo(
      () => ({height: cardOuterHeight(variant) + focusBleed * 2}),
      [variant, focusBleed],
    );

    if (items.length === 0) {
      return null;
    }

    return (
      <View style={styles.row} testID={testID}>
        <Text style={styles.title}>{title}</Text>
        <Carousel
          testID={`${testID}-carousel`}
          uniqueId={testID}
          orientation="horizontal"
          dataAdapter={dataAdapter}
          renderItem={renderItem}
          hasPreferredFocus={hasPreferredFocus}
          selectionStrategy="natural"
          renderedItemsCount={10}
          numOffsetItems={2}
          navigableScrollAreaMargin={focusBleed}
          containerStyle={[styles.carousel, containerStyle]}
          itemStyle={ITEM_STYLE}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  row: {
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  carousel: {
    width: '100%',
    justifyContent: 'center',
  },
});

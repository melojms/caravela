import {
  type HWEvent,
  TVFocusGuideView,
  useTVEventHandler,
} from '@amazon-devices/react-native-kepler';
import {Carousel, CarouselRenderInfo} from '@amazon-devices/vega-carousel';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {BackHandler, StyleSheet, Text, View} from 'react-native';

import {formatMillis} from '../api/itemInfo';
import type {Chapter} from '../playback/types';
import {colors, focus, layout, spacing, typography} from '../theme';
import {cardOuterHeight, cardSize, FocusableCard} from './FocusableCard';

export type ChapterRowProps = {
  chapters: Chapter[];
  /** The chapter playing now; it gets focus when the row opens. */
  currentIndex: number;
  /** A card was pressed; seeking and closing are up to the caller. */
  onSelect: (chapter: Chapter) => void;
  /** Back, Up or Down was pressed. Back never reaches the screen behind. */
  onClose: () => void;
  testID?: string;
};

/** `eventKeyAction` for a key press (1 is the release). */
const KEY_DOWN = 0;

const VARIANT = 'landscape';

// The card draws its own focus ring and scale, so the carousel doesn't scale.
const ITEM_STYLE = {
  itemPadding: layout.cardGap,
  selectedItemScaleFactor: 1,
  pressedItemScaleFactor: 0.95,
};

// Room for the focus scale so the ring isn't clipped.
const FOCUS_BLEED = cardSize(VARIANT).height * (focus.scale - 1);

/**
 * androidtv's chapter popup: a "Chapters" header over a row of 16:9 chapter
 * cards (image, name, start time) at the bottom of the player. Focus starts
 * on the current chapter and stays in the row; Back, Up and Down close it.
 */
export const ChapterRow = (props: ChapterRowProps) =>
  props.chapters.length > 0 ? <ChapterRowPopup {...props} /> : null;

const ChapterRowPopup = ({
  chapters,
  currentIndex,
  onSelect,
  onClose,
  testID = 'chapter-row',
}: ChapterRowProps) => {
  // Registered once on mount, so it's the newest listener and Vega's
  // BackHandler (newest first) asks it before React Navigation's.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onCloseRef.current();
        return true;
      },
    );
    return () => subscription.remove();
  }, []);

  // androidtv closes the popup on Up/Down instead of moving focus out of it.
  const onKey = useCallback((event: HWEvent) => {
    if (
      event.eventKeyAction === KEY_DOWN &&
      (event.eventType === 'up' || event.eventType === 'down')
    ) {
      onCloseRef.current();
    }
  }, []);
  useTVEventHandler(onKey);

  // Read once: focus shouldn't jump if the current chapter changes while the
  // row is open.
  const [startIndex] = useState(() =>
    clampIndex(currentIndex, chapters.length),
  );

  const getItem = useCallback(
    (index: number) =>
      index >= 0 && index < chapters.length ? chapters[index] : undefined,
    [chapters],
  );
  const getItemCount = useCallback(() => chapters.length, [chapters]);
  const getItemKey = useCallback(
    (info: CarouselRenderInfo<Chapter>) => String(info.item.index),
    [],
  );
  const notifyDataError = useCallback(() => false, []);
  const dataAdapter = useMemo(
    () => ({getItem, getItemCount, getItemKey, notifyDataError}),
    [getItem, getItemCount, getItemKey, notifyDataError],
  );

  const renderItem = useCallback(
    ({item, index}: CarouselRenderInfo<Chapter>) => (
      <FocusableCard
        testID={`${testID}-item-${index}`}
        title={item.name}
        subtitle={formatMillis(item.startMs)}
        imageUri={item.imageUrl}
        variant={VARIANT}
        onPress={() => onSelect(item)}
      />
    ),
    [onSelect, testID],
  );

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.scrim}>
        <Text style={styles.title}>Chapters</Text>
        <TVFocusGuideView
          testID={testID}
          trapFocusUp
          trapFocusDown
          trapFocusLeft
          trapFocusRight>
          <Carousel
            testID={`${testID}-carousel`}
            uniqueId={testID}
            orientation="horizontal"
            dataAdapter={dataAdapter}
            renderItem={renderItem}
            hasPreferredFocus
            initialStartIndex={startIndex}
            trapSelectionOnOrientation
            selectionStrategy="natural"
            renderedItemsCount={10}
            numOffsetItems={2}
            navigableScrollAreaMargin={FOCUS_BLEED}
            containerStyle={styles.carousel}
            itemStyle={ITEM_STYLE}
          />
        </TVFocusGuideView>
      </View>
    </View>
  );
};

/** `index` within `0..count-1`; anything else (NaN too) goes to the nearest end. */
const clampIndex = (index: number, count: number) =>
  Number.isFinite(index)
    ? Math.min(Math.max(Math.trunc(index), 0), count - 1)
    : index > 0
      ? count - 1
      : 0;

const styles = StyleSheet.create({
  // Fills the player; the row sits along the bottom, over the controls.
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  scrim: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: layout.screenPadding,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  title: {
    ...typography.heading,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  carousel: {
    width: '100%',
    height: cardOuterHeight(VARIANT) + FOCUS_BLEED * 2,
    justifyContent: 'center',
  },
});

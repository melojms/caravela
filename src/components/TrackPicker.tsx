import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {Path, Svg} from '@amazon-devices/react-native-svg';
import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {MediaTrack} from '../playback/types';
import {colors, focus, layout, px, radius, spacing, typography} from '../theme';

/** The index the Off entry calls back with (subtitles off). */
export const TRACK_OFF_INDEX = -1;

export type TrackPickerProps = {
  title: string;
  tracks: MediaTrack[];
  /** The track playing now; `TRACK_OFF_INDEX` checks the Off entry. */
  selectedIndex?: number;
  /** Adds a first entry with `TRACK_OFF_INDEX`, labelled with this text. */
  offLabel?: string;
  /** A row was pressed, the selected one included; closing is up to the caller. */
  onSelect: (index: number) => void;
  /** Back was pressed. The picker swallows it, so the screen behind never sees it. */
  onClose: () => void;
  testID?: string;
};

type Row = {index: number; label: string};

const CHECK_PATH = 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
const CHECK_SIZE = px(32);

/**
 * androidtv's audio / subtitle popup: a compact panel over the video with one
 * row per track and a check on the current one. Focus stays inside, starting
 * on the checked row, and Back closes it.
 */
export const TrackPicker = ({
  title,
  tracks,
  selectedIndex,
  offLabel,
  onSelect,
  onClose,
  testID = 'track-picker',
}: TrackPickerProps) => {
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

  const rows: Row[] = tracks.map(({index, label}) => ({index, label}));
  if (offLabel !== undefined) {
    rows.unshift({index: TRACK_OFF_INDEX, label: offLabel});
  }
  // Read once: the initial focus shouldn't move if the selection changes
  // while the picker is open.
  const [focusIndex] = useState(() =>
    rows.some((row) => row.index === selectedIndex)
      ? selectedIndex
      : rows[0]?.index,
  );

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <TVFocusGuideView
        testID={testID}
        style={styles.panel}
        trapFocusUp
        trapFocusDown
        trapFocusLeft
        trapFocusRight>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}>
          {rows.length > 0 ? (
            rows.map((row) => (
              <TrackRow
                key={row.index}
                testID={`${testID}-row-${row.index}`}
                index={row.index}
                label={row.label}
                selected={row.index === selectedIndex}
                hasTVPreferredFocus={row.index === focusIndex}
                onSelect={onSelect}
              />
            ))
          ) : (
            // Something focusable, so focus doesn't stay on the screen behind.
            <TrackRow
              testID={`${testID}-empty`}
              index={TRACK_OFF_INDEX}
              label="No tracks available"
              selected={false}
              hasTVPreferredFocus
              onSelect={onClose}
            />
          )}
        </ScrollView>
      </TVFocusGuideView>
    </View>
  );
};

type TrackRowProps = {
  index: number;
  label: string;
  selected: boolean;
  hasTVPreferredFocus: boolean;
  onSelect: (index: number) => void;
  testID: string;
};

/** A FocusableButton-style row with room for a check on the right. */
const TrackRow = memo(
  ({
    index,
    label,
    selected,
    hasTVPreferredFocus,
    onSelect,
    testID,
  }: TrackRowProps) => {
    const [focused, setFocused] = useState(false);
    const handleFocus = useCallback(() => setFocused(true), []);
    const handleBlur = useCallback(() => setFocused(false), []);
    const handlePress = useCallback(() => onSelect(index), [index, onSelect]);
    const highlighted = focused || selected;

    return (
      <Pressable
        testID={testID}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{checked: selected}}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={handlePress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.row,
          selected && !focused && styles.rowActive,
          focused && styles.rowFocused,
        ]}>
        <Text
          style={[styles.label, highlighted && styles.labelHighlight]}
          numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.check}>
          {selected ? (
            <Svg
              testID={`${testID}-check`}
              width={CHECK_SIZE}
              height={CHECK_SIZE}
              viewBox="0 0 24 24">
              <Path d={CHECK_PATH} fill={colors.text} />
            </Svg>
          ) : null}
        </View>
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  // Fills the player; the panel sits bottom right, like androidtv's popup
  // anchored to the overlay buttons.
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: layout.screenPadding,
  },
  panel: {
    width: px(640),
    maxHeight: '75%',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.menu,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: {
    flexGrow: 0,
  },
  // Side and vertical room for the focus scale, so the ring isn't clipped.
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  row: {
    minHeight: px(72),
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: radius.md,
    // Always drawn, like FocusableButton, so the outline doesn't shift rows.
    borderWidth: focus.borderWidth,
    borderColor: colors.transparent,
    backgroundColor: colors.surface,
  },
  rowActive: {
    borderColor: colors.violet,
    backgroundColor: colors.surfaceRaised,
  },
  rowFocused: {
    borderColor: colors.focus,
    backgroundColor: colors.violet,
    transform: [{scale: focus.scale}],
  },
  label: {
    ...typography.label,
    flex: 1,
    color: colors.textMuted,
  },
  labelHighlight: {
    color: colors.text,
  },
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    marginLeft: spacing.sm,
  },
});

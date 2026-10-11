import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {Path, Svg} from '@amazon-devices/react-native-svg';
import React, {memo, useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import type {LibraryFilters} from '../api/libraryTypes';
import {colors, focus, layout, px, radius, spacing, typography} from '../theme';

export type LibraryHeaderProps = {
  /** The library's name, e.g. "Movies". */
  title: string;
  /** androidtv's status line, e.g. "Showing all items from 'Movies' sorted by Name". */
  statusText: string;
  /** Name of the focused grid item; the line stays empty without one. */
  focusedName?: string;
  /** 0-based grid index of the focused item; the counter shows it 1-based. */
  focusedIndex?: number;
  /** Total items in the library with the current filters. */
  total?: number;
  filters: LibraryFilters;
  /** The jump letter in use, if any; the Letter button shows it as on. */
  letter?: string;
  showLetterButton: boolean;
  onSortPress: () => void;
  onToggleUnwatched: () => void;
  onToggleFavorites: () => void;
  onLetterPress: () => void;
  testID?: string;
};

type ToolIcon = 'sort' | 'unwatched' | 'favorites' | 'letter';

// Vector paths ported from androidtv's res/drawable (24x24 viewport).
const TOOL_PATHS: Record<ToolIcon, string> = {
  // ic_sort
  sort: 'M14.94,4.66h-4.72l2.36,-2.36zM10.25,19.37h4.66l-2.33,2.33zM6.1,6.27L1.6,17.73h1.84l0.92,-2.45h5.11l0.92,2.45h1.84L7.74,6.27L6.1,6.27zM4.97,13.64l1.94,-5.18 1.94,5.18L4.97,13.64zM15.73,16.14h6.12v1.59h-8.53v-1.29l5.92,-8.56h-5.88v-1.6h8.3v1.26l-5.93,8.6z',
  // ic_unwatch
  unwatched:
    'M2.7793,1.5L1.5,2.7695L4.4492,5.7207C3.1692,7.4007 2.3906,9.4895 2.3906,11.7695C2.3906,17.2695 6.8906,21.7695 12.3906,21.7695C14.6706,21.7695 16.7595,21.0009 18.4395,19.7109L21.2305,22.5L22.5,21.2305L2.7793,1.5zM12.3906,1.7695C10.4506,1.7695 8.6394,2.3295 7.1094,3.2695L8.5605,4.7402C9.7005,4.1202 11.0006,3.7695 12.3906,3.7695C16.8106,3.7695 20.3906,7.3495 20.3906,11.7695C20.3906,13.1595 20.0399,14.4596 19.4199,15.5996L20.8906,17.0508C21.8306,15.5208 22.3906,13.7095 22.3906,11.7695C22.3906,6.2695 17.8906,1.7695 12.3906,1.7695zM5.8906,7.1504L11.5742,12.834L9.6094,14.6836L6.6016,11.8574L5.5645,12.834L9.6094,16.6445L12.584,13.8438L17.0098,18.2695C15.7098,19.2195 14.1206,19.7695 12.3906,19.7695C7.9706,19.7695 4.3906,16.1895 4.3906,11.7695C4.3906,10.0395 4.9506,8.4504 5.8906,7.1504zM17.3984,7.3555L14.1914,10.3711L15.1992,11.3789L18.4355,8.332L17.3984,7.3555z',
  // ic_heart
  favorites:
    'm12,19.34 l-1.16,-1.056c-4.12,-3.736 -6.84,-6.2 -6.84,-9.224 0,-2.464 1.936,-4.4 4.4,-4.4 1.392,0 2.728,0.648 3.6,1.672 0.872,-1.024 2.208,-1.672 3.6,-1.672 2.464,0 4.4,1.936 4.4,4.4 0,3.024 -2.72,5.488 -6.84,9.232z',
  // ic_jump_letter
  letter:
    'M13.5176,3.1514L13.5176,5.3311C8.2065,5.8759 5.9306,8.5991 5.1719,11.3232 7.0687,9.4164 9.724,8.5459 13.5176,8.5459L13.5176,10.7783L18.8281,6.9658ZM10,10.8486v8a2,2 0,0 0,2 2h2a2,2 0,0 0,2 -2v-2a2,2 0,0 0,-2 -2h-2v-4zM3.9512,14.8486A2,2 0,0 0,2 16.8486v2a2,2 0,0 0,2 2h4v-4a2,2 0,0 0,-2 -2L4,14.8486a2,2 0,0 0,-0.0488 0zM19.9512,14.8486a2,2 0,0 0,-1.9512 2v2a2,2 0,0 0,2 2h2v-2h-2v-2h2v-2h-2a2,2 0,0 0,-0.0488 0zM4,16.8486h2v2L4,18.8486ZM12,16.8486h2v2h-2z',
};

// androidtv's toolbar icons are 26 dp; ours match the details buttons' look,
// a little smaller so the header stays compact.
const ICON_SIZE = px(40);
const ICON_PADDING = px(16);
const ROUND_SIZE = ICON_SIZE + 2 * ICON_PADDING + 2 * focus.borderWidth;

type ToolButtonProps = {
  icon: ToolIcon;
  label: string;
  active?: boolean;
  onPress: () => void;
  testID: string;
};

/**
 * A round icon button with the details action buttons' states (active:
 * violet outline and icon; focused: focus ring, violet fill, scale).
 */
const ToolButton = memo(
  ({icon, label, active = false, onPress, testID}: ToolButtonProps) => {
    const [focused, setFocused] = useState(false);
    const handleFocus = useCallback(() => setFocused(true), []);
    const handleBlur = useCallback(() => setFocused(false), []);

    const iconColor = focused
      ? colors.text
      : active
      ? colors.violetLight
      : colors.textMuted;

    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{selected: active}}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.button,
          active && !focused && styles.active,
          focused && styles.focused,
        ]}>
        <Svg
          testID={`${testID}-icon`}
          width={ICON_SIZE}
          height={ICON_SIZE}
          viewBox="0 0 24 24">
          <Path d={TOOL_PATHS[icon]} fill={iconColor} />
        </Svg>
      </Pressable>
    );
  },
);

/**
 * The library grid's header, after androidtv's horizontal_grid_browse: the
 * library name, the focused item's name and the status line on the left; the
 * "position | total" counter and the toolbar (Sort, Unwatched, Favorites,
 * Letter) on the right. The toolbar remembers its last focused button, so Up
 * from the grid goes back to it.
 */
export const LibraryHeader = memo(
  ({
    title,
    statusText,
    focusedName,
    focusedIndex,
    total,
    filters,
    letter,
    showLetterButton,
    onSortPress,
    onToggleUnwatched,
    onToggleFavorites,
    onLetterPress,
    testID = 'library-header',
  }: LibraryHeaderProps) => {
    const showCounter =
      focusedIndex !== undefined && focusedIndex >= 0 && total !== undefined;

    return (
      <View testID={testID} style={styles.header}>
        <View style={styles.info}>
          <Text
            testID={`${testID}-title`}
            style={styles.title}
            numberOfLines={1}>
            {title}
          </Text>
          {/* Always laid out, so the status line doesn't jump when focus
              enters or leaves the grid. */}
          <Text
            testID={`${testID}-focused-name`}
            style={styles.focusedName}
            numberOfLines={1}>
            {focusedName ?? ''}
          </Text>
          <Text
            testID={`${testID}-status`}
            style={styles.status}
            numberOfLines={1}>
            {statusText}
          </Text>
        </View>
        <View style={styles.side}>
          <Text testID={`${testID}-counter`} style={styles.counter}>
            {showCounter ? `${focusedIndex + 1} | ${total}` : ''}
          </Text>
          <TVFocusGuideView
            testID={`${testID}-toolbar`}
            style={styles.toolbar}
            autoFocus>
            <ToolButton
              icon="sort"
              label="Sort by"
              onPress={onSortPress}
              testID={`${testID}-sort`}
            />
            <ToolButton
              icon="unwatched"
              label="Unwatched"
              active={filters.unwatchedOnly}
              onPress={onToggleUnwatched}
              testID={`${testID}-unwatched`}
            />
            <ToolButton
              icon="favorites"
              label="Favorites"
              active={filters.favoritesOnly}
              onPress={onToggleFavorites}
              testID={`${testID}-favorites`}
            />
            {showLetterButton ? (
              <ToolButton
                icon="letter"
                label="By letter"
                active={!!letter}
                onPress={onLetterPress}
                testID={`${testID}-letter`}
              />
            ) : null}
          </TVFocusGuideView>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  info: {
    flex: 1,
    marginRight: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  focusedName: {
    ...typography.heading,
    minHeight: typography.heading.lineHeight,
    color: colors.text,
    marginTop: spacing.xxs,
  },
  status: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  side: {
    alignItems: 'flex-end',
  },
  counter: {
    ...typography.body,
    minHeight: typography.body.lineHeight,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  // The gap leaves room for the focus scale, so neighbours don't overlap.
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    width: ROUND_SIZE,
    height: ROUND_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    // Always drawn (transparent at rest), so the active outline and the focus
    // ring don't resize or shift the button.
    borderWidth: focus.borderWidth,
    borderColor: colors.transparent,
    backgroundColor: colors.surface,
  },
  active: {
    borderColor: colors.violet,
    backgroundColor: colors.surfaceRaised,
  },
  focused: {
    borderColor: colors.focus,
    backgroundColor: colors.violet,
    transform: [{scale: focus.scale}],
  },
});

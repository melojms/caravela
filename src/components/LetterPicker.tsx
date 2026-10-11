import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, Pressable, StyleSheet, Text, View} from 'react-native';

import {LIBRARY_LETTERS} from '../api/libraryTypes';
import {colors, focus, layout, px, radius, spacing, typography} from '../theme';

export type LetterPickerProps = {
  /** The jump letter in use; marked, and where focus starts (else `#`). */
  selected?: string;
  /** A letter was pressed, the selected one included; closing is up to the caller. */
  onSelect: (letter: string) => void;
  /** Back was pressed. The picker swallows it, so the screen behind never sees it. */
  onClose: () => void;
  testID?: string;
};

/**
 * androidtv's jump list (BrowseGridFragment's JumplistPopup with an
 * AlphaPickerView): one strip of `#` and A–Z across the top of the screen,
 * over the grid. Focus stays inside, starting on the selected letter, and
 * Back closes it.
 */
export const LetterPicker = ({
  selected,
  onSelect,
  onClose,
  testID = 'letter-picker',
}: LetterPickerProps) => {
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

  // Read once: the initial focus shouldn't move if the selection changes
  // while the picker is open.
  const [focusLetter] = useState(() =>
    selected !== undefined && LIBRARY_LETTERS.includes(selected)
      ? selected
      : LIBRARY_LETTERS[0],
  );

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <TVFocusGuideView
        testID={testID}
        style={styles.strip}
        trapFocusUp
        trapFocusDown
        trapFocusLeft
        trapFocusRight>
        {LIBRARY_LETTERS.map((letter) => (
          <LetterButton
            key={letter}
            testID={`${testID}-${letter}`}
            letter={letter}
            selected={letter === selected}
            hasTVPreferredFocus={letter === focusLetter}
            onSelect={onSelect}
          />
        ))}
      </TVFocusGuideView>
    </View>
  );
};

type LetterButtonProps = {
  letter: string;
  selected: boolean;
  hasTVPreferredFocus: boolean;
  onSelect: (letter: string) => void;
  testID: string;
};

/** A small FocusableButton-style key (active: violet outline). */
const LetterButton = memo(
  ({
    letter,
    selected,
    hasTVPreferredFocus,
    onSelect,
    testID,
  }: LetterButtonProps) => {
    const [focused, setFocused] = useState(false);
    const handleFocus = useCallback(() => setFocused(true), []);
    const handleBlur = useCallback(() => setFocused(false), []);
    const handlePress = useCallback(() => onSelect(letter), [letter, onSelect]);

    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={letter}
        accessibilityState={{selected}}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={handlePress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.key,
          selected && !focused && styles.keyActive,
          focused && styles.keyFocused,
        ]}>
        <Text
          style={[
            styles.label,
            (focused || selected) && styles.labelHighlight,
          ]}>
          {letter}
        </Text>
      </Pressable>
    );
  },
);

// 27 keys fit the 1920 px design width with room for the focus scale.
const KEY_WIDTH = px(56);
const KEY_HEIGHT = px(68);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingHorizontal: layout.screenPadding,
  },
  strip: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.menu,
  },
  key: {
    width: KEY_WIDTH,
    height: KEY_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    // Always drawn, like FocusableButton, so the outline doesn't shift keys.
    borderWidth: focus.borderWidth,
    borderColor: colors.transparent,
    backgroundColor: colors.transparent,
  },
  keyActive: {
    borderColor: colors.violet,
    backgroundColor: colors.surfaceRaised,
  },
  keyFocused: {
    borderColor: colors.focus,
    backgroundColor: colors.violet,
    transform: [{scale: focus.scale}],
  },
  label: {
    ...typography.label,
    color: colors.textMuted,
  },
  labelHighlight: {
    color: colors.text,
  },
});

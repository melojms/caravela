import React, {memo, useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';

import {colors, focus, px, radius, spacing, typography} from '../theme';

export type FocusableButtonProps = {
  label: string;
  onPress?: () => void;
  onFocus?: () => void;
  /** Highlights the button as the current selection (e.g. the active menu entry). */
  active?: boolean;
  hasTVPreferredFocus?: boolean;
  testID?: string;
};

export const FocusableButton = memo(
  ({
    label,
    onPress,
    onFocus,
    active = false,
    hasTVPreferredFocus,
    testID,
  }: FocusableButtonProps) => {
    const [focused, setFocused] = useState(false);

    const handleFocus = useCallback(() => {
      setFocused(true);
      onFocus?.();
    }, [onFocus]);
    const handleBlur = useCallback(() => setFocused(false), []);

    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{selected: active}}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.button,
          active && styles.active,
          focused && styles.focused,
        ]}>
        <Text
          style={[styles.label, (focused || active) && styles.labelHighlight]}
          numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  button: {
    minHeight: px(72),
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: focus.borderWidth,
    borderColor: colors.transparent,
    backgroundColor: colors.surface,
  },
  active: {
    backgroundColor: colors.surfaceRaised,
  },
  focused: {
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

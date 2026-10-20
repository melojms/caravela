import React, {forwardRef, memo, useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, focus, px, radius, spacing, typography} from '../theme';

export type FocusableButtonProps = {
  label: string;
  onPress?: () => void;
  onFocus?: () => void;
  /** Highlights the button as the current selection (e.g. the active menu entry). */
  active?: boolean;
  hasTVPreferredFocus?: boolean;
  /**
   * Ignores presses and dims the button. It stays focusable, so focus doesn't
   * jump away from a button that turns disabled while it's focused.
   */
  disabled?: boolean;
  testID?: string;
};

/** The ref reaches the Pressable, e.g. to point focus at it (nextFocusDown). */
export const FocusableButton = memo(
  forwardRef<View, FocusableButtonProps>(function FocusableButton(
    {
      label,
      onPress,
      onFocus,
      active = false,
      hasTVPreferredFocus,
      disabled = false,
      testID,
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);

    const handleFocus = useCallback(() => {
      setFocused(true);
      onFocus?.();
    }, [onFocus]);
    const handleBlur = useCallback(() => setFocused(false), []);
    // Vega's Pressable can't be focused while its own `disabled` prop is set,
    // so presses are ignored here instead.
    const handlePress = useCallback(() => {
      if (!disabled) {
        onPress?.();
      }
    }, [disabled, onPress]);

    return (
      <Pressable
        ref={ref}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{selected: active, disabled}}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={handlePress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        // Focus wins over active. Disabled+active keeps the violet outline,
        // dimmed: the option is still the selection, it just can't be changed.
        style={[
          styles.button,
          active && !focused && styles.active,
          focused && styles.focused,
          disabled && styles.disabled,
        ]}>
        <Text
          style={[
            styles.label,
            (focused || active) && !disabled && styles.labelHighlight,
          ]}
          numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  }),
);

const styles = StyleSheet.create({
  button: {
    minHeight: px(72),
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radius.md,
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
  disabled: {
    backgroundColor: colors.surface,
    opacity: 0.5,
  },
  label: {
    ...typography.label,
    color: colors.textMuted,
  },
  labelHighlight: {
    color: colors.text,
  },
});

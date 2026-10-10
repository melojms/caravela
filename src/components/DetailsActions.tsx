import React, {memo, useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, focus, px, radius} from '../theme';
import {ActionIcon} from './detailsIcons';
import {DetailsAction} from './types';

export type DetailsActionsProps = {
  actions: DetailsAction[];
  /** Gives the first action focus when the row mounts. */
  hasTVPreferredFocus?: boolean;
  testID?: string;
};

// androidtv's icon buttons: a 24 dp icon with 10 dp padding (as in Toolbar),
// the label 85 dp wide under it.
const ICON_SIZE = px(48);
const ICON_PADDING = px(20);
const ROUND_SIZE = ICON_SIZE + 2 * ICON_PADDING + 2 * focus.borderWidth;
const LABEL_WIDTH = px(170);

type ActionButtonProps = {
  action: DetailsAction;
  hasTVPreferredFocus?: boolean;
  testID: string;
};

/**
 * androidtv's TextUnderButton: a round icon with its label underneath. Same
 * states as FocusableButton (active: violet outline; focused: focus ring,
 * violet fill, scale; disabled: dimmed but still focusable).
 */
const ActionButton = memo(
  ({action, hasTVPreferredFocus, testID}: ActionButtonProps) => {
    const {label, icon, active = false, disabled = false, onPress} = action;
    const [focused, setFocused] = useState(false);

    const handleFocus = useCallback(() => setFocused(true), []);
    const handleBlur = useCallback(() => setFocused(false), []);
    // Vega's Pressable can't be focused while its own `disabled` prop is set,
    // so presses are ignored here instead.
    const handlePress = useCallback(() => {
      if (!disabled) {
        onPress();
      }
    }, [disabled, onPress]);

    const highlighted = (focused || active) && !disabled;
    // A toggle that's on shows its icon in violet, like androidtv's activated
    // tint; on the violet focus fill the icon goes white instead.
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
        accessibilityState={{selected: active, disabled}}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={handlePress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[styles.button, disabled && styles.disabled]}>
        <View
          testID={`${testID}-circle`}
          style={[
            styles.circle,
            active && !focused && styles.active,
            focused && styles.focused,
            disabled && styles.circleDisabled,
          ]}>
          <ActionIcon
            icon={icon}
            color={iconColor}
            size={ICON_SIZE}
            testID={`${testID}-icon`}
          />
        </View>
        <Text
          style={[styles.label, highlighted && styles.labelHighlight]}
          numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
    );
  },
);

/**
 * The details screen's button row (Resume, Play, Watched, Favorite…), after
 * androidtv's fdButtonRow. Left/Right move between buttons and Down leaves the
 * row; both are plain Cartesian focus moves.
 */
export const DetailsActions = memo(
  ({
    actions,
    hasTVPreferredFocus = false,
    testID = 'details-actions',
  }: DetailsActionsProps) => (
    <View testID={testID} style={styles.row}>
      {actions.map((action, index) => (
        <ActionButton
          key={action.key}
          action={action}
          hasTVPreferredFocus={hasTVPreferredFocus && index === 0}
          testID={`${testID}-${action.key}`}
        />
      ))}
    </View>
  ),
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.transparent,
  },
  button: {
    width: LABEL_WIDTH,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  circle: {
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
  circleDisabled: {
    backgroundColor: colors.surface,
  },
  // 12 sp, two lines, centred; 2 dp under the icon.
  label: {
    marginTop: px(8),
    paddingHorizontal: px(10),
    fontSize: px(24),
    lineHeight: px(30),
    fontWeight: '600',
    textAlign: 'center',
    color: colors.textMuted,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: {width: 0, height: px(2)},
    textShadowRadius: px(8),
  },
  labelHighlight: {
    color: colors.text,
  },
});

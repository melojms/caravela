import 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';

import {FocusableButton} from '../src/components/FocusableButton';
import {colors, focus} from '../src/theme';

// The Vega Jest preset's StyleSheet.flatten mock returns arrays untouched,
// so toHaveStyle can't read them. Flatten by hand.
const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('FocusableButton', () => {
  it('calls onPress and shows the focus ring while focused', () => {
    const onPress = jest.fn();
    const screen = render(
      <FocusableButton testID="btn" label="Connect" onPress={onPress} />,
    );
    const button = screen.getByTestId('btn');

    fireEvent(button, 'focus');
    expect(flatStyle(button.props.style)).toMatchObject({
      borderColor: colors.focus,
      backgroundColor: colors.violet,
      transform: [{scale: focus.scale}],
    });
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.props.accessibilityState).toMatchObject({disabled: false});
    expect(flatStyle(button.props.style).opacity).toBeUndefined();
  });

  it('ignores presses while disabled', () => {
    const onPress = jest.fn();
    const screen = render(
      <FocusableButton
        testID="btn"
        label="Connect"
        onPress={onPress}
        disabled
      />,
    );

    fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports the disabled state to accessibility', () => {
    const screen = render(
      <FocusableButton testID="btn" label="Connect" disabled active />,
    );
    expect(screen.getByTestId('btn').props.accessibilityState).toMatchObject({
      disabled: true,
      selected: true,
    });
  });

  it('looks dimmed while disabled', () => {
    const screen = render(
      <FocusableButton testID="btn" label="Connect" disabled />,
    );
    expect(flatStyle(screen.getByTestId('btn').props.style).opacity).toBe(0.5);
  });

  it('stays focusable while disabled, with the ring but no fill', () => {
    const screen = render(
      <FocusableButton testID="btn" label="Connect" disabled />,
    );
    const button = screen.getByTestId('btn');
    expect(button.props.focusable).not.toBe(false);

    fireEvent(button, 'focus');
    const style = flatStyle(button.props.style);
    expect(style).toMatchObject({
      borderColor: colors.focus,
      backgroundColor: colors.surface,
      opacity: 0.5,
    });
  });

  it('re-enables presses when disabled is cleared', () => {
    const onPress = jest.fn();
    const screen = render(
      <FocusableButton
        testID="btn"
        label="Connect"
        onPress={onPress}
        disabled
      />,
    );
    screen.rerender(
      <FocusableButton testID="btn" label="Connect" onPress={onPress} />,
    );

    fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

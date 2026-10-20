import 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';
import type {View} from 'react-native';

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

  it('forwards a ref to its Pressable', () => {
    const ref = React.createRef<View>();
    render(<FocusableButton ref={ref} testID="btn" label="Connect" />);
    expect(ref.current).not.toBeNull();
    expect((ref.current as {props?: {testID?: string}}).props?.testID).toBe(
      'btn',
    );
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

  describe('style combinations', () => {
    const renderButton = (props: {active?: boolean; disabled?: boolean}) =>
      render(<FocusableButton testID="btn" label="Connect" {...props} />);
    const buttonStyle = (screen: ReturnType<typeof render>) =>
      flatStyle(screen.getByTestId('btn').props.style);
    const labelColor = (screen: ReturnType<typeof render>) =>
      flatStyle(screen.getByText('Connect').props.style).color;

    it('keeps a transparent border of the focus width at rest', () => {
      const screen = renderButton({});
      expect(buttonStyle(screen)).toMatchObject({
        borderWidth: focus.borderWidth,
        borderColor: colors.transparent,
        backgroundColor: colors.surface,
      });
      expect(buttonStyle(screen).transform).toBeUndefined();
      expect(labelColor(screen)).toBe(colors.textMuted);
    });

    it('shows a violet outline and a white label while active', () => {
      const screen = renderButton({active: true});
      expect(buttonStyle(screen)).toMatchObject({
        borderWidth: focus.borderWidth,
        borderColor: colors.violet,
        backgroundColor: colors.surfaceRaised,
      });
      expect(buttonStyle(screen).transform).toBeUndefined();
      expect(labelColor(screen)).toBe(colors.text);
    });

    it('shows the focus ring and a white label while focused', () => {
      const screen = renderButton({});
      fireEvent(screen.getByTestId('btn'), 'focus');
      expect(buttonStyle(screen)).toMatchObject({
        borderWidth: focus.borderWidth,
        borderColor: colors.focus,
        backgroundColor: colors.violet,
        transform: [{scale: focus.scale}],
      });
      expect(labelColor(screen)).toBe(colors.text);
    });

    it('lets focus win over active', () => {
      const screen = renderButton({active: true});
      fireEvent(screen.getByTestId('btn'), 'focus');
      expect(buttonStyle(screen)).toMatchObject({
        borderWidth: focus.borderWidth,
        borderColor: colors.focus,
        backgroundColor: colors.violet,
        transform: [{scale: focus.scale}],
      });
      expect(labelColor(screen)).toBe(colors.text);
    });

    it('goes back to the active outline after blur', () => {
      const screen = renderButton({active: true});
      const button = screen.getByTestId('btn');
      fireEvent(button, 'focus');
      fireEvent(button, 'blur');
      expect(buttonStyle(screen)).toMatchObject({
        borderColor: colors.violet,
        backgroundColor: colors.surfaceRaised,
      });
      expect(buttonStyle(screen).transform).toBeUndefined();
    });

    it('dims a disabled button and keeps its label muted', () => {
      const screen = renderButton({disabled: true});
      expect(buttonStyle(screen)).toMatchObject({
        borderColor: colors.transparent,
        backgroundColor: colors.surface,
        opacity: 0.5,
      });
      expect(labelColor(screen)).toBe(colors.textMuted);
    });

    it('keeps the violet outline, dimmed, when disabled and active', () => {
      const screen = renderButton({active: true, disabled: true});
      expect(buttonStyle(screen)).toMatchObject({
        borderWidth: focus.borderWidth,
        borderColor: colors.violet,
        backgroundColor: colors.surface,
        opacity: 0.5,
      });
      expect(labelColor(screen)).toBe(colors.textMuted);
    });

    it('shows the focus ring, dimmed, when disabled, active and focused', () => {
      const screen = renderButton({active: true, disabled: true});
      fireEvent(screen.getByTestId('btn'), 'focus');
      expect(buttonStyle(screen)).toMatchObject({
        borderColor: colors.focus,
        backgroundColor: colors.surface,
        opacity: 0.5,
      });
      expect(labelColor(screen)).toBe(colors.textMuted);
    });
  });
});

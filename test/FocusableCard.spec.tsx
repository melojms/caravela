import 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';

import {
  CardProgressBar,
  FocusableCard,
  PlayedBadge,
} from '../src/components/FocusableCard';
import {colors, focus} from '../src/theme';

// The Vega Jest preset's StyleSheet.flatten mock returns arrays untouched,
// so toHaveStyle can't read them. Flatten by hand.
const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('FocusableCard', () => {
  it('shows the focus ring while focused and drops it on blur', () => {
    const screen = render(<FocusableCard testID="card" title="Dune" />);
    const frameStyle = () =>
      flatStyle(screen.getByTestId('card-frame').props.style);

    expect(frameStyle().borderColor).toBe(colors.transparent);

    fireEvent(screen.getByTestId('card'), 'focus');
    expect(frameStyle()).toMatchObject({
      borderColor: colors.focus,
      transform: [{scale: focus.scale}],
    });

    fireEvent(screen.getByTestId('card'), 'blur');
    expect(frameStyle().borderColor).toBe(colors.transparent);
    expect(frameStyle().transform).toBeUndefined();
  });

  it("passes the focused view's native tag to onFocus", () => {
    const onFocus = jest.fn();
    const screen = render(
      <FocusableCard testID="card" title="Dune" onFocus={onFocus} />,
    );

    fireEvent(screen.getByTestId('card'), 'focus', {nativeEvent: {target: 42}});
    expect(onFocus).toHaveBeenCalledWith(42);
  });

  describe('frame colour', () => {
    const PLACEHOLDER = '#123456';
    // A colour on the element that carries the border shows through the
    // transparent border as a frame.
    const isVisible = (color: unknown) =>
      color !== undefined && color !== colors.transparent;

    it('draws no coloured frame around an unfocused card with an image', () => {
      const screen = render(
        <FocusableCard
          testID="card"
          title="Dune"
          imageUri="https://example.com/dune.jpg"
          placeholderColor={PLACEHOLDER}
        />,
      );
      const frame = flatStyle(screen.getByTestId('card-frame').props.style);

      expect(isVisible(frame.backgroundColor)).toBe(false);
      expect(frame.borderColor).toBe(colors.transparent);
    });

    it('keeps the placeholder colour inside the border of a card without an image', () => {
      const screen = render(
        <FocusableCard
          testID="card"
          title="Dune"
          placeholderColor={PLACEHOLDER}
        />,
      );
      const frame = flatStyle(screen.getByTestId('card-frame').props.style);
      const surface = flatStyle(screen.getByTestId('card-surface').props.style);

      expect(isVisible(frame.backgroundColor)).toBe(false);
      expect(surface.backgroundColor).toBe(PLACEHOLDER);
      expect(surface.borderWidth).toBeUndefined();
    });

    it('gives only the focused card the focus colour', () => {
      const screen = render(
        <>
          <FocusableCard testID="a" title="Dune" imageUri="https://x/a.jpg" />
          <FocusableCard testID="b" title="Alien" imageUri="https://x/b.jpg" />
        </>,
      );
      const frameStyle = (id: string) =>
        flatStyle(screen.getByTestId(`${id}-frame`).props.style);

      fireEvent(screen.getByTestId('b'), 'focus');

      expect(frameStyle('b').borderColor).toBe(colors.focus);
      expect(frameStyle('a').borderColor).toBe(colors.transparent);
      expect(isVisible(frameStyle('a').backgroundColor)).toBe(false);
      expect(isVisible(frameStyle('b').backgroundColor)).toBe(false);
    });
  });

  it('renders title, subtitle and the progress and badge slots', () => {
    const onPress = jest.fn();
    const screen = render(
      <FocusableCard
        testID="card"
        title="Dune"
        subtitle="2021"
        variant="landscape"
        progressBar={<CardProgressBar value={0.5} />}
        badge={<PlayedBadge />}
        onPress={onPress}
      />,
    );

    expect(screen.getAllByText('Dune').length).toBeGreaterThan(0);
    expect(screen.getByText('2021')).toBeTruthy();
    expect(screen.getByTestId('card-progress')).toBeTruthy();
    expect(screen.getByTestId('card-played')).toBeTruthy();

    fireEvent.press(screen.getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('omits empty slots', () => {
    const screen = render(<FocusableCard testID="card" title="Dune" />);
    expect(screen.queryByTestId('card-progress')).toBeNull();
    expect(screen.queryByTestId('card-played')).toBeNull();
  });
});

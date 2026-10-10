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

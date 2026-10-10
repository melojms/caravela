import 'react-native';
import {act, render} from '@testing-library/react-native';
import * as React from 'react';

import {
  Backdrop,
  BACKDROP_BLUR,
  BACKDROP_FADE_MS,
} from '../src/components/Backdrop';
import {colors} from '../src/theme';

// The Vega Jest preset's StyleSheet.flatten mock returns arrays untouched,
// so toHaveStyle can't read them. Flatten by hand.
const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

// The backdrop is hidden from accessibility on purpose, so queries must include hidden elements.
const hidden = {includeHiddenElements: true};

describe('Backdrop', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows only the app background without a uri', () => {
    const screen = render(<Backdrop />);

    expect(
      flatStyle(screen.getByTestId('backdrop', hidden).props.style),
    ).toMatchObject({
      backgroundColor: colors.background,
    });
    expect(screen.queryByTestId('backdrop-image', hidden)).toBeNull();
    expect(screen.queryByTestId('backdrop-previous', hidden)).toBeNull();
  });

  it('shows the image blurred and cover-fit', () => {
    const screen = render(<Backdrop uri="https://jf/a.jpg" />);
    const image = screen.getByTestId('backdrop-image', hidden);

    expect(image.props.source).toEqual({uri: 'https://jf/a.jpg'});
    expect(image.props.blurRadius).toBe(BACKDROP_BLUR);
    expect(image.props.resizeMode).toBe('cover');
  });

  it("isn't focusable and ignores touches", () => {
    const screen = render(<Backdrop uri="https://jf/a.jpg" />);
    const root = screen.getByTestId('backdrop', hidden);

    expect(root.props.focusable).toBe(false);
    expect(root.props.pointerEvents).toBe('none');
  });

  it('cross-fades to a new image, then drops the old one', () => {
    const screen = render(<Backdrop uri="https://jf/a.jpg" />);
    screen.rerender(<Backdrop uri="https://jf/b.jpg" />);

    expect(
      screen.getByTestId('backdrop-previous', hidden).props.source,
    ).toEqual({
      uri: 'https://jf/a.jpg',
    });
    expect(screen.getByTestId('backdrop-image', hidden).props.source).toEqual({
      uri: 'https://jf/b.jpg',
    });

    act(() => jest.advanceTimersByTime(BACKDROP_FADE_MS + 50));

    expect(screen.queryByTestId('backdrop-previous', hidden)).toBeNull();
    expect(screen.getByTestId('backdrop-image', hidden).props.source).toEqual({
      uri: 'https://jf/b.jpg',
    });
  });

  it('fades the image out when the uri is cleared', () => {
    const screen = render(<Backdrop uri="https://jf/a.jpg" />);
    screen.rerender(<Backdrop />);

    expect(screen.queryByTestId('backdrop-image', hidden)).toBeNull();
    expect(screen.getByTestId('backdrop-previous', hidden)).toBeTruthy();

    act(() => jest.advanceTimersByTime(BACKDROP_FADE_MS + 50));

    expect(screen.queryByTestId('backdrop-previous', hidden)).toBeNull();
  });
});

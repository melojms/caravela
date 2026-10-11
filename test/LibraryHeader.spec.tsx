import 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';

import {
  LibraryHeader,
  type LibraryHeaderProps,
} from '../src/components/LibraryHeader';
import {colors, focus} from '../src/theme';

// The Vega Jest preset's StyleSheet.flatten mock returns arrays untouched,
// so toHaveStyle can't read them. Flatten by hand.
const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const renderHeader = (props: Partial<LibraryHeaderProps> = {}) => {
  const callbacks = {
    onSortPress: jest.fn(),
    onToggleUnwatched: jest.fn(),
    onToggleFavorites: jest.fn(),
    onLetterPress: jest.fn(),
  };
  const screen = render(
    <LibraryHeader
      title="Movies"
      statusText="Showing all items from 'Movies' sorted by Name"
      filters={{unwatchedOnly: false, favoritesOnly: false}}
      showLetterButton
      {...callbacks}
      {...props}
    />,
  );
  return {screen, ...callbacks};
};

const text = (screen: ReturnType<typeof render>, testID: string) =>
  screen.getByTestId(testID).props.children;

describe('LibraryHeader', () => {
  it('shows the title, the status line and the focused name', () => {
    const {screen} = renderHeader({focusedName: 'Ad Astra'});

    expect(text(screen, 'library-header-title')).toBe('Movies');
    expect(text(screen, 'library-header-status')).toBe(
      "Showing all items from 'Movies' sorted by Name",
    );
    expect(text(screen, 'library-header-focused-name')).toBe('Ad Astra');
  });

  it('keeps the focused name line empty without a focused item', () => {
    const {screen} = renderHeader();
    expect(text(screen, 'library-header-focused-name')).toBe('');
  });

  it('shows the counter 1-based against the total', () => {
    const {screen} = renderHeader({focusedIndex: 0, total: 120});
    expect(text(screen, 'library-header-counter')).toBe('1 | 120');

    screen.rerender(
      <LibraryHeader
        title="Movies"
        statusText=""
        filters={{unwatchedOnly: false, favoritesOnly: false}}
        showLetterButton
        focusedIndex={41}
        total={120}
        onSortPress={jest.fn()}
        onToggleUnwatched={jest.fn()}
        onToggleFavorites={jest.fn()}
        onLetterPress={jest.fn()}
      />,
    );
    expect(text(screen, 'library-header-counter')).toBe('42 | 120');
  });

  it('shows a zero total', () => {
    const {screen} = renderHeader({focusedIndex: 0, total: 0});
    expect(text(screen, 'library-header-counter')).toBe('1 | 0');
  });

  it.each([
    ['nothing is focused', {total: 120}],
    ['the total is unknown', {focusedIndex: 3}],
    ['the index is negative', {focusedIndex: -1, total: 120}],
  ])('hides the counter when %s', (_, props) => {
    const {screen} = renderHeader(props);
    expect(text(screen, 'library-header-counter')).toBe('');
  });

  it('shows the Letter button only when allowed', () => {
    const {screen} = renderHeader({showLetterButton: false});
    expect(screen.queryByTestId('library-header-letter')).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.props.testID)).toEqual([
      'library-header-sort',
      'library-header-unwatched',
      'library-header-favorites',
    ]);
  });

  it('orders the buttons Sort, Unwatched, Favorites, Letter', () => {
    const {screen} = renderHeader();
    expect(screen.getAllByRole('button').map((b) => b.props.testID)).toEqual([
      'library-header-sort',
      'library-header-unwatched',
      'library-header-favorites',
      'library-header-letter',
    ]);
  });

  it.each([
    ['sort', 'onSortPress'],
    ['unwatched', 'onToggleUnwatched'],
    ['favorites', 'onToggleFavorites'],
    ['letter', 'onLetterPress'],
  ] as const)('the %s button calls %s', (key, callback) => {
    const result = renderHeader();
    fireEvent.press(result.screen.getByTestId(`library-header-${key}`));

    expect(result[callback]).toHaveBeenCalledTimes(1);
    const others = (
      [
        'onSortPress',
        'onToggleUnwatched',
        'onToggleFavorites',
        'onLetterPress',
      ] as const
    ).filter((name) => name !== callback);
    others.forEach((name) => expect(result[name]).not.toHaveBeenCalled());
  });

  it('marks nothing as on by default', () => {
    const {screen} = renderHeader();
    screen.getAllByRole('button').forEach((button) => {
      expect(button.props.accessibilityState).toMatchObject({selected: false});
      expect(flatStyle(button.props.style).borderColor).toBe(
        colors.transparent,
      );
    });
  });

  it('shows the filters that are on with the active outline', () => {
    const {screen} = renderHeader({
      filters: {unwatchedOnly: true, favoritesOnly: true},
    });

    ['unwatched', 'favorites'].forEach((key) => {
      const button = screen.getByTestId(`library-header-${key}`);
      expect(button.props.accessibilityState).toMatchObject({selected: true});
      expect(flatStyle(button.props.style)).toMatchObject({
        borderColor: colors.violet,
        backgroundColor: colors.surfaceRaised,
      });
      expect(
        screen.getByTestId(`library-header-${key}-icon`).props.children.props
          .fill,
      ).toBe(colors.violetLight);
    });
    expect(
      screen.getByTestId('library-header-sort').props.accessibilityState,
    ).toMatchObject({selected: false});
  });

  it('shows each filter on its own', () => {
    const {screen} = renderHeader({
      filters: {unwatchedOnly: false, favoritesOnly: true},
    });
    expect(
      screen.getByTestId('library-header-unwatched').props.accessibilityState,
    ).toMatchObject({selected: false});
    expect(
      screen.getByTestId('library-header-favorites').props.accessibilityState,
    ).toMatchObject({selected: true});
  });

  it.each([
    ['a letter is set', 'M', true],
    ['no letter is set', undefined, false],
    ['the letter is empty', '', false],
  ])('the Letter button is on when %s', (_, letter, on) => {
    const {screen} = renderHeader({letter});
    expect(
      screen.getByTestId('library-header-letter').props.accessibilityState,
    ).toMatchObject({selected: on});
  });

  it('rings the focused button like the details buttons', () => {
    const {screen} = renderHeader({
      filters: {unwatchedOnly: true, favoritesOnly: false},
    });
    const button = screen.getByTestId('library-header-unwatched');

    fireEvent(button, 'focus');
    expect(flatStyle(button.props.style)).toMatchObject({
      borderColor: colors.focus,
      backgroundColor: colors.violet,
      transform: [{scale: focus.scale}],
    });
    expect(
      screen.getByTestId('library-header-unwatched-icon').props.children.props
        .fill,
    ).toBe(colors.text);

    fireEvent(button, 'blur');
    expect(flatStyle(button.props.style).borderColor).toBe(colors.violet);
  });

  it('remembers the last focused button in the toolbar', () => {
    const {screen} = renderHeader();
    const guide = screen.UNSAFE_getByType(TVFocusGuideView);

    expect(guide.props.autoFocus).toBe(true);
    expect(guide.props.testID).toBe('library-header-toolbar');
  });
});

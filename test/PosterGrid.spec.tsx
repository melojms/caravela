import 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';
import {FlatList} from 'react-native';

import {
  getRowLayout,
  gridRowOffset,
  gridTopRow,
  PosterGrid,
} from '../src/components/PosterGrid';
import {cardOuterHeight, cardSize} from '../src/components/FocusableCard';
import {focus, layout, spacing} from '../src/theme';
import {CardItem} from '../src/components/types';

const makeItems = (count: number): CardItem[] =>
  Array.from({length: count}, (_, i) => ({id: `m${i}`, title: `Movie ${i}`}));

const scrollToBottom = (grid: ReturnType<typeof render>) => {
  const list = grid.getByTestId('poster-grid');
  fireEvent(list, 'layout', {
    nativeEvent: {layout: {x: 0, y: 0, width: 960, height: 400}},
  });
  fireEvent(list, 'contentSizeChange', 960, 2000);
  fireEvent.scroll(list, {
    nativeEvent: {
      contentOffset: {x: 0, y: 1600},
      contentSize: {width: 960, height: 2000},
      layoutMeasurement: {width: 960, height: 400},
    },
  });
};

describe('PosterGrid', () => {
  it('lazily renders only the first rows', () => {
    const screen = render(<PosterGrid items={makeItems(120)} numColumns={6} />);
    expect(screen.getByTestId('poster-grid-item-0')).toBeTruthy();
    expect(screen.queryByTestId('poster-grid-item-119')).toBeNull();
  });

  it('calls onEndReached when scrolled near the end', () => {
    const onEndReached = jest.fn();
    const screen = render(
      <PosterGrid
        items={makeItems(36)}
        numColumns={6}
        onEndReached={onEndReached}
      />,
    );

    scrollToBottom(screen);
    expect(onEndReached).toHaveBeenCalled();
  });

  it('passes the pressed item back', () => {
    const items = makeItems(6);
    const onItemPress = jest.fn();
    const screen = render(
      <PosterGrid items={items} onItemPress={onItemPress} />,
    );

    fireEvent.press(screen.getByTestId('poster-grid-item-2'));
    expect(onItemPress).toHaveBeenCalledWith(items[2]);
  });

  it('passes the focused item, its index and its native tag', () => {
    const items = makeItems(12);
    const onItemFocus = jest.fn();
    const screen = render(
      <PosterGrid items={items} onItemFocus={onItemFocus} />,
    );

    fireEvent(screen.getByTestId('poster-grid-item-7'), 'focus', {
      nativeEvent: {target: 4242},
    });
    expect(onItemFocus).toHaveBeenCalledWith(items[7], 7, 4242);
  });

  it('gives only the first card preferred focus with focusFirstItem', () => {
    const screen = render(<PosterGrid items={makeItems(12)} focusFirstItem />);
    const preferred = screen
      .getAllByRole('button')
      .filter((card) => card.props.hasTVPreferredFocus)
      .map((card) => card.props.testID);
    expect(preferred).toEqual(['poster-grid-item-0']);
  });

  it('leaves room for the focus scale left of the first column', () => {
    const screen = render(<PosterGrid items={makeItems(6)} />);
    const {paddingLeft} =
      screen.UNSAFE_getByType(FlatList).props.contentContainerStyle;
    const grow = (cardSize('poster').width * (focus.scale - 1)) / 2;

    expect(paddingLeft).toBeGreaterThanOrEqual(grow + focus.borderWidth);
  });

  describe('row layout', () => {
    const rowHeight =
      cardOuterHeight('poster') +
      layout.cardGap +
      cardSize('poster').height * (focus.scale - 1);

    it('lays out by row index, as VirtualizedList asks with numColumns', () => {
      expect(getRowLayout(null, 0)).toEqual({
        length: rowHeight,
        offset: spacing.md,
        index: 0,
      });
      expect(getRowLayout(null, 3).offset).toBeCloseTo(
        spacing.md + 3 * rowHeight,
      );
    });

    it('fits the focus scale inside the row', () => {
      const slackAbove = (rowHeight - cardOuterHeight('poster')) / 2;
      const grow = (cardSize('poster').height * (focus.scale - 1)) / 2;
      expect(slackAbove).toBeGreaterThanOrEqual(grow);
    });

    // A viewport two and a half rows tall.
    const viewport = spacing.md + rowHeight * 2.5;

    it('keeps the top row while the focused row is fully visible', () => {
      expect(gridTopRow(0, 0, viewport, 0)).toBe(0);
      expect(gridTopRow(1, 0, viewport, 0)).toBe(0);
    });

    it('scrolls down just enough, by whole rows', () => {
      expect(gridTopRow(2, 0, viewport, 0)).toBe(1);
      expect(gridTopRow(3, 1, viewport, 0)).toBe(2);
      expect(gridTopRow(9, 1, viewport, 0)).toBe(8);
    });

    it('scrolls up to put the focused row on top', () => {
      expect(gridTopRow(4, 6, viewport, 0)).toBe(4);
      expect(gridTopRow(0, 3, viewport, 0)).toBe(0);
    });

    it('scrolls to the row itself when the viewport is under a row tall', () => {
      expect(gridTopRow(3, 0, rowHeight / 2, 0)).toBe(3);
    });

    it('counts a list header above the first row', () => {
      // With a tall header row 1 no longer fits under it.
      expect(gridTopRow(1, 0, viewport, rowHeight)).toBe(1);
      expect(gridRowOffset(0, rowHeight)).toBe(0);
      expect(gridRowOffset(2, rowHeight)).toBeCloseTo(
        spacing.md + 3 * rowHeight,
      );
    });

    it('only scrolls to row boundaries when focus moves', () => {
      const scrollToOffset = jest
        .spyOn(FlatList.prototype, 'scrollToOffset')
        .mockImplementation(() => {});
      const screen = render(
        <PosterGrid items={makeItems(36)} numColumns={6} />,
      );
      fireEvent(screen.getByTestId('poster-grid'), 'layout', {
        nativeEvent: {layout: {x: 0, y: 0, width: 960, height: viewport}},
      });
      const focusIndex = (index: number) =>
        fireEvent(screen.getByTestId(`poster-grid-item-${index}`), 'focus', {
          nativeEvent: {target: index},
        });

      focusIndex(7);
      expect(scrollToOffset).not.toHaveBeenCalled();

      focusIndex(13);
      expect(scrollToOffset).toHaveBeenLastCalledWith({
        offset: gridRowOffset(1, 0),
        animated: true,
      });

      focusIndex(8);
      expect(scrollToOffset).toHaveBeenCalledTimes(1);

      focusIndex(2);
      expect(scrollToOffset).toHaveBeenLastCalledWith({
        offset: 0,
        animated: true,
      });
      scrollToOffset.mockRestore();
    });
  });

  describe('progress', () => {
    const renderWithProgress = (progress: number) =>
      render(
        <PosterGrid items={[{id: 'p', title: 'Partly watched', progress}]} />,
      );
    const fillWidth = (screen: ReturnType<typeof render>) => {
      const track = screen.getByTestId('card-progress');
      const fill = React.Children.only(track.props.children);
      return Object.assign({}, ...[fill.props.style].flat()).width;
    };

    it('shows no bar at 0', () => {
      expect(renderWithProgress(0).queryByTestId('card-progress')).toBeNull();
    });

    it('shows no bar below 0', () => {
      expect(
        renderWithProgress(-0.2).queryByTestId('card-progress'),
      ).toBeNull();
    });

    it('shows a partial bar in between', () => {
      expect(fillWidth(renderWithProgress(0.25))).toBe('25%');
    });

    it.each([1, 1.7])('shows a full bar, not overflowing, at %s', (value) => {
      expect(fillWidth(renderWithProgress(value))).toBe('100%');
    });
  });
});

import 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';
import {FlatList, View} from 'react-native';
import type {findNodeHandle as findNodeHandleType} from 'react-native';

import {
  getRowLayout,
  gridRowOffset,
  gridTopRow,
  PosterGrid,
} from '../src/components/PosterGrid';
import {cardOuterHeight, cardSize} from '../src/components/FocusableCard';
import {focus, layout, spacing} from '../src/theme';
import {CardItem} from '../src/components/types';

// FocusManager is a native TurboModule; swap in a recorder.
const mockFocusManager = {focus: jest.fn(), setNextFocus: jest.fn()};
jest.mock('@amazon-devices/react-native-kepler', () => {
  const actual = jest.requireActual('@amazon-devices/react-native-kepler');
  return new Proxy(actual, {
    get: (target, key) =>
      key === 'FocusManager' ? mockFocusManager : target[key],
  });
});

beforeEach(() => {
  mockFocusManager.focus.mockClear();
  mockFocusManager.setNextFocus.mockClear();
});

// Jest's host Views have no element-node APIs, which Vega's have. Give each
// cell's View a first child standing in for its card, with tag 1000 + the
// card's index, and let findNodeHandle read that tag.
const CARD_TAG_BASE = 1000;
const withCardTags = () => {
  let viewPrototype: object | undefined;
  let reactNative: {findNodeHandle: typeof findNodeHandleType};
  let original: PropertyDescriptor | undefined;
  beforeEach(() => {
    let probe: object | null = null;
    render(
      <View
        ref={(node) => {
          probe = node;
        }}
      />,
    );
    viewPrototype = Object.getPrototypeOf(probe);
    Object.defineProperty(viewPrototype, 'firstElementChild', {
      configurable: true,
      get(this: {props?: {children?: {props?: {testID?: string}}}}) {
        const match = /-item-(\d+)$/.exec(
          this.props?.children?.props?.testID ?? '',
        );
        return match ? {cardTag: CARD_TAG_BASE + Number(match[1])} : null;
      },
    });
    // The module object itself (`import * as` gets a copy Babel made), whose
    // findNodeHandle is a getter.
    reactNative = jest.requireActual('react-native');
    original = Object.getOwnPropertyDescriptor(reactNative, 'findNodeHandle');
    const actual = reactNative.findNodeHandle;
    Object.defineProperty(reactNative, 'findNodeHandle', {
      configurable: true,
      get: () => (node: unknown) =>
        (node as {cardTag?: number} | null)?.cardTag ??
        actual(node as Parameters<typeof actual>[0]),
    });
  });
  afterEach(() => {
    if (original) {
      Object.defineProperty(reactNative, 'findNodeHandle', original);
    }
    if (viewPrototype) {
      delete (viewPrototype as {firstElementChild?: unknown})
        .firstElementChild;
    }
  });
};

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

  describe('row end', () => {
    it('sends Right from the last card of a short row back to it', () => {
      const screen = render(<PosterGrid items={makeItems(8)} numColumns={6} />);
      const filler = () => screen.getByTestId('poster-grid-row-end');
      // Without element nodes (plain Jest), nothing to go back to until the
      // last card has had focus.
      fireEvent(filler(), 'focus');
      expect(mockFocusManager.focus).not.toHaveBeenCalled();

      fireEvent(screen.getByTestId('poster-grid-item-7'), 'focus', {
        nativeEvent: {target: 77},
      });
      fireEvent(filler(), 'focus');
      expect(mockFocusManager.focus).toHaveBeenCalledWith(77);
    });

    describe('before the last card has had focus', () => {
      withCardTags();

      // Down from the end of the row above lands on the filler first.
      it('sends the filler to the last card', () => {
        const screen = render(
          <PosterGrid items={makeItems(8)} numColumns={6} />,
        );
        fireEvent(screen.getByTestId('poster-grid-row-end'), 'focus');
        expect(mockFocusManager.focus).toHaveBeenCalledWith(
          CARD_TAG_BASE + 7,
        );
      });
    });

    it('forgets a last card that more items pushed back', () => {
      const screen = render(<PosterGrid items={makeItems(8)} numColumns={6} />);
      fireEvent(screen.getByTestId('poster-grid-item-7'), 'focus', {
        nativeEvent: {target: 77},
      });
      screen.rerender(<PosterGrid items={makeItems(10)} numColumns={6} />);

      fireEvent(screen.getByTestId('poster-grid-row-end'), 'focus');
      expect(mockFocusManager.focus).not.toHaveBeenCalledWith(77);
    });

    it('has no filler when the last row is full', () => {
      const screen = render(
        <PosterGrid items={makeItems(12)} numColumns={6} />,
      );
      expect(screen.queryByTestId('poster-grid-row-end')).toBeNull();
    });
  });

  // With scrollEnabled off, Vega's focus search skips the off-screen row
  // above, so Up from the top row on screen left the grid.
  describe('Up', () => {
    withCardTags();

    it('goes to the card right above', () => {
      const screen = render(
        <PosterGrid items={makeItems(30)} numColumns={6} />,
      );
      fireEvent(screen.getByTestId('poster-grid-item-15'), 'focus', {
        nativeEvent: {target: 55},
      });
      expect(mockFocusManager.setNextFocus).toHaveBeenCalledWith(
        55,
        CARD_TAG_BASE + 9,
        'up',
      );
    });

    it('is left to Vega on the first row (it goes to the toolbar)', () => {
      const screen = render(
        <PosterGrid items={makeItems(30)} numColumns={6} />,
      );
      fireEvent(screen.getByTestId('poster-grid-item-3'), 'focus', {
        nativeEvent: {target: 33},
      });
      expect(mockFocusManager.setNextFocus).not.toHaveBeenCalled();
    });
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

    it('can always scroll as far as a row boundary asks, last row included', () => {
      const rows = 6;
      const screen = render(
        <PosterGrid items={makeItems(rows * 6)} numColumns={6} />,
      );
      const {paddingTop, paddingBottom} =
        screen.UNSAFE_getByType(FlatList).props.contentContainerStyle;
      const maxOffset =
        paddingTop + rows * rowHeight + paddingBottom - viewport;

      let top = 0;
      for (let row = 0; row < rows; row++) {
        top = gridTopRow(row, top, viewport, 0);
        // A larger offset is clamped, which cuts the top row.
        expect(gridRowOffset(top, 0)).toBeLessThanOrEqual(maxOffset);
      }
    });

    it("turns off Vega's own scroll-to-focus, which aligns cards, not rows", () => {
      const screen = render(<PosterGrid items={makeItems(36)} />);
      expect(screen.UNSAFE_getByType(FlatList).props.scrollEnabled).toBe(false);
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

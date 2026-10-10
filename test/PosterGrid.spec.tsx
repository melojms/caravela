import 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';

import {PosterGrid} from '../src/components/PosterGrid';
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
});

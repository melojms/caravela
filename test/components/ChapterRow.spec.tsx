import 'react-native';
import {
  TVFocusGuideView,
  useTVEventHandler,
} from '@amazon-devices/react-native-kepler';
import {act, fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';
import {BackHandler, Image} from 'react-native';

import {
  ChapterRow,
  type ChapterRowProps,
} from '../../src/components/ChapterRow';
import type {Chapter} from '../../src/playback/types';

// test/setup.tsx's Carousel stand-in, plus a record of its props so the
// initial selection can be checked.
const mockCarouselProps = jest.fn();
jest.mock('@amazon-devices/vega-carousel', () => {
  const {View} = require('react-native');
  return {
    Carousel: (props: any) => {
      mockCarouselProps(props);
      const {dataAdapter, renderItem, testID} = props;
      const children = [];
      for (let index = 0; index < dataAdapter.getItemCount(); index++) {
        const item = dataAdapter.getItem(index);
        children.push(
          <View key={String(dataAdapter.getItemKey({item, index}))}>
            {renderItem({item, index})}
          </View>,
        );
      }
      return <View testID={testID}>{children}</View>;
    },
  };
});

const CHAPTERS: Chapter[] = [
  {index: 0, name: 'Opening', startMs: 0, imageUrl: 'https://img/0.jpg'},
  {index: 1, name: 'The Heist', startMs: 754_000},
  {index: 2, name: 'Finale', startMs: 3_730_000, imageUrl: 'https://img/2.jpg'},
];

const addListener = BackHandler.addEventListener as jest.Mock;

const renderRow = (props: Partial<ChapterRowProps> = {}) => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const screen = render(
    <ChapterRow
      chapters={CHAPTERS}
      currentIndex={0}
      onSelect={onSelect}
      onClose={onClose}
      {...props}
    />,
  );
  return {screen, onSelect, onClose};
};

const lastCarouselProps = () => mockCarouselProps.mock.calls.at(-1)?.[0];

const pressKey = (eventType: string, eventKeyAction = 0) => {
  const calls = jest.mocked(useTVEventHandler).mock.calls;
  const handler = calls[calls.length - 1][0] as (event: object) => void;
  act(() => handler({eventType, eventKeyAction}));
};

describe('ChapterRow', () => {
  beforeEach(() => {
    addListener.mockClear();
    mockCarouselProps.mockClear();
    jest.mocked(useTVEventHandler).mockClear();
  });

  it('shows the Chapters header and one card per chapter, in order', () => {
    const {screen} = renderRow();

    expect(screen.getByText('Chapters')).toBeTruthy();
    expect(screen.getByTestId('chapter-row')).toBeTruthy();
    expect(
      screen.getAllByRole('button').map((card) => card.props.testID),
    ).toEqual(['chapter-row-item-0', 'chapter-row-item-1', 'chapter-row-item-2']);
  });

  it('shows each chapter name and start time', () => {
    const {screen} = renderRow();

    // The card without an image also prints its name on the placeholder.
    expect(screen.getAllByText('Opening')).toHaveLength(1);
    expect(screen.getAllByText('The Heist')).toHaveLength(2);
    expect(screen.getByText('Finale')).toBeTruthy();
    expect(screen.getByText('0:00')).toBeTruthy();
    expect(screen.getByText('12:34')).toBeTruthy();
    expect(screen.getByText('1:02:10')).toBeTruthy();
    expect(
      screen.getByTestId('chapter-row-item-1').props.accessibilityLabel,
    ).toBe('The Heist, 12:34');
  });

  it('shows the chapter images, and the placeholder without one', () => {
    const {screen} = renderRow();

    expect(
      screen.UNSAFE_getAllByType(Image).map((image) => image.props.source),
    ).toEqual([{uri: 'https://img/0.jpg'}, {uri: 'https://img/2.jpg'}]);
    const placeholder = screen.getByTestId('chapter-row-item-1-surface');
    expect(placeholder.findAllByType(Image)).toHaveLength(0);
  });

  it('uses 16:9 cards', () => {
    const {screen} = renderRow();
    const frame = screen.getByTestId('chapter-row-item-0-frame');
    const style = Object.assign({}, ...[frame.props.style].flat(Infinity));

    expect(style.width / style.height).toBeCloseTo(16 / 9, 1);
  });

  it('opens focused on the current chapter', () => {
    renderRow({currentIndex: 1});

    expect(lastCarouselProps()).toMatchObject({
      hasPreferredFocus: true,
      initialStartIndex: 1,
    });
  });

  it.each([
    ['past the end', 7, 2],
    ['negative', -3, 0],
    ['NaN', NaN, 0],
    ['fractional', 1.6, 1],
  ])('clamps a current index %s', (_, currentIndex, expected) => {
    renderRow({currentIndex});
    expect(lastCarouselProps().initialStartIndex).toBe(expected);
  });

  it('keeps the first focus when the current chapter changes while open', () => {
    const {screen, onSelect, onClose} = renderRow({currentIndex: 0});
    screen.rerender(
      <ChapterRow
        chapters={CHAPTERS}
        currentIndex={2}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );

    expect(lastCarouselProps().initialStartIndex).toBe(0);
  });

  it('traps focus in the row', () => {
    const {screen} = renderRow();

    expect(screen.UNSAFE_getByType(TVFocusGuideView).props).toMatchObject({
      trapFocusUp: true,
      trapFocusDown: true,
      trapFocusLeft: true,
      trapFocusRight: true,
    });
    expect(lastCarouselProps().trapSelectionOnOrientation).toBe(true);
  });

  it('calls onSelect with the pressed chapter and leaves closing to the caller', () => {
    const {screen, onSelect, onClose} = renderRow();

    fireEvent.press(screen.getByTestId('chapter-row-item-2'));
    expect(onSelect).toHaveBeenCalledWith(CHAPTERS[2]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Back and reports it handled, so no other listener sees it', () => {
    const {onClose} = renderRow();

    expect(addListener).toHaveBeenCalledTimes(1);
    const [eventName, handler] = addListener.mock.calls[0];
    expect(eventName).toBe('hardwareBackPress');
    let handled: unknown;
    act(() => {
      handled = handler();
    });
    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls the latest onClose without re-registering', () => {
    const first = jest.fn();
    const second = jest.fn();
    const screen = render(
      <ChapterRow
        chapters={CHAPTERS}
        currentIndex={0}
        onSelect={jest.fn()}
        onClose={first}
      />,
    );
    screen.rerender(
      <ChapterRow
        chapters={CHAPTERS}
        currentIndex={0}
        onSelect={jest.fn()}
        onClose={second}
      />,
    );

    expect(addListener).toHaveBeenCalledTimes(1);
    addListener.mock.calls[0][1]();
    pressKey('down');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('removes the Back listener on unmount', () => {
    const {screen} = renderRow();
    const subscription = addListener.mock.results[0].value;

    expect(subscription.remove).not.toHaveBeenCalled();
    screen.unmount();
    expect(subscription.remove).toHaveBeenCalledTimes(1);
  });

  it.each(['up', 'down'])('closes on %s', (key) => {
    const {onClose} = renderRow();

    pressKey(key);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores key releases and other keys', () => {
    const {onClose} = renderRow();

    pressKey('up', 1);
    pressKey('down', 1);
    pressKey('left');
    pressKey('right');
    pressKey('select');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing and listens to nothing for no chapters', () => {
    const {screen, onClose} = renderRow({chapters: []});

    expect(screen.toJSON()).toBeNull();
    expect(addListener).not.toHaveBeenCalled();
    expect(useTVEventHandler).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses the given testID', () => {
    const {screen} = renderRow({testID: 'chapters'});

    expect(screen.getByTestId('chapters')).toBeTruthy();
    expect(screen.getByTestId('chapters-item-0')).toBeTruthy();
  });
});

import {useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {uses24HourClock} from '@amazon-devices/react-native-localize';
import {act, fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';

import {
  ENDS_AT_REFRESH_MS,
  endsAtLabel,
  SeekBar,
  type SeekBarProps,
} from '../../src/components/SeekBar';
import type {TrickplayTile} from '../../src/playback/types';

// FocusManager is a native TurboModule; swap in a recorder. findNodeHandle
// reads a tag from the node's testID.
const mockFocusManager = {focus: jest.fn(), setNextFocus: jest.fn()};
const mockTags = new Map<string, number>();
const mockTagFor = (testID: string) => {
  if (!mockTags.has(testID)) {
    mockTags.set(testID, 100 + mockTags.size);
  }
  return mockTags.get(testID)!;
};
jest.mock('@amazon-devices/react-native-kepler', () => {
  const actual = jest.requireActual('@amazon-devices/react-native-kepler');
  return new Proxy(actual, {
    get: (target, key) => {
      if (key === 'FocusManager') {
        return mockFocusManager;
      }
      if (key === 'findNodeHandle') {
        return (node: {props?: {testID?: string}} | null) =>
          node?.props?.testID ? mockTagFor(node.props.testID) : null;
      }
      return target[key];
    },
  });
});

// The Vega Jest preset's StyleSheet.flatten mock returns arrays untouched.
const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

// 2026-10-12 20:00:00 local.
const NOW = new Date(2026, 9, 12, 20, 0, 0).getTime();
const HOUR = 3_600_000;

const TILE: TrickplayTile = {
  url: 'http://server/Videos/m1/Trickplay/320/0.jpg?api_key=t',
  sheetWidth: 3200,
  sheetHeight: 1800,
  offsetX: 640,
  offsetY: 360,
  width: 320,
  height: 180,
};

const pressKey = (eventType: string, eventKeyAction = 0) => {
  const calls = jest.mocked(useTVEventHandler).mock.calls;
  const handler = calls[calls.length - 1][0] as (event: object) => void;
  act(() => handler({eventType, eventKeyAction}));
};
const tap = (eventType: string) => {
  pressKey(eventType, 0);
  pressKey(eventType, 1);
};

const renderBar = (props: Partial<SeekBarProps> = {}) => {
  const onSeek = jest.fn();
  const onScrubbingChange = jest.fn();
  const onActivity = jest.fn();
  const view = render(
    <SeekBar
      positionMs={10 * 60_000}
      durationMs={HOUR}
      canSeek
      onSeek={onSeek}
      onScrubbingChange={onScrubbingChange}
      onActivity={onActivity}
      {...props}
    />,
  );
  const bar = view.getByTestId('seek-bar-bar');
  return {view, bar, onSeek, onScrubbingChange, onActivity};
};

const focusBar = (bar: ReturnType<ReturnType<typeof render>['getByTestId']>) =>
  act(() => fireEvent(bar, 'focus'));

describe('SeekBar', () => {
  beforeEach(() => {
    jest.useFakeTimers({now: NOW});
    jest.mocked(uses24HourClock).mockReturnValue(true);
    mockFocusManager.setNextFocus.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  describe('times', () => {
    it('shows elapsed, -remaining and Ends at (24 h)', () => {
      const {view} = renderBar();
      expect(view.getByTestId('seek-bar-elapsed')).toHaveTextContent('10:00');
      expect(view.getByTestId('seek-bar-remaining')).toHaveTextContent(
        '-50:00',
      );
      expect(view.getByTestId('seek-bar-ends')).toHaveTextContent(
        'Ends at 20:50',
      );
    });

    it('uses the 12 h clock when the device does', () => {
      jest.mocked(uses24HourClock).mockReturnValue(false);
      const {view} = renderBar({positionMs: 0, durationMs: 2 * HOUR});
      expect(view.getByTestId('seek-bar-ends')).toHaveTextContent(
        'Ends at 10:00',
      );
    });

    it('counts the remaining time at the playback speed', () => {
      const {view} = renderBar({positionMs: 0, playbackSpeed: 2});
      expect(view.getByTestId('seek-bar-ends')).toHaveTextContent(
        'Ends at 20:30',
      );
      expect(endsAtLabel(NOW, HOUR, 0, true)).toBe('Ends at 21:00');
    });

    it('moves Ends at with the clock while the position stands still', () => {
      const {view} = renderBar();
      act(() => jest.advanceTimersByTime(4 * ENDS_AT_REFRESH_MS));
      expect(view.getByTestId('seek-bar-ends')).toHaveTextContent(
        'Ends at 20:52',
      );
    });

    it('hides Ends at without a duration', () => {
      const {view} = renderBar({durationMs: 0});
      expect(view.queryByTestId('seek-bar-ends')).toBeNull();
    });

    it('fills the played part of the bar', () => {
      const {view} = renderBar({positionMs: HOUR / 4});
      expect(flatStyle(view.getByTestId('seek-bar-fill').props.style)).toEqual(
        expect.objectContaining({width: '25%'}),
      );
    });
  });

  describe('focus', () => {
    it('keeps Left/Right on the bar', () => {
      const {bar} = renderBar();
      focusBar(bar);
      const tag = mockTagFor('seek-bar-bar');
      expect(mockFocusManager.setNextFocus).toHaveBeenCalledWith(
        tag,
        tag,
        'left',
      );
      expect(mockFocusManager.setNextFocus).toHaveBeenCalledWith(
        tag,
        tag,
        'right',
      );
    });

    it('passes hasTVPreferredFocus through', () => {
      const {bar} = renderBar({hasTVPreferredFocus: true});
      expect(bar.props.hasTVPreferredFocus).toBe(true);
    });

    it('shows the knob only while focused', () => {
      const {view, bar} = renderBar();
      expect(view.queryByTestId('seek-bar-knob')).toBeNull();
      focusBar(bar);
      expect(view.getByTestId('seek-bar-knob')).toBeTruthy();
      act(() => fireEvent(bar, 'blur'));
      expect(view.queryByTestId('seek-bar-knob')).toBeNull();
    });
  });

  describe('scrubbing', () => {
    it('steps 30 s forward and 10 s back from the position', () => {
      const {view, bar, onScrubbingChange, onActivity} = renderBar();
      focusBar(bar);

      pressKey('right');
      expect(onScrubbingChange).toHaveBeenCalledWith(true);
      expect(view.getByTestId('seek-bar-cursor-time')).toHaveTextContent(
        '10:30',
      );
      expect(view.getByTestId('seek-bar-elapsed')).toHaveTextContent('10:30');

      pressKey('left');
      pressKey('left');
      expect(view.getByTestId('seek-bar-cursor-time')).toHaveTextContent(
        '10:10',
      );
      expect(onScrubbingChange).toHaveBeenCalledTimes(1);
      expect(onActivity).toHaveBeenCalledTimes(3);
    });

    it('takes custom step sizes', () => {
      const {view, bar} = renderBar({backStepMs: 5_000, forwardStepMs: 60_000});
      focusBar(bar);
      pressKey('right');
      expect(view.getByTestId('seek-bar-cursor-time')).toHaveTextContent(
        '11:00',
      );
      pressKey('left');
      expect(view.getByTestId('seek-bar-cursor-time')).toHaveTextContent(
        '10:55',
      );
    });

    it('steps once per key-down: a held key repeats, releases do nothing', () => {
      const {view, bar} = renderBar();
      focusBar(bar);
      pressKey('right');
      pressKey('right');
      pressKey('right');
      pressKey('right', 1);
      expect(view.getByTestId('seek-bar-cursor-time')).toHaveTextContent(
        '11:30',
      );
    });

    it('clamps the cursor to 0..duration', () => {
      const {view, bar} = renderBar({positionMs: 5_000, durationMs: 50_000});
      focusBar(bar);
      pressKey('left');
      expect(view.getByTestId('seek-bar-cursor-time')).toHaveTextContent(
        '0:00',
      );
      pressKey('right');
      pressKey('right');
      expect(view.getByTestId('seek-bar-cursor-time')).toHaveTextContent(
        '0:50',
      );
      expect(view.getByTestId('seek-bar-remaining')).toHaveTextContent(
        '-0:00',
      );
    });

    it('seeks to the cursor on the OK release and stops scrubbing', () => {
      const {view, bar, onSeek, onScrubbingChange} = renderBar();
      focusBar(bar);
      pressKey('right');
      pressKey('right');

      pressKey('select', 0);
      expect(onSeek).not.toHaveBeenCalled();
      pressKey('select', 1);
      expect(onSeek).toHaveBeenCalledWith(11 * 60_000);
      expect(onScrubbingChange).toHaveBeenLastCalledWith(false);
      expect(view.queryByTestId('seek-bar-cursor')).toBeNull();
    });

    it("takes the simulator's enter key as OK", () => {
      const {bar, onSeek} = renderBar();
      focusBar(bar);
      pressKey('right');
      tap('enter');
      expect(onSeek).toHaveBeenCalledWith(10 * 60_000 + 30_000);
    });

    it('does nothing on OK without a cursor', () => {
      const {bar, onSeek, onScrubbingChange} = renderBar();
      focusBar(bar);
      tap('select');
      expect(onSeek).not.toHaveBeenCalled();
      expect(onScrubbingChange).not.toHaveBeenCalled();
    });

    it('drops the cursor on blur', () => {
      const {view, bar, onSeek, onScrubbingChange} = renderBar();
      focusBar(bar);
      pressKey('right');
      act(() => fireEvent(bar, 'blur'));
      expect(onScrubbingChange).toHaveBeenLastCalledWith(false);
      expect(view.queryByTestId('seek-bar-cursor')).toBeNull();
      expect(view.getByTestId('seek-bar-elapsed')).toHaveTextContent('10:00');

      // A later focus starts again from the position.
      focusBar(bar);
      pressKey('right');
      expect(view.getByTestId('seek-bar-cursor-time')).toHaveTextContent(
        '10:30',
      );
      expect(onSeek).not.toHaveBeenCalled();
    });

    it("doesn't scrub without canSeek, but still reports activity", () => {
      const {view, bar, onScrubbingChange, onActivity} = renderBar({
        canSeek: false,
      });
      focusBar(bar);
      pressKey('right');
      expect(view.queryByTestId('seek-bar-cursor')).toBeNull();
      expect(onScrubbingChange).not.toHaveBeenCalled();
      expect(onActivity).toHaveBeenCalledTimes(1);
    });

    it('keeps the cursor within a duration that shrinks mid-scrub', () => {
      const {view, bar, onSeek, onScrubbingChange} = renderBar({
        positionMs: 5_300_000,
        durationMs: 5_400_000,
      });
      focusBar(bar);
      for (let i = 0; i < 4; i++) {
        pressKey('right');
      }
      expect(view.getByTestId('seek-bar-cursor-time')).toHaveTextContent(
        '1:30:00',
      );

      view.rerender(
        <SeekBar
          positionMs={5_300_000}
          durationMs={HOUR}
          canSeek
          onSeek={onSeek}
          onScrubbingChange={onScrubbingChange}
        />,
      );
      expect(view.getByTestId('seek-bar-cursor-time')).toHaveTextContent(
        '1:00:00',
      );
      // Steps from the new end, not from where the cursor was.
      pressKey('left');
      expect(view.getByTestId('seek-bar-cursor-time')).toHaveTextContent(
        '59:50',
      );
      tap('select');
      expect(onSeek).toHaveBeenCalledWith(HOUR - 10_000);
      expect(onScrubbingChange).toHaveBeenLastCalledWith(false);
    });

    it('drops the scrub when canSeek turns false', () => {
      const {view, bar, onScrubbingChange} = renderBar();
      focusBar(bar);
      pressKey('right');
      view.rerender(
        <SeekBar
          positionMs={10 * 60_000}
          durationMs={HOUR}
          canSeek={false}
          onSeek={jest.fn()}
          onScrubbingChange={onScrubbingChange}
        />,
      );
      expect(onScrubbingChange).toHaveBeenLastCalledWith(false);
      expect(view.queryByTestId('seek-bar-cursor')).toBeNull();
    });

    it('reports the scrub ending when unmounted mid-scrub', () => {
      const {view, bar, onScrubbingChange} = renderBar();
      focusBar(bar);
      pressKey('right');
      view.unmount();
      expect(onScrubbingChange).toHaveBeenLastCalledWith(false);
    });

    it('ignores keys while not focused', () => {
      const {view, bar, onSeek, onActivity} = renderBar();
      pressKey('right');
      tap('select');
      expect(view.queryByTestId('seek-bar-cursor')).toBeNull();

      focusBar(bar);
      act(() => fireEvent(bar, 'blur'));
      pressKey('left');
      expect(view.queryByTestId('seek-bar-cursor')).toBeNull();
      expect(onSeek).not.toHaveBeenCalled();
      expect(onActivity).not.toHaveBeenCalled();
    });
  });

  describe('thumbnail', () => {
    it('shows the tile for the cursor through a clipped, offset sheet', () => {
      const thumbnailAt = jest.fn(() => TILE);
      const {view, bar} = renderBar({thumbnailAt});
      focusBar(bar);
      expect(view.queryByTestId('seek-bar-thumb')).toBeNull();
      pressKey('right');

      expect(thumbnailAt).toHaveBeenLastCalledWith(10 * 60_000 + 30_000);
      const frame = flatStyle(view.getByTestId('seek-bar-thumb').props.style);
      // 320 px wide on the 1080p canvas = 160 dp; scale 0.5 from the tile.
      expect(frame).toEqual(
        expect.objectContaining({width: 160, height: 90, overflow: 'hidden'}),
      );
      const image = view.getByTestId('seek-bar-thumb-image');
      expect(image.props.source).toEqual({uri: TILE.url});
      expect(flatStyle(image.props.style)).toEqual(
        expect.objectContaining({
          position: 'absolute',
          width: 1600,
          height: 900,
          left: -320,
          top: -180,
        }),
      );
    });

    it('shows a dark placeholder until the sheet loads', () => {
      const {view, bar} = renderBar({thumbnailAt: () => TILE});
      focusBar(bar);
      pressKey('right');
      expect(view.getByTestId('seek-bar-thumb-placeholder')).toBeTruthy();
      act(() => fireEvent(view.getByTestId('seek-bar-thumb-image'), 'load'));
      expect(view.queryByTestId('seek-bar-thumb-placeholder')).toBeNull();

      // Another cell of the same sheet is already there.
      pressKey('right');
      expect(view.queryByTestId('seek-bar-thumb-placeholder')).toBeNull();
    });

    it('draws a short last sheet at the size it loaded with', () => {
      const {view, bar} = renderBar({thumbnailAt: () => TILE});
      focusBar(bar);
      pressKey('right');
      const image = () => view.getByTestId('seek-bar-thumb-image');
      // A last sheet with 9 of its 10 rows.
      act(() =>
        fireEvent(image(), 'load', {
          nativeEvent: {source: {width: 3200, height: 1620}},
        }),
      );
      expect(flatStyle(image().props.style)).toEqual(
        expect.objectContaining({width: 1600, height: 810}),
      );
    });

    it('shows the placeholder again for a new sheet', () => {
      let url = TILE.url;
      const {view, bar} = renderBar({thumbnailAt: () => ({...TILE, url})});
      focusBar(bar);
      pressKey('right');
      act(() => fireEvent(view.getByTestId('seek-bar-thumb-image'), 'load'));
      url = 'http://server/Videos/m1/Trickplay/320/1.jpg?api_key=t';
      pressKey('right');
      expect(view.getByTestId('seek-bar-thumb-placeholder')).toBeTruthy();
    });

    it('shows only the time when there is no tile', () => {
      const {view, bar} = renderBar({thumbnailAt: () => undefined});
      focusBar(bar);
      pressKey('right');
      expect(view.queryByTestId('seek-bar-thumb')).toBeNull();
      expect(view.getByTestId('seek-bar-cursor-time')).toBeTruthy();
    });

    it('keeps the thumbnail inside the bar at both ends', () => {
      const {view, bar} = renderBar({
        positionMs: 0,
        durationMs: 100_000,
        thumbnailAt: () => TILE,
      });
      act(() =>
        fireEvent(bar, 'layout', {
          nativeEvent: {layout: {x: 0, y: 0, width: 896, height: 20}},
        }),
      );
      focusBar(bar);
      const left = () =>
        flatStyle(view.getByTestId('seek-bar-cursor').props.style).left;

      pressKey('left');
      expect(left()).toBe(0);
      // 50 %: centred on the cursor.
      pressKey('right');
      pressKey('right');
      pressKey('left');
      expect(left()).toBe(896 * 0.5 - 80);
      pressKey('right');
      pressKey('right');
      expect(left()).toBe(896 - 160);
    });
  });
});

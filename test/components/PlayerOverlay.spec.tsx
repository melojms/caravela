import {useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {act, fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';

import {
  type OverlayFocus,
  PlayerOverlay,
  type PlayerOverlayProps,
} from '../../src/components/PlayerOverlay';
import {colors} from '../../src/theme';

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

const ID = 'player-overlay';

const callbacks = () => ({
  onPlayPause: jest.fn(),
  onRewind: jest.fn(),
  onFastForward: jest.fn(),
  onSeek: jest.fn(),
  onSubtitles: jest.fn(),
  onAudio: jest.fn(),
  onChapters: jest.fn(),
  onSpeed: jest.fn(),
  onZoom: jest.fn(),
  onScrubbingChange: jest.fn(),
  onActivity: jest.fn(),
  onControlsLayout: jest.fn(),
});

const renderOverlay = (props: Partial<PlayerOverlayProps> = {}) => {
  const fns = callbacks();
  const all: PlayerOverlayProps = {
    title: {title: 'Pioneer One', subtitle: 'S1:E2 · The Man From Mars'},
    positionMs: 60_000,
    durationMs: 3_600_000,
    paused: true,
    canSeek: true,
    focus: {target: 'playpause', key: 0},
    hasSubtitles: true,
    hasAudio: true,
    hasChapters: true,
    ...fns,
    ...props,
  };
  const view = render(<PlayerOverlay {...all} />);
  return {view, fns, props: all};
};

const buttonIds = (view: ReturnType<typeof render>, group: string) =>
  view
    .getByTestId(`${ID}-${group}`)
    .props.children.flat()
    .map((child: {props: {testID: string}}) => child.props.testID);

const preferred = (view: ReturnType<typeof render>) =>
  [
    `${ID}-seek-bar`,
    ...['playpause', 'rewind', 'fastforward', 'subtitles', 'audio'].map(
      (key) => `${ID}-${key}`,
    ),
    ...['chapters', 'speed', 'zoom'].map((key) => `${ID}-${key}`),
  ].filter((id) => view.queryByTestId(id)?.props.hasTVPreferredFocus);

describe('PlayerOverlay', () => {
  beforeEach(() => mockFocusManager.setNextFocus.mockClear());

  describe('heading', () => {
    it('shows the title and subtitle', () => {
      const {view} = renderOverlay();
      expect(view.getByTestId(`${ID}-title`)).toHaveTextContent('Pioneer One');
      expect(view.getByTestId(`${ID}-subtitle`)).toHaveTextContent(
        'S1:E2 · The Man From Mars',
      );
    });

    it('shows just the title for a movie', () => {
      const {view} = renderOverlay({title: {title: 'The Movie'}});
      expect(view.getByTestId(`${ID}-title`)).toHaveTextContent('The Movie');
      expect(view.queryByTestId(`${ID}-subtitle`)).toBeNull();
    });

    it('shows the hint only when given', () => {
      const {view, props} = renderOverlay();
      expect(view.queryByTestId(`${ID}-hint`)).toBeNull();
      view.rerender(<PlayerOverlay {...props} hint="Loading subtitles…" />);
      expect(view.getByTestId(`${ID}-hint`)).toHaveTextContent(
        'Loading subtitles…',
      );
    });
  });

  describe('buttons', () => {
    it('shows every button in order, secondary ones on the right', () => {
      const {view} = renderOverlay();
      expect(buttonIds(view, 'primary')).toEqual([
        `${ID}-playpause`,
        `${ID}-rewind`,
        `${ID}-fastforward`,
        `${ID}-subtitles`,
        `${ID}-audio`,
      ]);
      expect(buttonIds(view, 'secondary')).toEqual([
        `${ID}-chapters`,
        `${ID}-speed`,
        `${ID}-zoom`,
      ]);
    });

    it('drops Subtitles, Audio and Chapters when there are none', () => {
      const {view} = renderOverlay({
        hasSubtitles: false,
        hasAudio: false,
        hasChapters: false,
      });
      expect(buttonIds(view, 'primary')).toEqual([
        `${ID}-playpause`,
        `${ID}-rewind`,
        `${ID}-fastforward`,
      ]);
      expect(buttonIds(view, 'secondary')).toEqual([
        `${ID}-speed`,
        `${ID}-zoom`,
      ]);
    });

    it('drops Rewind and Fast forward when it can’t seek', () => {
      const {view} = renderOverlay({canSeek: false});
      expect(view.queryByTestId(`${ID}-rewind`)).toBeNull();
      expect(view.queryByTestId(`${ID}-fastforward`)).toBeNull();
      expect(view.getByTestId(`${ID}-seek-bar`)).toBeTruthy();
    });

    it('shows Play while paused and Pause while playing', () => {
      const {view, props} = renderOverlay();
      const icon = () => view.getByTestId(`${ID}-playpause-icon`);
      const path = () => icon().props.children.props.d;
      const playPath = path();
      expect(view.getByTestId(`${ID}-playpause`).props.accessibilityLabel).toBe(
        'Play',
      );

      view.rerender(<PlayerOverlay {...props} paused={false} />);
      expect(path()).not.toBe(playPath);
      expect(view.getByTestId(`${ID}-playpause`).props.accessibilityLabel).toBe(
        'Pause',
      );
    });

    it.each([
      ['playpause', 'onPlayPause'],
      ['rewind', 'onRewind'],
      ['fastforward', 'onFastForward'],
      ['subtitles', 'onSubtitles'],
      ['audio', 'onAudio'],
      ['chapters', 'onChapters'],
      ['speed', 'onSpeed'],
      ['zoom', 'onZoom'],
    ] as const)('%s calls %s', (key, callback) => {
      const {view, fns} = renderOverlay();
      fireEvent.press(view.getByTestId(`${ID}-${key}`));
      expect(fns[callback]).toHaveBeenCalledTimes(1);
      for (const [name, fn] of Object.entries(fns)) {
        if (name !== callback) {
          expect(fn).not.toHaveBeenCalled();
        }
      }
    });

    it('shows the label under the focused button only', () => {
      const {view} = renderOverlay();
      expect(view.queryByTestId(`${ID}-speed-label`)).toBeNull();

      act(() => fireEvent(view.getByTestId(`${ID}-speed`), 'focus'));
      expect(view.getByTestId(`${ID}-speed-label`)).toHaveTextContent(
        'Playback speed',
      );
      expect(view.getByTestId(`${ID}-speed-icon`).props.children.props.fill).toBe(
        colors.text,
      );
      expect(view.queryByTestId(`${ID}-zoom-label`)).toBeNull();

      act(() => fireEvent(view.getByTestId(`${ID}-speed`), 'blur'));
      expect(view.queryByTestId(`${ID}-speed-label`)).toBeNull();
    });
  });

  describe('focus', () => {
    it.each<OverlayFocus>([
      'seek',
      'playpause',
      'rewind',
      'fastforward',
      'subtitles',
      'audio',
      'chapters',
      'speed',
      'zoom',
    ])('gives %s preferred focus', (target) => {
      const {view} = renderOverlay({focus: {target, key: 0}});
      expect(preferred(view)).toEqual([
        target === 'seek' ? `${ID}-seek-bar` : `${ID}-${target}`,
      ]);
    });

    it('falls back to Play/Pause when the target isn’t shown', () => {
      const {view} = renderOverlay({
        canSeek: false,
        hasAudio: false,
        focus: {target: 'rewind', key: 0},
      });
      expect(preferred(view)).toEqual([`${ID}-playpause`]);
    });

    it('remounts the controls on a new focus key', () => {
      const {view, props} = renderOverlay();
      const before = view.getByTestId(`${ID}-zoom`);
      view.rerender(
        <PlayerOverlay {...props} focus={{target: 'zoom', key: 0}} />,
      );
      expect(view.getByTestId(`${ID}-zoom`)).toBe(before);
      view.rerender(
        <PlayerOverlay {...props} focus={{target: 'zoom', key: 1}} />,
      );
      expect(view.getByTestId(`${ID}-zoom`)).not.toBe(before);
      expect(preferred(view)).toEqual([`${ID}-zoom`]);
    });

    it('points Down from the seek bar at Play/Pause', () => {
      const {view, fns} = renderOverlay();
      act(() => fireEvent(view.getByTestId(`${ID}-seek-bar`), 'focus'));
      expect(mockFocusManager.setNextFocus).toHaveBeenCalledWith(
        mockTagFor(`${ID}-seek-bar`),
        mockTagFor(`${ID}-playpause`),
        'down',
      );
      expect(fns.onActivity).toHaveBeenCalledTimes(1);
    });

    it('points Up from every button at the seek bar', () => {
      const {view, fns} = renderOverlay();
      for (const key of ['playpause', 'audio', 'zoom']) {
        act(() => fireEvent(view.getByTestId(`${ID}-${key}`), 'focus'));
        expect(mockFocusManager.setNextFocus).toHaveBeenCalledWith(
          mockTagFor(`${ID}-${key}`),
          mockTagFor(`${ID}-seek-bar`),
          'up',
        );
      }
      expect(fns.onActivity).toHaveBeenCalledTimes(3);
    });
  });

  describe('seek bar', () => {
    const pressKey = (eventType: string, eventKeyAction = 0) => {
      const calls = jest.mocked(useTVEventHandler).mock.calls;
      const handler = calls[calls.length - 1][0] as (event: object) => void;
      act(() => handler({eventType, eventKeyAction}));
    };

    it('passes the times and seeks through onSeek', () => {
      const {view, fns} = renderOverlay();
      expect(view.getByTestId(`${ID}-seek-elapsed`)).toHaveTextContent('1:00');
      expect(view.getByTestId(`${ID}-seek-remaining`)).toHaveTextContent(
        '-59:00',
      );

      act(() => fireEvent(view.getByTestId(`${ID}-seek-bar`), 'focus'));
      pressKey('right');
      expect(fns.onScrubbingChange).toHaveBeenCalledWith(true);
      pressKey('select', 0);
      pressKey('select', 1);
      expect(fns.onSeek).toHaveBeenCalledWith(90_000);
      // Focus plus two handled keys.
      expect(fns.onActivity).toHaveBeenCalledTimes(3);
    });

    it('shows the trickplay tile from thumbnailAt', () => {
      const thumbnailAt = jest.fn(() => ({
        url: 'http://server/sheet.jpg',
        sheetWidth: 3200,
        sheetHeight: 1800,
        offsetX: 0,
        offsetY: 0,
        width: 320,
        height: 180,
      }));
      const {view} = renderOverlay({thumbnailAt});
      act(() => fireEvent(view.getByTestId(`${ID}-seek-bar`), 'focus'));
      pressKey('left');
      expect(thumbnailAt).toHaveBeenCalledWith(50_000);
      expect(view.getByTestId(`${ID}-seek-thumb`)).toBeTruthy();
    });
  });

  it('reports the top of the bottom controls', () => {
    const {view, fns} = renderOverlay();
    act(() =>
      fireEvent(view.getByTestId(`${ID}-controls`), 'layout', {
        nativeEvent: {layout: {x: 0, y: 300, width: 960, height: 240}},
      }),
    );
    // Under the fade (8 bands of 6 dp) and the controls' 8 dp padding.
    expect(fns.onControlsLayout).toHaveBeenCalledWith(356);
  });
});

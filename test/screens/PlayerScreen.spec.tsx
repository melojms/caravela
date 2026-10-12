import {useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {
  KeplerVideoSurfaceView,
  VideoPlayer,
} from '@amazon-devices/react-native-w3cmedia';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {act, fireEvent, render, screen} from '@testing-library/react-native';
import {AxiosError, AxiosHeaders} from 'axios';
import React from 'react';
import {BackHandler} from 'react-native';

import {detailsKeys, useItemDetails} from '../../src/api/details';
import {homeKeys} from '../../src/api/home';
import {useSession} from '../../src/auth/SessionContext';
import {ChapterRow} from '../../src/components/ChapterRow';
import {PlayerOverlay} from '../../src/components/PlayerOverlay';
import {createPlaybackReporter} from '../../src/playback/reporting';
import {clearSubtitleCache} from '../../src/playback/subtitles';
import {
  RESOLVE_ERROR_MESSAGE,
  PlayerScreen,
  resetPlaybackSpeed,
} from '../../src/screens/PlayerScreen';
import {SUBTITLE_CONTROLS_GAP} from '../../src/screens/PlayerSubtitles';
import {
  HIDE_AFTER_INPUT_MS,
  HIDE_AFTER_PLAY_MS,
} from '../../src/screens/usePlayerOverlay';
import {resolvePlayback} from '../../src/playback/resolver';
import type {
  PlaybackResolution,
  PlaybackSession,
} from '../../src/playback/types';
import {px} from '../../src/theme';
import {sessionFor} from '../auth/fakes';
import type {
  KeplerVideoSurfaceView as FakeSurfaceView,
  VideoPlayer as FakeVideoPlayer,
} from '../__mocks__/react-native-w3cmedia';

jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

jest.mock('../../src/api/details', () => ({
  ...jest.requireActual('../../src/api/details'),
  useItemDetails: jest.fn(),
}));

jest.mock('../../src/playback/resolver', () => ({
  resolvePlayback: jest.fn(),
}));

jest.mock('../../src/playback/reporting', () => ({
  createPlaybackReporter: jest.fn(),
}));

type FakePlayer = FakeVideoPlayer;
const Fake = VideoPlayer as unknown as typeof FakeVideoPlayer;
const Surface = KeplerVideoSurfaceView as unknown as typeof FakeSurfaceView;

const SESSION: PlaybackSession = {
  itemId: 'm1',
  mediaSourceId: 'source-1',
  playSessionId: 'play-1',
  playMethod: 'DirectPlay',
  mode: 'url',
  url: 'http://server/Videos/m1/stream?static=true',
  startMs: 0,
  durationMs: 7200000,
};

const reporter = {
  start: jest.fn(() => Promise.resolve()),
  update: jest.fn(() => Promise.resolve()),
  stop: jest.fn(() => Promise.resolve()),
};

const session = sessionFor();
const expireSession = jest.fn();
const goBack = jest.fn();
let client: QueryClient;

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};

const renderScreen = (startMs = 0) =>
  render(
    <QueryClientProvider client={client}>
      <PlayerScreen
        route={
          {
            key: 'Player-1',
            name: 'Player',
            params: {itemId: 'm1', title: 'The Movie', startMs},
          } as never
        }
        navigation={{goBack} as never}
      />
    </QueryClientProvider>,
  );

const flush = () => act(async () => {});

/** Renders, resolves to a session and attaches the surface. */
const renderPlaying = async () => {
  const view = renderScreen();
  await flush();
  act(() => Surface.create('surface-1'));
  await flush();
  const player = Fake.instances.at(-1)!;
  return {view, player};
};

const fire = (player: FakePlayer, ...types: string[]) =>
  act(() => {
    for (const type of types) {
      player.fire(type);
    }
  });

/**
 * Every mounted `useTVEventHandler` callback, like Vega's emitter: each key
 * goes to all of them (the screen's, the seek bar's, the chapter row's).
 */
const keyHandlers = new Set<{current: (event: object) => void}>();

const pressKey = (eventType: string, eventKeyAction = 0) =>
  act(() => {
    for (const handler of [...keyHandlers]) {
      handler.current({eventType, eventKeyAction});
    }
  });

/** Back listeners, newest first like Vega's BackHandler. */
let backListeners: (() => boolean)[] = [];

/** Presses Back; false means nobody took it, so the navigator leaves. */
const pressBack = () => {
  let handled = false;
  act(() => {
    handled = [...backListeners].reverse().some((listener) => listener());
  });
  return handled;
};

/** OK as the remote sends it: the press, then the release. */
const pressOk = (eventType: 'select' | 'enter') => {
  pressKey(eventType, 0);
  pressKey(eventType, 1);
};

const unauthorized = () =>
  new AxiosError('401', '401', undefined, undefined, {
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config: {headers: new AxiosHeaders()},
    data: null,
  });

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  resetPlaybackSpeed();
  keyHandlers.clear();
  backListeners = [];
  jest.mocked(useTVEventHandler).mockImplementation((handler) => {
    const ref = React.useRef(handler as (event: object) => void);
    ref.current = handler as (event: object) => void;
    React.useEffect(() => {
      keyHandlers.add(ref);
      return () => {
        keyHandlers.delete(ref);
      };
    }, []);
  });
  jest
    .mocked(BackHandler.addEventListener)
    .mockImplementation((_event, listener) => {
      const entry = listener as () => boolean;
      backListeners.push(entry);
      return {
        remove: () => {
          backListeners = backListeners.filter((other) => other !== entry);
        },
      };
    });
  jest.mocked(useItemDetails).mockReturnValue({data: undefined} as never);
  Fake.instances.length = 0;
  client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  jest.mocked(useSession).mockReturnValue({
    status: 'signedIn',
    session,
    expireSession,
  } as never);
  jest
    .mocked(resolvePlayback)
    .mockResolvedValue({kind: 'play', session: SESSION});
  jest.mocked(createPlaybackReporter).mockReturnValue(reporter);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  jest.useRealTimers();
});

describe('PlayerScreen', () => {
  it('shows a spinner while resolving', async () => {
    const pending = deferred<PlaybackResolution>();
    jest.mocked(resolvePlayback).mockReturnValue(pending.promise);
    renderScreen(90000);

    expect(screen.getByTestId('player-loading')).toBeTruthy();
    expect(screen.getByTestId('player-surface')).toBeTruthy();
    expect(resolvePlayback).toHaveBeenCalledWith(session.api, {
      itemId: 'm1',
      userId: 'u1',
      startMs: 90000,
    });
    expect(Fake.instances).toHaveLength(0);
  });

  it('shows the unavailable message with a focused Back', async () => {
    jest.mocked(resolvePlayback).mockResolvedValue({
      kind: 'unavailable',
      reason: 'needs-transcode',
      message: "This file needs transcoding, which Caravela can't play yet.",
    });
    renderScreen();
    await flush();

    expect(
      screen.getByText(
        "This file needs transcoding, which Caravela can't play yet.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('player-retry')).toBeNull();
    const back = screen.getByTestId('player-back');
    expect(back.props.hasTVPreferredFocus).toBe(true);
    fireEvent.press(back);
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(Fake.instances).toHaveLength(0);
  });

  it('shows Retry after a failed resolve and resolves again', async () => {
    jest
      .mocked(resolvePlayback)
      .mockRejectedValueOnce(new Error('Network Error'));
    renderScreen();
    await flush();

    expect(screen.getByText(RESOLVE_ERROR_MESSAGE)).toBeTruthy();
    const retry = screen.getByTestId('player-retry');
    expect(retry.props.hasTVPreferredFocus).toBe(true);
    expect(screen.getByTestId('player-back')).toBeTruthy();

    fireEvent.press(retry);
    expect(screen.getByTestId('player-loading')).toBeTruthy();
    await flush();
    expect(resolvePlayback).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('player-message')).toBeNull();
    expect(Fake.instances).toHaveLength(1);
  });

  it('expires the session on a 401', async () => {
    jest.mocked(resolvePlayback).mockRejectedValueOnce(unauthorized());
    renderScreen();
    await flush();
    expect(expireSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('player-retry')).toBeNull();
  });

  it('plays the resolved session on the surface', async () => {
    const {player} = await renderPlaying();
    expect(player.setSurfaceHandle).toHaveBeenCalledWith('surface-1');
    expect(player.srcSets).toEqual([SESSION.url]);
    expect(screen.getByTestId('player-loading')).toBeTruthy();

    player.paused = false;
    fire(player, 'playing');
    expect(screen.queryByTestId('player-loading')).toBeNull();
    expect(screen.queryByTestId('player-overlay')).toBeNull();
  });

  it('pauses on Select and shows the overlay with the times', async () => {
    jest.useFakeTimers();
    const {player} = await renderPlaying();
    player.duration = 5400;
    player.paused = false;
    fire(player, 'loadedmetadata', 'playing');
    player.setPosition(754);

    pressOk('select');
    expect(player.pause).toHaveBeenCalledTimes(1);
    player.paused = true;
    fire(player, 'pause');

    expect(screen.getByTestId('player-overlay')).toBeTruthy();
    expect(screen.getByText('The Movie')).toBeTruthy();
    expect(
      screen.getByTestId('player-overlay-seek-elapsed').props.children,
    ).toBe('12:34');
    expect(
      screen.getByTestId('player-overlay-seek-remaining').props.children,
    ).toBe('-1:17:26');

    // On the overlay, OK presses the focused button instead.
    pressOk('select');
    expect(player.play).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('player-overlay-playpause'));
    expect(player.play).toHaveBeenCalledTimes(1);
    player.paused = false;
    fire(player, 'playing');
    // Leanback's controls stay a moment after playback restarts.
    expect(screen.getByTestId('player-overlay')).toBeTruthy();
    act(() => jest.advanceTimersByTime(HIDE_AFTER_PLAY_MS));
    expect(screen.queryByTestId('player-overlay')).toBeNull();
  });

  it("pauses on OK's release, so the release can't press the overlay's Play", async () => {
    const {player} = await renderPlaying();
    player.paused = false;
    fire(player, 'playing');

    // The release of the OK that opened the player does nothing.
    pressKey('select', 1);
    expect(player.pause).not.toHaveBeenCalled();

    // A long press repeats the press; it pauses once, on the release.
    pressKey('select', 0);
    pressKey('select', 0);
    expect(player.pause).not.toHaveBeenCalled();
    expect(screen.queryByTestId('player-overlay')).toBeNull();
    pressKey('select', 1);
    expect(player.pause).toHaveBeenCalledTimes(1);
    player.paused = true;
    fire(player, 'pause');
    expect(screen.getByTestId('player-overlay')).toBeTruthy();

    // OK on the overlay presses Play; its release (overlay gone) doesn't pause.
    pressKey('select', 0);
    fireEvent.press(screen.getByTestId('player-overlay-playpause'));
    player.paused = false;
    fire(player, 'playing');
    pressKey('select', 1);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('handles the play/pause key and ignores key releases', async () => {
    const {player} = await renderPlaying();
    player.paused = false;
    fire(player, 'playing');

    pressKey('playpause', 1);
    expect(player.pause).not.toHaveBeenCalled();
    pressKey('playpause');
    expect(player.pause).toHaveBeenCalledTimes(1);
  });

  it('toggles pause on Enter, which the simulator sends for OK', async () => {
    const {player} = await renderPlaying();
    player.paused = false;
    fire(player, 'playing');

    pressOk('enter');
    expect(player.pause).toHaveBeenCalledTimes(1);
    player.paused = true;
    fire(player, 'pause');
    expect(screen.getByTestId('player-overlay')).toBeTruthy();

    pressOk('enter');
    expect(player.play).not.toHaveBeenCalled();
  });

  it("toggles pause on `play`, the Fire TV remote's play/pause key", async () => {
    const {player} = await renderPlaying();
    player.paused = false;
    fire(player, 'playing');

    pressKey('play');
    expect(player.pause).toHaveBeenCalledTimes(1);
    player.paused = true;
    fire(player, 'pause');

    pressKey('play');
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('keeps the overlay while loading after a seek', async () => {
    const {player} = await renderPlaying();
    player.paused = false;
    fire(player, 'playing');
    fire(player, 'seeking');
    expect(screen.getByTestId('player-overlay')).toBeTruthy();
    expect(screen.getByTestId('player-loading')).toBeTruthy();
  });

  it('shows Play, not Pause, while a seek loads during a pause', async () => {
    const {player} = await renderPlaying();
    player.duration = 5400;
    player.paused = false;
    fire(player, 'loadedmetadata', 'playing');
    fire(player, 'seeking');
    expect(
      screen.getByTestId('player-overlay-playpause').props.accessibilityLabel,
    ).toBe('Pause');
    fire(player, 'seeked', 'playing');

    pressKey('pause');
    player.paused = true;
    fire(player, 'pause', 'seeking');
    expect(screen.getByTestId('player-loading')).toBeTruthy();
    expect(
      screen.getByTestId('player-overlay-playpause').props.accessibilityLabel,
    ).toBe('Play');
  });

  it('shows a player error with Retry, which resolves a new session', async () => {
    const {player} = await renderPlaying();
    player.paused = false;
    fire(player, 'playing');
    player.setPosition(30);
    player.error = {code: 2, message: 'socket'};
    fire(player, 'error');

    expect(
      screen.getByText(
        'A network error stopped playback. Check the connection to the server.',
      ),
    ).toBeTruthy();
    expect(reporter.stop).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('player-retry'));
    await flush();
    expect(resolvePlayback).toHaveBeenLastCalledWith(session.api, {
      itemId: 'm1',
      userId: 'u1',
      startMs: 30000,
    });
    expect(player.deinitialize).toHaveBeenCalled();
    // The next controller gets the surface that's still on screen.
    const next = Fake.instances.at(-1)!;
    expect(next).not.toBe(player);
    expect(next.setSurfaceHandle).toHaveBeenCalledWith('surface-1');
  });

  it('goes back when playback ends', async () => {
    const {player} = await renderPlaying();
    player.paused = false;
    fire(player, 'playing', 'ended');
    expect(reporter.stop).toHaveBeenCalled();
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('destroys the controller and refreshes Details and Home on unmount', async () => {
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const {view, player} = await renderPlaying();
    player.paused = false;
    fire(player, 'playing');

    view.unmount();
    expect(reporter.stop).toHaveBeenCalled();
    await flush();
    expect(player.deinitialize).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: detailsKeys.item(session.server.id, 'u1', 'm1'),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: homeKeys.all(session.server.id, 'u1'),
    });
  });

  it('waits for the stopped report before refreshing', async () => {
    const stopped = deferred<void>();
    reporter.stop.mockReturnValueOnce(stopped.promise);
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const {view, player} = await renderPlaying();
    player.paused = false;
    fire(player, 'playing');

    view.unmount();
    await flush();
    expect(invalidate).not.toHaveBeenCalled();
    stopped.resolve();
    await flush();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

describe('PlayerScreen tracks', () => {
  const VTT_EN = 'http://server/en.vtt?api_key=t';
  const VTT_PT = 'http://server/pt.vtt?api_key=t';
  const VTT_BAD = 'http://server/bad.vtt?api_key=t';
  const FILES: Record<string, string> = {
    [VTT_EN]:
      'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello\n\n00:00:05.000 --> 00:00:06.000\nSecond line',
    [VTT_PT]: 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nOlá',
  };

  const TRACKED: PlaybackSession = {
    ...SESSION,
    audioStreamIndex: 1,
    subtitleStreamIndex: 3,
    audioTracks: [
      {index: 1, label: 'English - AAC'},
      {index: 2, label: 'Commentary - AAC'},
    ],
    subtitleTracks: [
      {index: 3, label: 'English - SRT', delivery: 'external', vttUrl: VTT_EN},
      {
        index: 4,
        label: 'Portuguese - SRT',
        delivery: 'external',
        vttUrl: VTT_PT,
      },
      {index: 5, label: 'Signs - ASS', delivery: 'burn-in'},
      {index: 6, label: 'Broken - SRT', delivery: 'external', vttUrl: VTT_BAD},
    ],
  };

  const fetchGlobal = global as unknown as {fetch: unknown};
  const realFetch = fetchGlobal.fetch;
  const fetchMock = jest.fn((url: string) =>
    Promise.resolve(
      url in FILES
        ? {ok: true, status: 200, text: () => Promise.resolve(FILES[url])}
        : {ok: false, status: 404, text: () => Promise.resolve('')},
    ),
  );

  beforeEach(() => {
    clearSubtitleCache();
    fetchMock.mockClear();
    fetchGlobal.fetch = fetchMock;
    jest
      .mocked(resolvePlayback)
      .mockResolvedValue({kind: 'play', session: TRACKED});
  });

  afterAll(() => {
    fetchGlobal.fetch = realFetch;
  });

  const play = (player: FakePlayer) => {
    player.duration = 5400;
    player.paused = false;
    fire(player, 'loadedmetadata', 'playing');
  };

  /** Plays, then pauses at `seconds`: the overlay shows. */
  const renderPaused = async (seconds = 754) => {
    const result = await renderPlaying();
    play(result.player);
    result.player.setPosition(seconds);
    pressKey('pause');
    result.player.paused = true;
    fire(result.player, 'pause');
    await flush();
    return result;
  };

  const pause = (player: FakePlayer) => {
    pressKey('pause');
    player.paused = true;
    fire(player, 'pause');
  };

  /** Presses the overlay's Play and lets the player start again. */
  const resume = (player: FakePlayer) => {
    fireEvent.press(screen.getByTestId('player-overlay-playpause'));
    player.paused = false;
    fire(player, 'playing');
  };

  const subtitleText = () =>
    screen.queryAllByTestId(/^subtitle-view-line-\d+-\d+$/).map((line) =>
      [line.props.children]
        .flat()
        .map((span: {props: {children: string}}) => span.props.children)
        .join(''),
    );

  describe('overlay buttons', () => {
    it('focuses Play first and shows Subtitles and Audio', async () => {
      await renderPaused();
      const play = screen.getByTestId('player-overlay-playpause');
      expect(play.props.hasTVPreferredFocus).toBe(true);
      expect(
        screen.getByTestId('player-overlay-subtitles').props
          .hasTVPreferredFocus,
      ).toBeFalsy();
      expect(screen.getByTestId('player-overlay-audio')).toBeTruthy();
    });

    it('hides Audio with one audio track and Subtitles with none', async () => {
      jest.mocked(resolvePlayback).mockResolvedValue({
        kind: 'play',
        session: {
          ...TRACKED,
          audioTracks: [TRACKED.audioTracks![0]],
          subtitleTracks: [],
        },
      });
      await renderPaused();
      expect(screen.getByTestId('player-overlay-playpause')).toBeTruthy();
      expect(screen.queryByTestId('player-overlay-audio')).toBeNull();
      expect(screen.queryByTestId('player-overlay-subtitles')).toBeNull();
    });

    it('lets the play key resume from the overlay, but not Select', async () => {
      const {player} = await renderPaused();
      pressOk('select');
      pressOk('enter');
      expect(player.play).not.toHaveBeenCalled();
      pressKey('play');
      expect(player.play).toHaveBeenCalledTimes(1);
    });
  });

  describe('pickers', () => {
    it('opens Subtitles on the current track and Back closes only the picker', async () => {
      const {player} = await renderPaused();
      fireEvent.press(screen.getByTestId('player-overlay-subtitles'));

      expect(screen.getByTestId('player-subtitle-picker')).toBeTruthy();
      expect(screen.getByText('None')).toBeTruthy();
      expect(
        screen.getByTestId('player-subtitle-picker-row-3').props
          .hasTVPreferredFocus,
      ).toBe(true);
      expect(
        screen.getByTestId('player-subtitle-picker-row-3-check'),
      ).toBeTruthy();

      // Neither OK nor the play key reaches the player under the picker.
      pressOk('select');
      pressKey('play');
      expect(player.play).not.toHaveBeenCalled();

      act(() => {
        pressBack();
      });
      expect(screen.queryByTestId('player-subtitle-picker')).toBeNull();
      expect(screen.getByTestId('player-overlay')).toBeTruthy();
      expect(goBack).not.toHaveBeenCalled();
      // Focus goes back to Subtitles.
      expect(
        screen.getByTestId('player-overlay-subtitles').props
          .hasTVPreferredFocus,
      ).toBe(true);
      expect(
        screen.getByTestId('player-overlay-playpause').props
          .hasTVPreferredFocus,
      ).toBe(false);
    });

    it('opens Audio on the current track; the same track just closes', async () => {
      await renderPaused();
      fireEvent.press(screen.getByTestId('player-overlay-audio'));
      expect(
        screen.getByTestId('player-audio-picker-row-1-check'),
      ).toBeTruthy();
      expect(screen.queryByText('None')).toBeNull();

      fireEvent.press(screen.getByTestId('player-audio-picker-row-1'));
      await flush();
      expect(screen.queryByTestId('player-audio-picker')).toBeNull();
      expect(resolvePlayback).toHaveBeenCalledTimes(1);
      expect(
        screen.getByTestId('player-overlay-audio').props.hasTVPreferredFocus,
      ).toBe(true);
    });
  });

  describe('client-side subtitle switch', () => {
    it('switches external → external → off without a new session', async () => {
      const {player} = await renderPaused(2);
      // Above the overlay's controls.
      expect(subtitleText()).toEqual(['Hello']);

      fireEvent.press(screen.getByTestId('player-overlay-subtitles'));
      fireEvent.press(screen.getByTestId('player-subtitle-picker-row-4'));
      await flush();
      expect(screen.queryByTestId('player-subtitle-picker')).toBeNull();
      expect(subtitleText()).toEqual(['Olá']);
      expect(fetchMock).toHaveBeenLastCalledWith(VTT_PT, expect.anything());
      // The controller reports the new index right away.
      expect(reporter.update).toHaveBeenCalled();
      const report = jest.mocked(createPlaybackReporter).mock.calls[0][2];
      expect(report()).toMatchObject({
        audioStreamIndex: 1,
        subtitleStreamIndex: 4,
      });
      resume(player);
      expect(subtitleText()).toEqual(['Olá']);

      pause(player);
      fireEvent.press(screen.getByTestId('player-overlay-subtitles'));
      expect(
        screen.getByTestId('player-subtitle-picker-row-4-check'),
      ).toBeTruthy();
      fireEvent.press(screen.getByTestId('player-subtitle-picker-row--1'));
      await flush();
      expect(report().subtitleStreamIndex).toBe(-1);
      resume(player);
      expect(subtitleText()).toEqual([]);

      expect(resolvePlayback).toHaveBeenCalledTimes(1);
      expect(Fake.instances).toEqual([player]);
      // Only the overlay's Play resumed.
      expect(player.play).toHaveBeenCalledTimes(2);
    });

    it('keeps a client-side pick across Retry', async () => {
      const {player} = await renderPaused();
      fireEvent.press(screen.getByTestId('player-overlay-subtitles'));
      fireEvent.press(screen.getByTestId('player-subtitle-picker-row-4'));
      await flush();

      player.error = {code: 2, message: 'socket'};
      fire(player, 'error');
      fireEvent.press(screen.getByTestId('player-retry'));
      await flush();
      expect(resolvePlayback).toHaveBeenLastCalledWith(session.api, {
        itemId: 'm1',
        mediaSourceId: 'source-1',
        userId: 'u1',
        startMs: 754000,
        subtitleStreamIndex: 4,
      });
    });
  });

  describe('re-resolving switches', () => {
    it('stops the old controller before resolving an audio switch at the paused position', async () => {
      const {player} = await renderPaused();
      const stopped = deferred<void>();
      reporter.stop.mockReturnValueOnce(stopped.promise);
      const next = deferred<PlaybackResolution>();
      jest.mocked(resolvePlayback).mockReturnValueOnce(next.promise);

      fireEvent.press(screen.getByTestId('player-overlay-audio'));
      fireEvent.press(screen.getByTestId('player-audio-picker-row-2'));
      expect(screen.queryByTestId('player-audio-picker')).toBeNull();
      expect(screen.getByTestId('player-loading')).toBeTruthy();
      expect(reporter.stop).toHaveBeenCalled();
      await flush();
      expect(player.deinitialize).toHaveBeenCalled();
      // Waits for the stopped report (it ends the transcode).
      expect(resolvePlayback).toHaveBeenCalledTimes(1);

      stopped.resolve();
      await flush();
      expect(resolvePlayback).toHaveBeenCalledTimes(2);
      // Names the source: without it, the server ignores the indexes and
      // applies the user's remembered tracks.
      expect(resolvePlayback).toHaveBeenLastCalledWith(session.api, {
        itemId: 'm1',
        mediaSourceId: 'source-1',
        userId: 'u1',
        startMs: 754000,
        audioStreamIndex: 2,
        subtitleStreamIndex: 3,
      });
      expect(Fake.instances).toHaveLength(1);

      next.resolve({
        kind: 'play',
        session: {...TRACKED, audioStreamIndex: 2, startMs: 754000},
      });
      await flush();
      expect(Fake.instances).toHaveLength(2);
      const fresh = Fake.instances[1];
      expect(fresh.setSurfaceHandle).toHaveBeenCalledWith('surface-1');
      expect(fresh.autoplay).toBe(false);
      // Up until the new session plays, so Back doesn't leave meanwhile.
      expect(screen.getByTestId('player-overlay')).toBeTruthy();
    });

    it.each([
      ['to a burn-in subtitle', 3, 5],
      ['from the burned-in subtitle', 5, 4],
      ['from the burned-in subtitle to off', 5, -1],
    ])('re-resolves %s', async (_name, from, to) => {
      jest.mocked(resolvePlayback).mockResolvedValue({
        kind: 'play',
        session: {...TRACKED, subtitleStreamIndex: from},
      });
      const {player} = await renderPaused(60);
      const order: string[] = [];
      player.deinitialize.mockImplementation(() => {
        order.push('deinitialize');
        return Promise.resolve();
      });
      jest.mocked(resolvePlayback).mockImplementation(() => {
        order.push('resolve');
        return Promise.resolve({
          kind: 'play',
          session: {...TRACKED, subtitleStreamIndex: to},
        });
      });

      fireEvent.press(screen.getByTestId('player-overlay-subtitles'));
      fireEvent.press(screen.getByTestId(`player-subtitle-picker-row-${to}`));
      await flush();

      expect(order).toEqual(['deinitialize', 'resolve']);
      expect(resolvePlayback).toHaveBeenLastCalledWith(session.api, {
        itemId: 'm1',
        mediaSourceId: 'source-1',
        userId: 'u1',
        startMs: 60000,
        audioStreamIndex: 1,
        subtitleStreamIndex: to,
      });
      expect(Fake.instances).toHaveLength(2);
    });

    it('keeps the chosen tracks on Retry after a failed switch', async () => {
      await renderPaused();
      jest
        .mocked(resolvePlayback)
        .mockRejectedValueOnce(new Error('Network Error'));
      fireEvent.press(screen.getByTestId('player-overlay-audio'));
      fireEvent.press(screen.getByTestId('player-audio-picker-row-2'));
      await flush();
      expect(screen.getByText(RESOLVE_ERROR_MESSAGE)).toBeTruthy();

      fireEvent.press(screen.getByTestId('player-retry'));
      await flush();
      expect(resolvePlayback).toHaveBeenLastCalledWith(session.api, {
        itemId: 'm1',
        mediaSourceId: 'source-1',
        userId: 'u1',
        startMs: 754000,
        audioStreamIndex: 2,
        subtitleStreamIndex: 3,
      });
      expect(Fake.instances).toHaveLength(2);
    });

    it('lets a second switch win over a pending one', async () => {
      await renderPaused();
      const first = deferred<PlaybackResolution>();
      const second = deferred<PlaybackResolution>();
      jest
        .mocked(resolvePlayback)
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);

      fireEvent.press(screen.getByTestId('player-overlay-audio'));
      fireEvent.press(screen.getByTestId('player-audio-picker-row-2'));
      await flush();
      // The overlay stays up while it reloads, with the pending choice.
      fireEvent.press(screen.getByTestId('player-overlay-audio'));
      expect(
        screen.getByTestId('player-audio-picker-row-2-check'),
      ).toBeTruthy();
      fireEvent.press(screen.getByTestId('player-audio-picker-row-1'));
      await flush();
      expect(resolvePlayback).toHaveBeenLastCalledWith(session.api, {
        itemId: 'm1',
        mediaSourceId: 'source-1',
        userId: 'u1',
        startMs: 754000,
        audioStreamIndex: 1,
        subtitleStreamIndex: 3,
      });

      first.resolve({
        kind: 'play',
        session: {...TRACKED, audioStreamIndex: 2, url: 'http://first'},
      });
      await flush();
      expect(Fake.instances).toHaveLength(1);
      second.resolve({
        kind: 'play',
        session: {...TRACKED, audioStreamIndex: 1, url: 'http://second'},
      });
      await flush();
      expect(Fake.instances).toHaveLength(2);
      expect(Fake.instances[1].srcSets).toEqual(['http://second']);
    });

    it('starts nothing when the screen closes during a switch', async () => {
      const stopped = deferred<void>();
      const {view} = await renderPaused();
      reporter.stop.mockReturnValueOnce(stopped.promise);
      fireEvent.press(screen.getByTestId('player-overlay-audio'));
      fireEvent.press(screen.getByTestId('player-audio-picker-row-2'));
      view.unmount();
      stopped.resolve();
      await flush();
      expect(resolvePlayback).toHaveBeenCalledTimes(1);
      expect(Fake.instances).toHaveLength(1);
    });

    it('drops a resolve that answers after the screen closed', async () => {
      const {view} = await renderPaused();
      const next = deferred<PlaybackResolution>();
      jest.mocked(resolvePlayback).mockReturnValueOnce(next.promise);
      fireEvent.press(screen.getByTestId('player-overlay-audio'));
      fireEvent.press(screen.getByTestId('player-audio-picker-row-2'));
      await flush();
      expect(resolvePlayback).toHaveBeenCalledTimes(2);
      view.unmount();
      next.resolve({kind: 'play', session: TRACKED});
      await flush();
      expect(Fake.instances).toHaveLength(1);
    });
  });

  describe('subtitles under the overlay', () => {
    /** Lays out the overlay's controls `top` dp... below the fade and padding. */
    const layOutControls = (y = 600) => {
      fireEvent(screen.getByTestId('player-overlay-controls'), 'layout', {
        nativeEvent: {layout: {x: 0, y, width: 1920, height: 400}},
      });
      // PlayerOverlay adds its fade bands and top padding to the view's y.
      return y + 8 * px(12) + px(16);
    };

    const liftedHeight = () => {
      // The preset's StyleSheet.flatten is a stub; merge by hand.
      const style: object[] = [
        screen.getByTestId('player-subtitles-lifted').props.style,
      ].flat();
      return Object.assign({}, ...style).height;
    };

    it('lifts the cue above the controls while paused and puts it back when the overlay hides', async () => {
      jest.useFakeTimers();
      const {player} = await renderPlaying();
      play(player);
      await flush();
      player.setPosition(2);
      fire(player, 'timeupdate');
      expect(subtitleText()).toEqual(['Hello']);
      expect(screen.queryByTestId('player-subtitles-lifted')).toBeNull();

      pause(player);
      const top = layOutControls();
      expect(subtitleText()).toEqual(['Hello']);
      expect(liftedHeight()).toBe(top - SUBTITLE_CONTROLS_GAP);

      resume(player);
      expect(screen.getByTestId('player-subtitles-lifted')).toBeTruthy();
      act(() => jest.advanceTimersByTime(HIDE_AFTER_PLAY_MS));
      expect(screen.queryByTestId('player-overlay')).toBeNull();
      expect(screen.queryByTestId('player-subtitles-lifted')).toBeNull();
      expect(subtitleText()).toEqual(['Hello']);
    });

    it('draws the cue at the position playback resumes from', async () => {
      const {player} = await renderPlaying();
      play(player);
      player.setPosition(2);
      fire(player, 'timeupdate');
      await flush();
      pause(player);

      player.setPosition(5.5);
      resume(player);
      expect(subtitleText()).toEqual(['Second line']);
    });

    it('keeps the cue while a picker is open', async () => {
      await renderPaused(2);
      fireEvent.press(screen.getByTestId('player-overlay-subtitles'));
      expect(screen.getByTestId('player-subtitle-picker')).toBeTruthy();
      expect(subtitleText()).toEqual(['Hello']);
      pressBack();
      expect(screen.queryByTestId('player-subtitle-picker')).toBeNull();
      expect(subtitleText()).toEqual(['Hello']);
    });

    it('hides the cue while scrubbing, under the thumbnail', async () => {
      await renderPaused(2);
      const bar = screen.getByTestId('player-overlay-seek-bar');
      fireEvent(bar, 'focus');
      pressKey('right');
      expect(screen.getByTestId('player-overlay-seek-cursor')).toBeTruthy();
      expect(subtitleText()).toEqual([]);

      fireEvent(bar, 'blur');
      expect(subtitleText()).toEqual(['Hello']);
    });

    it('keeps the cue while loading after a seek', async () => {
      const {player} = await renderPlaying();
      play(player);
      player.setPosition(2);
      fire(player, 'timeupdate');
      await flush();

      fire(player, 'seeking');
      expect(screen.getByTestId('player-overlay')).toBeTruthy();
      player.setPosition(5.5);
      fire(player, 'seeked', 'playing');
      expect(subtitleText()).toEqual(['Second line']);
    });

    it("doesn't refetch the track while hidden", async () => {
      const {player} = await renderPaused(2);
      resume(player);
      pause(player);
      resume(player);
      expect(subtitleText()).toEqual(['Hello']);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('says the track is loading: in the overlay when it is up, where subtitles go when not', async () => {
      jest.useFakeTimers();
      const file = deferred<{
        ok: boolean;
        status: number;
        text: () => Promise<string>;
      }>();
      fetchMock.mockReturnValueOnce(file.promise as never);
      const {player} = await renderPlaying();
      play(player);
      await flush();
      expect(
        screen.getByTestId('player-subtitles-loading').props.children,
      ).toBe('Loading subtitles…');

      pause(player);
      expect(screen.getByTestId('player-overlay-hint').props.children).toBe(
        'Loading subtitles…',
      );
      expect(screen.queryByTestId('player-subtitles-loading')).toBeNull();

      file.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(FILES[VTT_EN]),
      });
      await flush();
      expect(screen.queryByTestId('player-overlay-hint')).toBeNull();
      expect(screen.queryByTestId('player-subtitles-loading')).toBeNull();
    });

    it('shows no hint after a failed load', async () => {
      jest.mocked(resolvePlayback).mockResolvedValue({
        kind: 'play',
        session: {...TRACKED, subtitleStreamIndex: 6},
      });
      await renderPaused(2);
      expect(screen.queryByTestId('player-overlay-hint')).toBeNull();
      expect(screen.queryByTestId('player-subtitles-loading')).toBeNull();
    });
  });

  describe('overlay visibility', () => {
    /** Playing at 100 s with the overlay hidden. */
    const renderHidden = async () => {
      jest.useFakeTimers();
      const result = await renderPlaying();
      play(result.player);
      result.player.setPosition(100);
      fire(result.player, 'timeupdate');
      await flush();
      expect(screen.queryByTestId('player-overlay')).toBeNull();
      return result;
    };

    const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

    it.each(['left', 'right'])(
      'shows on %s with the seek bar focused, without a scrub step',
      async (key) => {
        const {player} = await renderHidden();
        pressKey(key);
        pressKey(key, 1);
        expect(screen.getByTestId('player-overlay')).toBeTruthy();
        const bar = screen.getByTestId('player-overlay-seek-bar');
        expect(bar.props.hasTVPreferredFocus).toBe(true);
        expect(screen.queryByTestId('player-overlay-seek-cursor')).toBeNull();
        expect(player.seeks).toEqual([]);
        // It shows the position now, though it skipped renders while hidden.
        expect(
          screen.getByTestId('player-overlay-seek-elapsed').props.children,
        ).toBe('1:40');

        // Once focused, the next press scrubs.
        fireEvent(bar, 'focus');
        pressKey(key);
        expect(screen.getByTestId('player-overlay-seek-cursor')).toBeTruthy();
      },
    );

    it.each(['up', 'down'])(
      'shows on %s with Play/Pause focused',
      async (key) => {
        const {player} = await renderHidden();
        pressKey(key);
        expect(
          screen.getByTestId('player-overlay-playpause').props
            .hasTVPreferredFocus,
        ).toBe(true);
        expect(player.pause).not.toHaveBeenCalled();
        expect(player.play).not.toHaveBeenCalled();
      },
    );

    it('hides after a few seconds with no input while playing; input starts the wait over', async () => {
      await renderHidden();
      pressKey('up');
      advance(HIDE_AFTER_INPUT_MS - 1000);
      pressKey('left');
      advance(HIDE_AFTER_INPUT_MS - 1);
      expect(screen.getByTestId('player-overlay')).toBeTruthy();
      advance(1);
      expect(screen.queryByTestId('player-overlay')).toBeNull();

      // Focus moving inside the overlay counts too.
      pressKey('up');
      advance(HIDE_AFTER_INPUT_MS - 1000);
      fireEvent(screen.getByTestId('player-overlay-rewind'), 'focus');
      advance(HIDE_AFTER_INPUT_MS - 1);
      expect(screen.getByTestId('player-overlay')).toBeTruthy();
      advance(1);
      expect(screen.queryByTestId('player-overlay')).toBeNull();
    });

    it('stays while paused', async () => {
      const {player} = await renderHidden();
      pause(player);
      advance(60_000);
      expect(screen.getByTestId('player-overlay')).toBeTruthy();
    });

    it('stays while a picker is open, and waits again once it closes', async () => {
      await renderHidden();
      pressKey('up');
      fireEvent.press(screen.getByTestId('player-overlay-speed'));
      advance(60_000);
      expect(screen.getByTestId('player-speed-picker')).toBeTruthy();
      expect(pressBack()).toBe(true);
      expect(screen.queryByTestId('player-speed-picker')).toBeNull();
      advance(HIDE_AFTER_INPUT_MS - 1);
      expect(screen.getByTestId('player-overlay')).toBeTruthy();
      advance(1);
      expect(screen.queryByTestId('player-overlay')).toBeNull();
    });

    it('stays while scrubbing', async () => {
      await renderHidden();
      pressKey('right');
      fireEvent(screen.getByTestId('player-overlay-seek-bar'), 'focus');
      pressKey('right');
      advance(60_000);
      expect(screen.getByTestId('player-overlay-seek-cursor')).toBeTruthy();
    });

    it('hides on Back, then Back leaves the player', async () => {
      await renderHidden();
      pressKey('down');
      expect(pressBack()).toBe(true);
      expect(screen.queryByTestId('player-overlay')).toBeNull();
      expect(pressBack()).toBe(false);
    });

    it('hides on Back while paused, which stays paused until OK', async () => {
      const {player} = await renderHidden();
      pause(player);
      expect(pressBack()).toBe(true);
      expect(screen.queryByTestId('player-overlay')).toBeNull();
      expect(player.play).not.toHaveBeenCalled();

      pressOk('select');
      expect(player.play).toHaveBeenCalledTimes(1);
    });

    it('lets OK toggle pause only while hidden', async () => {
      const {player} = await renderHidden();
      pressKey('up');
      pressOk('select');
      expect(player.pause).not.toHaveBeenCalled();
      expect(pressBack()).toBe(true);
      pressOk('select');
      expect(player.pause).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['skip_forward', 130],
      ['fastforward', 130],
      ['skip_backward', 90],
      ['rewind', 90],
    ])(
      'seeks on the remote %s key with the overlay hidden and shows it',
      async (key, seconds) => {
        const {player} = await renderHidden();
        pressKey(key);
        expect(player.seeks).toEqual([seconds]);
        expect(screen.getByTestId('player-overlay')).toBeTruthy();
        advance(HIDE_AFTER_INPUT_MS);
        expect(screen.queryByTestId('player-overlay')).toBeNull();
      },
    );

    it('adds up held fast-forward / rewind presses', async () => {
      const {player} = await renderHidden();
      pressKey('skip_forward');
      pressKey('skip_forward');
      pressKey('skip_forward', 1);
      pressKey('skip_backward');
      expect(player.seeks).toEqual([130, 160, 150]);
    });

    it('ignores the fast-forward and rewind keys while a picker is open', async () => {
      const {player} = await renderPaused(100);
      fireEvent.press(screen.getByTestId('player-overlay-audio'));
      pressKey('skip_forward');
      pressKey('skip_backward');
      expect(player.seeks).toEqual([]);
    });

    it('seeks from the Rewind / Fast forward buttons', async () => {
      const {player} = await renderPaused(100);
      fireEvent.press(screen.getByTestId('player-overlay-fastforward'));
      fireEvent.press(screen.getByTestId('player-overlay-rewind'));
      expect(player.seeks).toEqual([130, 120]);
    });

    it('seeks from the seek bar and shows the target right away', async () => {
      const {player} = await renderPaused(100);
      const bar = screen.getByTestId('player-overlay-seek-bar');
      fireEvent(bar, 'focus');
      pressKey('right');
      pressKey('right');
      pressOk('select');
      expect(player.seeks).toEqual([160]);
      expect(
        screen.getByTestId('player-overlay-seek-elapsed').props.children,
      ).toBe('2:40');
      // OK on the overlay never toggles pause.
      expect(player.play).not.toHaveBeenCalled();
    });

    it('stays up during a track-switch reload; Back then hides it instead of leaving', async () => {
      await renderPaused();
      jest
        .mocked(resolvePlayback)
        .mockReturnValueOnce(deferred<PlaybackResolution>().promise);
      fireEvent.press(screen.getByTestId('player-overlay-audio'));
      fireEvent.press(screen.getByTestId('player-audio-picker-row-2'));
      await flush();
      expect(screen.getByTestId('player-loading')).toBeTruthy();
      expect(screen.getByTestId('player-overlay')).toBeTruthy();

      expect(pressBack()).toBe(true);
      expect(screen.queryByTestId('player-overlay')).toBeNull();
      expect(pressBack()).toBe(false);
    });
  });

  describe('speed and zoom', () => {
    const speedOf = (player: FakePlayer) => player.playbackRate;

    it('applies the picked speed and keeps it for Retry and the next player', async () => {
      const {player, view} = await renderPaused();
      fireEvent.press(screen.getByTestId('player-overlay-speed'));
      const rows = screen
        .getAllByRole('radio')
        .map((row) => row.props.accessibilityLabel);
      expect(rows).toEqual([
        '0.25x',
        '0.50x',
        '0.75x',
        '1.00x',
        '1.25x',
        '1.50x',
        '1.75x',
        '2.00x',
      ]);
      expect(
        screen.getByTestId('player-speed-picker-row-3-check'),
      ).toBeTruthy();

      fireEvent.press(screen.getByTestId('player-speed-picker-row-5'));
      expect(screen.queryByTestId('player-speed-picker')).toBeNull();
      expect(speedOf(player)).toBe(1.5);
      expect(screen.UNSAFE_getByType(PlayerOverlay).props.playbackSpeed).toBe(
        1.5,
      );
      expect(
        screen.getByTestId('player-overlay-speed').props.hasTVPreferredFocus,
      ).toBe(true);

      player.error = {code: 2, message: 'socket'};
      fire(player, 'error');
      fireEvent.press(screen.getByTestId('player-retry'));
      await flush();
      const retried = Fake.instances.at(-1)!;
      expect(retried).not.toBe(player);
      expect(retried.defaultPlaybackRate).toBe(1.5);

      view.unmount();
      await flush();
      const next = await renderPaused();
      expect(next.player.defaultPlaybackRate).toBe(1.5);
      fireEvent.press(screen.getByTestId('player-overlay-speed'));
      expect(
        screen.getByTestId('player-speed-picker-row-5-check'),
      ).toBeTruthy();
    });

    it('changes the scaling mode, and starts at Fit on each visit', async () => {
      const {view} = await renderPaused();
      const surface = () => screen.getByTestId('player-surface');
      expect(surface().props.scalingmode).toBe('fit');

      fireEvent.press(screen.getByTestId('player-overlay-zoom'));
      expect(
        screen.getAllByRole('radio').map((row) => row.props.accessibilityLabel),
      ).toEqual(['Normal', 'Auto crop', 'Stretch']);
      fireEvent.press(screen.getByTestId('player-zoom-picker-row-1'));
      expect(surface().props.scalingmode).toBe('fill');
      fireEvent.press(screen.getByTestId('player-overlay-zoom'));
      expect(screen.getByTestId('player-zoom-picker-row-1-check')).toBeTruthy();
      fireEvent.press(screen.getByTestId('player-zoom-picker-row-2'));
      expect(surface().props.scalingmode).toBe('strech');

      view.unmount();
      await flush();
      await renderPaused();
      expect(surface().props.scalingmode).toBe('fit');
    });
  });

  describe('item data', () => {
    const CHAPTERED = {
      Id: 'm1',
      Type: 'Movie',
      Name: 'The Movie (from the server)',
      Chapters: [
        {Name: 'Opening', StartPositionTicks: 0},
        {Name: 'The Heist', StartPositionTicks: 600 * 10_000_000},
        {Name: 'Finale', StartPositionTicks: 1200 * 10_000_000},
      ],
    };

    it('opens the chapter row on the current chapter; a pick seeks, closes and refocuses', async () => {
      jest.mocked(useItemDetails).mockReturnValue({data: CHAPTERED} as never);
      const {player} = await renderPaused(754);
      fireEvent.press(screen.getByTestId('player-overlay-chapters'));
      expect(screen.UNSAFE_getByType(ChapterRow).props.currentIndex).toBe(1);
      expect(screen.getByTestId('player-chapters')).toBeTruthy();
      // The row replaces the overlay, and the cue hides under it.
      expect(screen.queryByTestId('player-overlay')).toBeNull();
      expect(subtitleText()).toEqual([]);

      // The row owns D-pad, OK and the skip keys.
      pressKey('select');
      pressKey('select', 1);
      pressKey('left');
      pressKey('skip_forward');
      pressKey('play');
      expect(player.play).not.toHaveBeenCalled();
      expect(player.pause).toHaveBeenCalledTimes(1);
      expect(player.seeks).toEqual([]);

      fireEvent.press(screen.getByTestId('player-chapters-item-2'));
      expect(player.seeks).toEqual([1200]);
      expect(screen.queryByTestId('player-chapters')).toBeNull();
      expect(
        screen.getByTestId('player-overlay-chapters').props.hasTVPreferredFocus,
      ).toBe(true);
      expect(
        screen.getByTestId('player-overlay-seek-elapsed').props.children,
      ).toBe('20:00');
    });

    it('closes the chapter row on Back without hiding the overlay', async () => {
      jest.mocked(useItemDetails).mockReturnValue({data: CHAPTERED} as never);
      await renderPaused(10);
      fireEvent.press(screen.getByTestId('player-overlay-chapters'));
      expect(screen.UNSAFE_getByType(ChapterRow).props.currentIndex).toBe(0);
      expect(pressBack()).toBe(true);
      expect(screen.queryByTestId('player-chapters')).toBeNull();
      expect(
        screen.getByTestId('player-overlay-chapters').props.hasTVPreferredFocus,
      ).toBe(true);
    });

    it('has no Chapters button without chapters', async () => {
      await renderPaused();
      expect(screen.queryByTestId('player-overlay-chapters')).toBeNull();
    });

    it('titles an episode with its series, then season, episode and name', async () => {
      const {player} = await renderPaused();
      // The route's title while the item loads.
      expect(screen.getByTestId('player-overlay-title').props.children).toBe(
        'The Movie',
      );
      expect(screen.queryByTestId('player-overlay-subtitle')).toBeNull();

      jest.mocked(useItemDetails).mockReturnValue({
        data: {
          Id: 'm1',
          Type: 'Episode',
          Name: 'Pilot',
          SeriesName: 'The Show',
          ParentIndexNumber: 1,
          IndexNumber: 2,
        },
      } as never);
      // Any render picks it up (here a paused position report).
      fire(player, 'timeupdate');
      expect(screen.getByTestId('player-overlay-title').props.children).toBe(
        'The Show',
      );
      expect(screen.getByTestId('player-overlay-subtitle').props.children).toBe(
        'S1:E2 · Pilot',
      );
    });

    it('builds trickplay thumbnails for the playing media source', async () => {
      jest.mocked(useItemDetails).mockReturnValue({
        data: {
          Id: 'm1',
          Type: 'Movie',
          Trickplay: {
            'source-2': {
              '320': {
                Width: 320,
                Height: 180,
                TileWidth: 10,
                TileHeight: 10,
                ThumbnailCount: 500,
                Interval: 10000,
              },
            },
            'source-1': {
              '320': {
                Width: 320,
                Height: 180,
                TileWidth: 10,
                TileHeight: 10,
                ThumbnailCount: 500,
                Interval: 10000,
              },
            },
          },
        },
      } as never);
      await renderPaused();
      const thumbnailAt =
        screen.UNSAFE_getByType(PlayerOverlay).props.thumbnailAt;
      const tile = thumbnailAt(1_015_000);
      expect(tile.url).toContain('/Videos/m1/Trickplay/320/1.jpg');
      expect(tile.url).toContain('mediaSourceId=source-1');
      expect(tile).toMatchObject({offsetX: 320, offsetY: 0});
    });

    it('has no thumbnails without trickplay for the source', async () => {
      jest.mocked(useItemDetails).mockReturnValue({
        data: {
          Id: 'm1',
          Type: 'Movie',
          Trickplay: {
            'source-2': {
              '320': {
                Width: 320,
                Height: 180,
                TileWidth: 10,
                TileHeight: 10,
                ThumbnailCount: 500,
                Interval: 10000,
              },
            },
          },
        },
      } as never);
      await renderPaused();
      expect(
        screen.UNSAFE_getByType(PlayerOverlay).props.thumbnailAt,
      ).toBeUndefined();
    });

    it('keeps playing when the item fails to load', async () => {
      jest
        .mocked(useItemDetails)
        .mockReturnValue({data: undefined, error: new Error('500')} as never);
      const {player} = await renderPaused();
      expect(screen.getByTestId('player-overlay-title').props.children).toBe(
        'The Movie',
      );
      expect(screen.queryByTestId('player-message')).toBeNull();
      resume(player);
      expect(player.play).toHaveBeenCalledTimes(1);
    });
  });

  describe('drawing subtitles', () => {
    it('follows the position while playing without re-rendering the screen', async () => {
      const {player} = await renderPlaying();
      play(player);
      await flush();
      const renders = jest.spyOn(Surface.prototype, 'render');

      for (const seconds of [0.5, 1.2, 1.5, 2.9]) {
        player.setPosition(seconds);
        fire(player, 'timeupdate');
      }
      expect(subtitleText()).toEqual(['Hello']);
      player.setPosition(4);
      fire(player, 'timeupdate');
      expect(subtitleText()).toEqual([]);
      player.setPosition(5.5);
      fire(player, 'timeupdate');
      expect(subtitleText()).toEqual(['Second line']);
      // The overlay's times didn't move, and the screen never rendered.
      expect(renders).not.toHaveBeenCalled();
      renders.mockRestore();
    });

    it('draws nothing for a burn-in subtitle or off', async () => {
      for (const index of [5, -1]) {
        jest.mocked(resolvePlayback).mockResolvedValue({
          kind: 'play',
          session: {...TRACKED, subtitleStreamIndex: index},
        });
        const {player, view} = await renderPlaying();
        play(player);
        player.setPosition(2);
        fire(player, 'timeupdate');
        await flush();
        expect(screen.queryByTestId('subtitle-view')).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        view.unmount();
        await flush();
      }
    });

    it('keeps playing when the subtitle file fails to load', async () => {
      jest.mocked(resolvePlayback).mockResolvedValue({
        kind: 'play',
        session: {...TRACKED, subtitleStreamIndex: 6},
      });
      const {player} = await renderPlaying();
      play(player);
      player.setPosition(2);
      fire(player, 'timeupdate');
      await flush();
      expect(screen.queryByTestId('subtitle-view')).toBeNull();
      expect(screen.queryByTestId('player-message')).toBeNull();
      expect(player.pause).not.toHaveBeenCalled();
      // The dev warning never carries the URL (it holds the token).
      for (const call of warn.mock.calls) {
        expect(String(call.join(' '))).not.toContain('bad.vtt');
      }
    });
  });
});

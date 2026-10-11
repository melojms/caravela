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

import {detailsKeys} from '../../src/api/details';
import {homeKeys} from '../../src/api/home';
import {useSession} from '../../src/auth/SessionContext';
import {createPlaybackReporter} from '../../src/playback/reporting';
import {clearSubtitleCache} from '../../src/playback/subtitles';
import {
  RESOLVE_ERROR_MESSAGE,
  PlayerScreen,
} from '../../src/screens/PlayerScreen';
import {resolvePlayback} from '../../src/playback/resolver';
import type {
  PlaybackResolution,
  PlaybackSession,
} from '../../src/playback/types';
import {sessionFor} from '../auth/fakes';
import type {
  KeplerVideoSurfaceView as FakeSurfaceView,
  VideoPlayer as FakeVideoPlayer,
} from '../__mocks__/react-native-w3cmedia';

jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
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

const pressKey = (eventType: string, eventKeyAction = 0) => {
  const calls = jest.mocked(useTVEventHandler).mock.calls;
  const handler = calls[calls.length - 1][0] as (event: object) => void;
  act(() => handler({eventType, eventKeyAction}));
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
    expect(screen.getByTestId('player-times').props.children).toBe(
      '12:34 / 1:30:00',
    );

    // On the overlay, OK presses the focused button instead.
    pressOk('select');
    expect(player.play).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('player-play'));
    expect(player.play).toHaveBeenCalledTimes(1);
    player.paused = false;
    fire(player, 'playing');
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
    fireEvent.press(screen.getByTestId('player-play'));
    player.paused = false;
    fire(player, 'playing');
    expect(screen.queryByTestId('player-overlay')).toBeNull();
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

  const lastBackListener = () => {
    const calls = jest.mocked(BackHandler.addEventListener).mock.calls;
    return calls[calls.length - 1][1] as () => boolean;
  };

  const subtitleText = () =>
    screen.queryAllByTestId(/^subtitle-view-line-/).map((line) =>
      [line.props.children]
        .flat()
        .map((span: {props: {children: string}}) => span.props.children)
        .join(''),
    );

  describe('overlay buttons', () => {
    it('focuses Play first and shows Subtitles and Audio', async () => {
      await renderPaused();
      const play = screen.getByTestId('player-play');
      expect(play.props.hasTVPreferredFocus).toBe(true);
      expect(
        screen.getByTestId('player-subtitles').props.hasTVPreferredFocus,
      ).toBeFalsy();
      expect(screen.getByTestId('player-audio')).toBeTruthy();
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
      expect(screen.getByTestId('player-play')).toBeTruthy();
      expect(screen.queryByTestId('player-audio')).toBeNull();
      expect(screen.queryByTestId('player-subtitles')).toBeNull();
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
      fireEvent.press(screen.getByTestId('player-subtitles'));

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
        lastBackListener()();
      });
      expect(screen.queryByTestId('player-subtitle-picker')).toBeNull();
      expect(screen.getByTestId('player-overlay')).toBeTruthy();
      expect(goBack).not.toHaveBeenCalled();
      // Focus goes back to Subtitles.
      expect(
        screen.getByTestId('player-subtitles').props.hasTVPreferredFocus,
      ).toBe(true);
      expect(screen.getByTestId('player-play').props.hasTVPreferredFocus).toBe(
        false,
      );
    });

    it('opens Audio on the current track; the same track just closes', async () => {
      await renderPaused();
      fireEvent.press(screen.getByTestId('player-audio'));
      expect(
        screen.getByTestId('player-audio-picker-row-1-check'),
      ).toBeTruthy();
      expect(screen.queryByText('None')).toBeNull();

      fireEvent.press(screen.getByTestId('player-audio-picker-row-1'));
      await flush();
      expect(screen.queryByTestId('player-audio-picker')).toBeNull();
      expect(resolvePlayback).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('player-audio').props.hasTVPreferredFocus).toBe(
        true,
      );
    });
  });

  describe('client-side subtitle switch', () => {
    it('switches external → external → off without a new session', async () => {
      const {player} = await renderPaused(2);
      expect(subtitleText()).toEqual(['Hello']);

      fireEvent.press(screen.getByTestId('player-subtitles'));
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

      fireEvent.press(screen.getByTestId('player-subtitles'));
      expect(
        screen.getByTestId('player-subtitle-picker-row-4-check'),
      ).toBeTruthy();
      fireEvent.press(screen.getByTestId('player-subtitle-picker-row--1'));
      await flush();
      expect(subtitleText()).toEqual([]);
      expect(report().subtitleStreamIndex).toBe(-1);

      expect(resolvePlayback).toHaveBeenCalledTimes(1);
      expect(Fake.instances).toEqual([player]);
      expect(player.play).not.toHaveBeenCalled();
    });

    it('keeps a client-side pick across Retry', async () => {
      const {player} = await renderPaused();
      fireEvent.press(screen.getByTestId('player-subtitles'));
      fireEvent.press(screen.getByTestId('player-subtitle-picker-row-4'));
      await flush();

      player.error = {code: 2, message: 'socket'};
      fire(player, 'error');
      fireEvent.press(screen.getByTestId('player-retry'));
      await flush();
      expect(resolvePlayback).toHaveBeenLastCalledWith(session.api, {
        itemId: 'm1',
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

      fireEvent.press(screen.getByTestId('player-audio'));
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
      expect(resolvePlayback).toHaveBeenLastCalledWith(session.api, {
        itemId: 'm1',
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
      expect(screen.queryByTestId('player-overlay')).toBeNull();
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

      fireEvent.press(screen.getByTestId('player-subtitles'));
      fireEvent.press(screen.getByTestId(`player-subtitle-picker-row-${to}`));
      await flush();

      expect(order).toEqual(['deinitialize', 'resolve']);
      expect(resolvePlayback).toHaveBeenLastCalledWith(session.api, {
        itemId: 'm1',
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
      fireEvent.press(screen.getByTestId('player-audio'));
      fireEvent.press(screen.getByTestId('player-audio-picker-row-2'));
      await flush();
      expect(screen.getByText(RESOLVE_ERROR_MESSAGE)).toBeTruthy();

      fireEvent.press(screen.getByTestId('player-retry'));
      await flush();
      expect(resolvePlayback).toHaveBeenLastCalledWith(session.api, {
        itemId: 'm1',
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

      fireEvent.press(screen.getByTestId('player-audio'));
      fireEvent.press(screen.getByTestId('player-audio-picker-row-2'));
      await flush();
      // The overlay stays up while it reloads, with the pending choice.
      fireEvent.press(screen.getByTestId('player-audio'));
      expect(
        screen.getByTestId('player-audio-picker-row-2-check'),
      ).toBeTruthy();
      fireEvent.press(screen.getByTestId('player-audio-picker-row-1'));
      await flush();
      expect(resolvePlayback).toHaveBeenLastCalledWith(session.api, {
        itemId: 'm1',
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
      fireEvent.press(screen.getByTestId('player-audio'));
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
      fireEvent.press(screen.getByTestId('player-audio'));
      fireEvent.press(screen.getByTestId('player-audio-picker-row-2'));
      await flush();
      expect(resolvePlayback).toHaveBeenCalledTimes(2);
      view.unmount();
      next.resolve({kind: 'play', session: TRACKED});
      await flush();
      expect(Fake.instances).toHaveLength(1);
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

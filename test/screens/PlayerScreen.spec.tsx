import {useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {
  KeplerVideoSurfaceView,
  VideoPlayer,
} from '@amazon-devices/react-native-w3cmedia';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {act, fireEvent, render, screen} from '@testing-library/react-native';
import {AxiosError, AxiosHeaders} from 'axios';
import React from 'react';

import {detailsKeys} from '../../src/api/details';
import {homeKeys} from '../../src/api/home';
import {useSession} from '../../src/auth/SessionContext';
import {createPlaybackReporter} from '../../src/playback/reporting';
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

  it('toggles pause on Select and shows the overlay with the times', async () => {
    const {player} = await renderPlaying();
    player.duration = 5400;
    player.paused = false;
    fire(player, 'loadedmetadata', 'playing');
    player.setPosition(754);

    pressKey('select');
    expect(player.pause).toHaveBeenCalledTimes(1);
    player.paused = true;
    fire(player, 'pause');

    expect(screen.getByTestId('player-overlay')).toBeTruthy();
    expect(screen.getByText('The Movie')).toBeTruthy();
    expect(screen.getByTestId('player-times').props.children).toBe(
      '12:34 / 1:30:00',
    );

    pressKey('select');
    expect(player.play).toHaveBeenCalledTimes(1);
    player.paused = false;
    fire(player, 'playing');
    expect(screen.queryByTestId('player-overlay')).toBeNull();
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

    pressKey('enter');
    expect(player.pause).toHaveBeenCalledTimes(1);
    player.paused = true;
    fire(player, 'pause');
    expect(screen.getByTestId('player-overlay')).toBeTruthy();

    pressKey('enter');
    expect(player.play).toHaveBeenCalledTimes(1);
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

import type {Api} from '@jellyfin/sdk';
import {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';

import {
  FREEZE_POLL_MS,
  FREEZE_TIMEOUT_MS,
  INIT_ERROR_MESSAGE,
  PlayerController,
  type PlayerListeners,
  type PlayerOptions,
  SEEK_END_MARGIN_MS,
  STALL_TIMEOUT_MESSAGE,
  STALL_TIMEOUT_MS,
  START_TIMEOUT_MESSAGE,
  START_TIMEOUT_MS,
  STUCK_ON_RELEASE_MS,
  UNKNOWN_PLAYER_ERROR,
  mediaErrorMessage,
} from '../../src/playback/PlayerController';
import {createPlaybackReporter} from '../../src/playback/reporting';
import type {PlaybackSession, PlaybackSnapshot} from '../../src/playback/types';
import type {VideoPlayer as FakeVideoPlayer} from '../__mocks__/react-native-w3cmedia';
import shaka, {type FakeShakaPlayer} from '../__mocks__/shaka';

jest.mock('../../src/playback/reporting', () => ({
  createPlaybackReporter: jest.fn(),
}));

type FakePlayer = FakeVideoPlayer;
const Fake = VideoPlayer as unknown as typeof FakeVideoPlayer;
const initializeResult = Fake.initializeResult;

const api = {} as Api;

const SESSION: PlaybackSession = {
  itemId: 'item-1',
  mediaSourceId: 'source-1',
  playSessionId: 'play-1',
  playMethod: 'DirectPlay',
  mode: 'url',
  url: 'http://server/Videos/item-1/stream?static=true',
  startMs: 0,
  durationMs: 7200000,
};

const reporter = {
  start: jest.fn(() => Promise.resolve()),
  update: jest.fn(() => Promise.resolve()),
  stop: jest.fn(() => Promise.resolve()),
};
let getSnapshot: () => PlaybackSnapshot;

let listeners: jest.Mocked<Required<PlayerListeners>>;

const deferred = () => {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};

/** A controller and its fake player, initialized and showing on `surface-1`. */
const setup = async (
  session: Partial<PlaybackSession> = {},
  options?: PlayerOptions,
) => {
  const controller = new PlayerController(
    api,
    {...SESSION, ...session},
    listeners,
    options,
  );
  const player = Fake.instances.at(-1)!;
  controller.attachSurface('surface-1');
  await controller.ready;
  return {controller, player};
};

/** Plays from the start: metadata, then the first `playing`. */
const startPlaying = (player: FakePlayer) => {
  player.duration = 7200;
  player.fire('loadedmetadata');
  player.paused = false;
  player.fire('play');
  player.fire('playing');
};

/**
 * Lets `ms` pass while the position moves 1 s per second, as a playing
 * player's does (no `timeupdate`), so the freeze check stays quiet.
 */
const playOn = (player: FakePlayer, ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    player.setPosition(player.currentTime + 1);
    jest.advanceTimersByTime(Math.min(1000, ms - elapsed));
  }
};

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  Fake.instances.length = 0;
  shaka.Player.instances.length = 0;
  (createPlaybackReporter as jest.Mock).mockImplementation(
    (_api, _session, snapshot) => {
      getSnapshot = snapshot;
      return reporter;
    },
  );
  listeners = {
    onStateChange: jest.fn(),
    onPositionChange: jest.fn(),
    onError: jest.fn(),
  };
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  // The start watchdog's timer; HLS tests flush with a real setImmediate.
  jest.useFakeTimers({doNotFake: ['setImmediate', 'nextTick']});
});

afterEach(() => {
  warn.mockRestore();
  jest.useRealTimers();
});

describe('initialization', () => {
  it('sets the surface only after initialize() resolves, even when the surface comes first', async () => {
    const init = deferred();
    initializeResult.mockReturnValueOnce(init.promise);
    const controller = new PlayerController(api, SESSION, listeners);
    const player = Fake.instances[0];

    controller.attachSurface('surface-1');
    expect(player.initialize).toHaveBeenCalledTimes(1);
    expect(player.setSurfaceHandle).not.toHaveBeenCalled();
    expect(player.addEventListener).not.toHaveBeenCalled();
    expect(player.srcSets).toEqual([]);

    init.resolve();
    await controller.ready;
    expect(player.setSurfaceHandle).toHaveBeenCalledWith('surface-1');
    expect(player.srcSets).toEqual([SESSION.url]);
  });

  it('adds the listeners after initialize() and before setSurfaceHandle', async () => {
    const order: string[] = [];
    const init = deferred();
    initializeResult.mockReturnValueOnce(init.promise);
    const controller = new PlayerController(api, SESSION, listeners);
    const player = Fake.instances[0];
    player.addEventListener.mockImplementation(() => order.push('listen'));
    player.setSurfaceHandle.mockImplementation(() => order.push('surface'));
    controller.attachSurface('surface-1');
    order.push('init');
    init.resolve();
    await controller.ready;

    expect(order[0]).toBe('init');
    expect(order.lastIndexOf('listen')).toBeLessThan(order.indexOf('surface'));
  });

  it('sets src once, with autoplay, after both initialize and the surface', async () => {
    const controller = new PlayerController(api, SESSION, listeners);
    const player = Fake.instances[0];
    await controller.ready;
    expect(player.srcSets).toEqual([]);

    controller.attachSurface('surface-1');
    expect(player.srcSets).toEqual([SESSION.url]);
    expect(player.autoplay).toBe(true);

    // A new surface (e.g. recreated) doesn't reload the source.
    controller.detachSurface('surface-1');
    controller.attachSurface('surface-2');
    expect(player.setSurfaceHandle).toHaveBeenLastCalledWith('surface-2');
    expect(player.srcSets).toEqual([SESSION.url]);
  });

  it('reports a failed initialize() as an error', async () => {
    initializeResult.mockReturnValueOnce(Promise.reject(new Error('no media')));
    const controller = new PlayerController(api, SESSION, listeners);
    const player = Fake.instances[0];
    controller.attachSurface('surface-1');
    await controller.ready;

    expect(listeners.onError).toHaveBeenCalledWith(INIT_ERROR_MESSAGE);
    expect(reporter.stop).toHaveBeenCalled();
    expect(player.setSurfaceHandle).not.toHaveBeenCalled();
    await controller.destroy();
    expect(player.deinitialize).not.toHaveBeenCalled();
  });
});

describe('resume', () => {
  it('seeks once on loadedmetadata, then plays on seeked', async () => {
    const {player} = await setup({startMs: 90000});
    expect(player.autoplay).toBe(false);

    player.fire('loadedmetadata');
    expect(player.seeks).toEqual([90]);
    expect(player.play).not.toHaveBeenCalled();

    player.fire('seeking');
    player.fire('seeked');
    expect(player.play).toHaveBeenCalledTimes(1);

    // A second loadedmetadata doesn't seek again.
    player.fire('loadedmetadata');
    expect(player.seeks).toEqual([90]);
  });

  it("doesn't seek when starting from 0", async () => {
    const {player} = await setup({startMs: 0});
    player.fire('loadedmetadata');
    expect(player.seeks).toEqual([]);
    expect(player.autoplay).toBe(true);
  });
});

describe('reporting', () => {
  it('starts after the first playing only', async () => {
    const {player} = await setup();
    startPlaying(player);
    expect(reporter.start).toHaveBeenCalledTimes(1);

    player.fire('pause');
    player.fire('play');
    player.fire('playing');
    expect(reporter.start).toHaveBeenCalledTimes(1);
  });

  it('waits for the initial seek before starting', async () => {
    const {player} = await setup({startMs: 90000});
    player.fire('loadedmetadata');
    // Vega may report playing while it seeks; that's not the start yet.
    player.fire('playing');
    expect(reporter.start).not.toHaveBeenCalled();

    player.fire('seeked');
    player.paused = false;
    player.fire('playing');
    expect(reporter.start).toHaveBeenCalledTimes(1);
  });

  it('updates on play, pause and seeked', async () => {
    const {controller, player} = await setup();
    startPlaying(player);
    reporter.update.mockClear();

    player.paused = true;
    player.fire('pause');
    expect(reporter.update).toHaveBeenCalledTimes(1);
    player.paused = false;
    player.fire('play');
    expect(reporter.update).toHaveBeenCalledTimes(2);
    controller.seekTo(120000);
    expect(player.seeks).toEqual([120]);
    player.fire('seeking');
    player.fire('seeked');
    expect(reporter.update).toHaveBeenCalledTimes(3);
  });

  it('reads the snapshot from the player (seconds → ms)', async () => {
    const {player} = await setup();
    player.setPosition(61.5);
    player.paused = true;
    expect(getSnapshot()).toEqual({positionMs: 61500, isPaused: true});
  });

  it("sends the session's audio and subtitle indexes in the snapshot", async () => {
    await setup({audioStreamIndex: 1, subtitleStreamIndex: 3});
    expect(getSnapshot()).toMatchObject({
      audioStreamIndex: 1,
      subtitleStreamIndex: 3,
    });
  });

  it('reports a client-side subtitle switch right away', async () => {
    const {controller, player} = await setup({
      audioStreamIndex: 1,
      subtitleStreamIndex: 3,
    });
    startPlaying(player);
    reporter.update.mockClear();

    controller.setSubtitleStreamIndex(4);
    expect(getSnapshot()).toMatchObject({
      audioStreamIndex: 1,
      subtitleStreamIndex: 4,
    });
    expect(reporter.update).toHaveBeenCalledTimes(1);

    controller.setSubtitleStreamIndex(-1);
    expect(getSnapshot().subtitleStreamIndex).toBe(-1);
    expect(reporter.update).toHaveBeenCalledTimes(2);
    // The same index again changes nothing.
    controller.setSubtitleStreamIndex(-1);
    expect(reporter.update).toHaveBeenCalledTimes(2);
  });

  it("doesn't report a subtitle switch after destroy", async () => {
    const {controller, player} = await setup({subtitleStreamIndex: 3});
    startPlaying(player);
    await controller.destroy();
    reporter.update.mockClear();
    controller.setSubtitleStreamIndex(4);
    expect(reporter.update).not.toHaveBeenCalled();
  });

  it('stops on ended', async () => {
    const {player} = await setup();
    startPlaying(player);
    player.fire('ended');
    expect(reporter.stop).toHaveBeenCalledTimes(1);
    expect(listeners.onStateChange).toHaveBeenLastCalledWith('ended');
  });

  it('stops on a fatal error', async () => {
    const {player} = await setup();
    startPlaying(player);
    player.error = {code: 2, message: 'socket closed'};
    player.fire('error');
    expect(reporter.stop).toHaveBeenCalledTimes(1);
    expect(listeners.onError).toHaveBeenCalledWith(
      mediaErrorMessage({code: 2}),
    );
  });

  it('stops on destroy', async () => {
    const {controller, player} = await setup();
    startPlaying(player);
    await controller.destroy();
    expect(reporter.stop).toHaveBeenCalledTimes(1);
  });
});

describe('state', () => {
  it('goes loading → playing → paused → loading (seek) → paused', async () => {
    const {controller, player} = await setup();
    startPlaying(player);
    player.paused = true;
    player.fire('pause');
    controller.seekTo(5000);
    player.fire('seeking');
    player.fire('seeked');
    expect(listeners.onStateChange.mock.calls.map(([state]) => state)).toEqual([
      'playing',
      'paused',
      'loading',
      'paused',
    ]);
    expect(controller.playerState).toBe('paused');
  });

  it('sends the position on timeupdate', async () => {
    const {player} = await setup();
    startPlaying(player);
    player.setPosition(12);
    player.fire('timeupdate');
    expect(listeners.onPositionChange).toHaveBeenLastCalledWith(12000, 7200000);
  });

  it("uses the server's duration until the metadata loads", async () => {
    const {controller} = await setup();
    expect(controller.durationMs).toBe(SESSION.durationMs);
  });

  it('togglePause plays when paused and pauses when playing', async () => {
    const {controller, player} = await setup();
    player.paused = true;
    controller.togglePause();
    expect(player.play).toHaveBeenCalledTimes(1);
    player.paused = false;
    controller.togglePause();
    expect(player.pause).toHaveBeenCalledTimes(1);
  });

  it('ignores controls before the source is set', async () => {
    const controller = new PlayerController(api, SESSION, listeners);
    const player = Fake.instances[0];
    await controller.ready;
    controller.togglePause();
    controller.seekTo(1000);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.seeks).toEqual([]);
  });
});

describe('destroy', () => {
  it('pauses, clears the surface, deinitializes, then removes the listeners', async () => {
    const {controller, player} = await setup();
    const order: string[] = [];
    player.pause.mockImplementation(() => order.push('pause'));
    player.clearSurfaceHandle.mockImplementation(() => order.push('clear'));
    player.deinitialize.mockImplementation(async () => {
      order.push('deinit');
    });
    player.removeEventListener.mockImplementation(() => order.push('remove'));

    await controller.destroy();
    expect(order.slice(0, 3)).toEqual(['pause', 'clear', 'deinit']);
    expect(order.slice(3).every((step) => step === 'remove')).toBe(true);
    expect(player.clearSurfaceHandle).toHaveBeenCalledWith('surface-1');
  });

  it('is safe to call twice', async () => {
    const {controller, player} = await setup();
    const first = controller.destroy();
    const second = controller.destroy();
    expect(second).toBe(first);
    await second;
    expect(player.deinitialize).toHaveBeenCalledTimes(1);
    expect(reporter.stop).toHaveBeenCalledTimes(1);
  });

  it('ignores events after destroy', async () => {
    const {controller, player} = await setup();
    startPlaying(player);
    reporter.update.mockClear();
    const destroying = controller.destroy();
    // Events the native side sends while deinitializing.
    player.fire('pause');
    player.fire('ended');
    player.error = {code: 3, message: 'decode'};
    player.fire('error');
    await destroying;
    expect(listeners.onStateChange).toHaveBeenCalledTimes(1);
    expect(listeners.onError).not.toHaveBeenCalled();
    expect(reporter.update).not.toHaveBeenCalled();
    expect(player.listenerCount()).toBe(0);
  });

  it('ignores a surface destroyed after destroy()', async () => {
    const {controller, player} = await setup();
    await controller.destroy();
    player.clearSurfaceHandle.mockClear();
    controller.detachSurface('surface-1');
    controller.attachSurface('surface-2');
    expect(player.clearSurfaceHandle).not.toHaveBeenCalled();
    expect(player.setSurfaceHandle).toHaveBeenCalledTimes(1);
  });

  it('deinitializes once initialize() resolves when destroyed while initializing', async () => {
    const init = deferred();
    initializeResult.mockReturnValueOnce(init.promise);
    const controller = new PlayerController(api, SESSION, listeners);
    const player = Fake.instances[0];
    controller.attachSurface('surface-1');

    let done = false;
    const destroying = controller.destroy().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(player.deinitialize).not.toHaveBeenCalled();
    expect(done).toBe(false);

    init.resolve();
    await destroying;
    expect(player.deinitialize).toHaveBeenCalledTimes(1);
    expect(player.setSurfaceHandle).not.toHaveBeenCalled();
    expect(player.srcSets).toEqual([]);
    expect(player.listenerCount()).toBe(0);
  });

  describe('a stuck pipeline', () => {
    /** Playing at 10 s; the position doesn't move unless a test moves it. */
    const setupPlaying = async () => {
      const result = await setup();
      startPlaying(result.player);
      result.player.setPosition(10);
      result.player.fire('timeupdate');
      return result;
    };

    const expectReleasedWithoutTouching = (player: FakePlayer) => {
      expect(player.pause).not.toHaveBeenCalled();
      expect(player.clearSurfaceHandle).not.toHaveBeenCalled();
      expect(player.deinitialize).toHaveBeenCalledTimes(1);
      expect(player.listenerCount()).toBe(0);
    };

    it("isn't paused or cleared once the freeze check fired", async () => {
      const {controller, player} = await setupPlaying();
      jest.advanceTimersByTime(FREEZE_TIMEOUT_MS);
      expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
      await controller.destroy();
      expectReleasedWithoutTouching(player);
    });

    it(`isn't paused or cleared when playing without moving for over ${STUCK_ON_RELEASE_MS} ms`, async () => {
      const {controller, player} = await setupPlaying();
      jest.advanceTimersByTime(STUCK_ON_RELEASE_MS + 1);
      await controller.destroy();
      expectReleasedWithoutTouching(player);
      expect(listeners.onError).not.toHaveBeenCalled();
    });

    it('still pauses and clears a player that moved recently', async () => {
      const {controller, player} = await setupPlaying();
      jest.advanceTimersByTime(STUCK_ON_RELEASE_MS);
      player.setPosition(12);
      player.fire('timeupdate');
      jest.advanceTimersByTime(STUCK_ON_RELEASE_MS);
      await controller.destroy();
      expect(player.pause).toHaveBeenCalledTimes(1);
      expect(player.clearSurfaceHandle).toHaveBeenCalledWith('surface-1');
      expect(player.deinitialize).toHaveBeenCalledTimes(1);
    });

    it('still pauses and clears a player paused for a long time', async () => {
      const {controller, player} = await setupPlaying();
      player.paused = true;
      player.fire('pause');
      jest.advanceTimersByTime(STALL_TIMEOUT_MS * 10);
      await controller.destroy();
      expect(player.pause).toHaveBeenCalledTimes(1);
      expect(player.clearSurfaceHandle).toHaveBeenCalledWith('surface-1');
    });
  });

  it('clears the surface on detach before destroy', async () => {
    const {controller, player} = await setup();
    controller.detachSurface('surface-1');
    expect(player.clearSurfaceHandle).toHaveBeenCalledWith('surface-1');
    await controller.destroy();
    expect(player.clearSurfaceHandle).toHaveBeenCalledTimes(1);
  });
});

describe('errors', () => {
  it.each([
    [1, 'Playback was stopped before the video loaded.'],
    [
      2,
      'A network error stopped playback. Check the connection to the server.',
    ],
    [3, "This video couldn't be decoded."],
    [4, "This video format isn't supported."],
  ])('maps MediaError code %i', (code, message) => {
    expect(mediaErrorMessage({code})).toBe(message);
  });

  it('falls back for unknown codes and a missing error', () => {
    expect(mediaErrorMessage({code: 99})).toBe(UNKNOWN_PLAYER_ERROR);
    expect(mediaErrorMessage(null)).toBe(UNKNOWN_PLAYER_ERROR);
  });

  it('reports one error and ignores the events after it', async () => {
    const {player} = await setup();
    startPlaying(player);
    reporter.update.mockClear();
    player.error = {code: 4, message: 'unsupported'};
    player.fire('error');
    player.fire('error');
    player.fire('pause');
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    expect(reporter.update).not.toHaveBeenCalled();
  });
});

describe('start watchdog', () => {
  const advance = (ms: number) => jest.advanceTimersByTime(ms);

  it('reports an error when nothing moves before the first playing', async () => {
    const {controller} = await setup();
    advance(START_TIMEOUT_MS - 1);
    expect(listeners.onError).not.toHaveBeenCalled();

    advance(1);
    expect(listeners.onError).toHaveBeenCalledWith(START_TIMEOUT_MESSAGE);
    expect(reporter.stop).toHaveBeenCalledTimes(1);
    // The error path: controls and later events do nothing.
    controller.togglePause();
    expect(Fake.instances[0].play).not.toHaveBeenCalled();
  });

  it('keeps going while the start progresses, however slowly', async () => {
    const {player} = await setup();
    advance(START_TIMEOUT_MS - 1000);
    player.fire('progress');
    advance(START_TIMEOUT_MS - 1000);
    player.fire('loadedmetadata');
    advance(START_TIMEOUT_MS - 1000);
    player.fire('loadeddata');
    advance(START_TIMEOUT_MS - 1000);
    player.fire('canplay');
    advance(START_TIMEOUT_MS - 1000);
    player.setPosition(0.5);
    player.fire('timeupdate');
    advance(START_TIMEOUT_MS - 1000);
    expect(listeners.onError).not.toHaveBeenCalled();

    player.paused = false;
    player.fire('playing');
    playOn(player, START_TIMEOUT_MS * 10);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it("doesn't count a timeupdate that doesn't move", async () => {
    const {player} = await setup();
    player.setPosition(5);
    player.fire('timeupdate');
    advance(START_TIMEOUT_MS - 1000);
    player.fire('timeupdate');
    advance(1000);
    expect(listeners.onError).toHaveBeenCalledWith(START_TIMEOUT_MESSAGE);
  });

  it('stops on the first playing, while playback goes on', async () => {
    const {player} = await setup();
    startPlaying(player);
    // Only the freeze check's poll.
    expect(jest.getTimerCount()).toBe(1);
    for (let second = 1; second <= 100; second++) {
      player.setPosition(second);
      player.fire('timeupdate');
      advance(1000);
    }
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it('waits while paused before the first playing, and play re-arms it', async () => {
    const {controller, player} = await setup();
    advance(START_TIMEOUT_MS - 1000);
    player.paused = true;
    player.fire('pause');
    expect(jest.getTimerCount()).toBe(0);
    advance(START_TIMEOUT_MS * 10);
    expect(listeners.onError).not.toHaveBeenCalled();
    // Progress while paused doesn't start it either.
    player.fire('progress');
    expect(jest.getTimerCount()).toBe(0);

    player.paused = false;
    player.fire('play');
    advance(START_TIMEOUT_MS - 1);
    expect(listeners.onError).not.toHaveBeenCalled();
    advance(1);
    expect(listeners.onError).toHaveBeenCalledWith(START_TIMEOUT_MESSAGE);
    expect(controller.playerState).toBe('paused');
  });

  it("isn't restarted by a play during the start", async () => {
    const {player} = await setup();
    advance(START_TIMEOUT_MS - 1000);
    player.paused = false;
    player.fire('play');
    advance(1000);
    expect(listeners.onError).toHaveBeenCalledWith(START_TIMEOUT_MESSAGE);
  });

  it('is cleared on destroy', async () => {
    const {controller} = await setup();
    await controller.destroy();
    expect(jest.getTimerCount()).toBe(0);
    advance(START_TIMEOUT_MS);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it('is cleared by a player error, which is the only one reported', async () => {
    const {player} = await setup();
    player.error = {code: 3, message: 'decode'};
    player.fire('error');
    expect(jest.getTimerCount()).toBe(0);
    advance(START_TIMEOUT_MS);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    expect(listeners.onError).toHaveBeenCalledWith(
      "This video couldn't be decoded.",
    );
  });

  it("doesn't run when initialize() fails", async () => {
    initializeResult.mockReturnValueOnce(Promise.reject(new Error('no')));
    const controller = new PlayerController(api, SESSION, listeners);
    await controller.ready;
    expect(jest.getTimerCount()).toBe(0);
    expect(listeners.onError).toHaveBeenCalledWith(INIT_ERROR_MESSAGE);
  });

  it('gives Retry a fresh controller with its own watchdog', async () => {
    const first = await setup();
    advance(START_TIMEOUT_MS);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    await first.controller.destroy();

    // What the screen's Retry does: a new controller for the same session.
    const retry = await setup();
    expect(retry.player).not.toBe(first.player);
    expect(retry.player.srcSets).toEqual([SESSION.url]);
    advance(START_TIMEOUT_MS - 1000);
    startPlaying(retry.player);
    playOn(retry.player, START_TIMEOUT_MS * 2);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    expect(retry.controller.playerState).toBe('playing');
    expect(reporter.start).toHaveBeenCalledTimes(1);
  });
});

describe('stall watchdog', () => {
  const advance = (ms: number) => jest.advanceTimersByTime(ms);

  /** Playing at 10 s, past the start watchdog. */
  const setupPlaying = async () => {
    const result = await setup();
    startPlaying(result.player);
    result.player.setPosition(10);
    result.player.fire('timeupdate');
    return result;
  };

  it('fails after 30 s of waiting after the first playing', async () => {
    const {controller, player} = await setupPlaying();
    player.fire('waiting');
    expect(controller.playerState).toBe('loading');
    advance(STALL_TIMEOUT_MS - 1);
    expect(listeners.onError).not.toHaveBeenCalled();

    advance(1);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
    expect(reporter.stop).toHaveBeenCalledTimes(1);
    // The error path: controls do nothing.
    controller.seekBy(30000);
    expect(player.seeks).toEqual([]);
  });

  it("isn't extended by repeated waiting events", async () => {
    const {player} = await setupPlaying();
    player.fire('waiting');
    advance(STALL_TIMEOUT_MS - 1000);
    player.fire('waiting');
    player.fire('seeking');
    advance(1000);
    expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
  });

  it.each(['progress', 'canplay', 'loadeddata'])(
    'starts over on %s',
    async (type) => {
      const {player} = await setupPlaying();
      player.fire('waiting');
      advance(STALL_TIMEOUT_MS - 1000);
      player.fire(type);
      advance(STALL_TIMEOUT_MS - 1000);
      expect(listeners.onError).not.toHaveBeenCalled();
      advance(1000);
      expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
    },
  );

  it('starts over on a timeupdate that moves, not on one that stays', async () => {
    const {player} = await setupPlaying();
    player.fire('waiting');
    advance(STALL_TIMEOUT_MS - 1000);
    player.setPosition(10.5);
    player.fire('timeupdate');
    advance(STALL_TIMEOUT_MS - 1000);
    player.fire('timeupdate');
    expect(listeners.onError).not.toHaveBeenCalled();
    advance(1000);
    expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
  });

  it('stops when playing resumes', async () => {
    const {controller, player} = await setupPlaying();
    player.fire('waiting');
    advance(STALL_TIMEOUT_MS - 1000);
    player.fire('playing');
    expect(controller.playerState).toBe('playing');
    // Only the freeze check's poll.
    expect(jest.getTimerCount()).toBe(1);
    playOn(player, STALL_TIMEOUT_MS * 10);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it('watches a seek, and stops once the position moves after seeked', async () => {
    const {controller, player} = await setupPlaying();
    controller.seekTo(60000);
    player.fire('seeking');
    advance(STALL_TIMEOUT_MS - 1000);
    player.setPosition(60);
    player.fire('seeked');
    expect(controller.playerState).toBe('playing');
    // No `playing` after this seek: the first moving timeupdate ends it.
    player.setPosition(60.25);
    player.fire('timeupdate');
    // Only the freeze check's poll.
    expect(jest.getTimerCount()).toBe(1);
    playOn(player, STALL_TIMEOUT_MS * 10);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it('fails a seeked that never moves on', async () => {
    const {controller, player} = await setupPlaying();
    controller.seekTo(60000);
    player.fire('seeking');
    player.setPosition(60);
    player.fire('seeked');
    advance(STALL_TIMEOUT_MS);
    expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
  });

  it('waits while paused, and play re-arms it until playing', async () => {
    const {controller, player} = await setupPlaying();
    player.fire('waiting');
    advance(STALL_TIMEOUT_MS - 1000);
    player.paused = true;
    player.fire('pause');
    expect(jest.getTimerCount()).toBe(0);
    // Seeking while paused doesn't count either.
    controller.seekTo(120000);
    player.fire('seeking');
    advance(STALL_TIMEOUT_MS * 10);
    expect(listeners.onError).not.toHaveBeenCalled();

    player.paused = false;
    player.fire('play');
    advance(STALL_TIMEOUT_MS - 1);
    expect(listeners.onError).not.toHaveBeenCalled();
    advance(1);
    expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
  });

  it("doesn't fire after a pause and a play that resumes", async () => {
    const {player} = await setupPlaying();
    player.paused = true;
    player.fire('pause');
    advance(STALL_TIMEOUT_MS * 2);
    player.paused = false;
    player.fire('play');
    player.fire('playing');
    playOn(player, STALL_TIMEOUT_MS * 10);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it("doesn't run once ended", async () => {
    const {controller, player} = await setupPlaying();
    player.fire('waiting');
    player.fire('ended');
    expect(controller.playerState).toBe('ended');
    expect(jest.getTimerCount()).toBe(0);
    player.fire('waiting');
    player.fire('play');
    advance(STALL_TIMEOUT_MS * 10);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it('is cleared on destroy', async () => {
    const {controller, player} = await setupPlaying();
    player.fire('waiting');
    await controller.destroy();
    expect(jest.getTimerCount()).toBe(0);
    advance(STALL_TIMEOUT_MS * 10);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it('is cleared by a player error, which is the only one reported', async () => {
    const {player} = await setupPlaying();
    player.fire('waiting');
    player.error = {code: 2, message: 'network'};
    player.fire('error');
    advance(STALL_TIMEOUT_MS * 10);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    expect(listeners.onError).toHaveBeenCalledWith(
      mediaErrorMessage({code: 2}),
    );
  });
});

describe('freeze check', () => {
  const advance = (ms: number) => jest.advanceTimersByTime(ms);

  /** Playing at 10 s, past the start watchdog. */
  const setupPlaying = async () => {
    const result = await setup();
    startPlaying(result.player);
    result.player.setPosition(10);
    result.player.fire('timeupdate');
    return result;
  };

  it(`fails when the position doesn't move for ${FREEZE_TIMEOUT_MS} ms while playing`, async () => {
    const {controller, player} = await setupPlaying();
    advance(FREEZE_TIMEOUT_MS - 1);
    expect(listeners.onError).not.toHaveBeenCalled();
    advance(1);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
    expect(reporter.stop).toHaveBeenCalledTimes(1);
    controller.seekBy(30000);
    expect(player.seeks).toEqual([]);
    advance(FREEZE_TIMEOUT_MS * 10);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
  });

  it('stays quiet while the position moves, even with no timeupdate (0.25×)', async () => {
    const {player} = await setupPlaying();
    for (let i = 1; i <= 30; i++) {
      advance(FREEZE_POLL_MS);
      player.setPosition(10 + i * 0.5);
    }
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it('starts over on a timeupdate that moves', async () => {
    const {player} = await setupPlaying();
    advance(FREEZE_TIMEOUT_MS - 1000);
    player.setPosition(10.25);
    player.fire('timeupdate');
    advance(FREEZE_TIMEOUT_MS - 1000);
    expect(listeners.onError).not.toHaveBeenCalled();
    // The next poll, within FREEZE_POLL_MS of the timeout.
    advance(FREEZE_POLL_MS);
    expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
  });

  it('stops on pause, and playing restarts it from the current position', async () => {
    const {player} = await setupPlaying();
    advance(FREEZE_TIMEOUT_MS - 2000);
    player.paused = true;
    player.fire('pause');
    advance(FREEZE_TIMEOUT_MS * 3);
    expect(listeners.onError).not.toHaveBeenCalled();

    player.paused = false;
    player.fire('play');
    player.fire('playing');
    advance(FREEZE_TIMEOUT_MS - 1);
    expect(listeners.onError).not.toHaveBeenCalled();
    advance(1);
    expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
  });

  it.each(['waiting', 'seeking'])(
    'stops on %s (the stall watchdog takes over)',
    async (type) => {
      const {player} = await setupPlaying();
      advance(FREEZE_TIMEOUT_MS - 2000);
      player.fire(type);
      advance(STALL_TIMEOUT_MS - 1);
      expect(listeners.onError).not.toHaveBeenCalled();

      player.fire('playing');
      advance(FREEZE_TIMEOUT_MS);
      expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
    },
  );

  it("doesn't run once ended", async () => {
    const {player} = await setupPlaying();
    player.fire('ended');
    advance(FREEZE_TIMEOUT_MS * 10);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it("doesn't run after destroy", async () => {
    const {controller} = await setupPlaying();
    await controller.destroy();
    expect(jest.getTimerCount()).toBe(0);
    advance(FREEZE_TIMEOUT_MS * 10);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it("doesn't run after another error", async () => {
    const {player} = await setupPlaying();
    player.error = {code: 3, message: 'decode'};
    player.fire('error');
    advance(FREEZE_TIMEOUT_MS * 10);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    expect(listeners.onError).toHaveBeenCalledWith(
      mediaErrorMessage({code: 3}),
    );
  });

  it("doesn't run before the first playing", async () => {
    const {player} = await setup();
    player.duration = 7200;
    player.fire('loadedmetadata');
    advance(START_TIMEOUT_MS - 1);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it('catches a speed change that freezes the pipeline (The AI Doc at 4:17)', async () => {
    const {controller, player} = await setupPlaying();
    controller.setPlaybackRate(2);
    player.paused = true;
    player.fire('pause');
    player.paused = false;
    player.fire('play');
    player.fire('playing');
    // No time updates and no `waiting` after this.
    advance(FREEZE_TIMEOUT_MS);
    expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
  });
});

describe('seeking', () => {
  /** Metadata loaded (2 h), playing at `seconds`. */
  const setupAt = async (seconds: number) => {
    const result = await setup();
    startPlaying(result.player);
    result.player.setPosition(seconds);
    return result;
  };

  it('seeks by a delta from the position', async () => {
    const {controller, player} = await setupAt(600);
    controller.seekBy(30000);
    controller.seekBy(-10000);
    // The second adds to the first, which hasn't landed yet.
    expect(player.seeks).toEqual([630, 620]);

    player.fire('seeked');
    player.setPosition(625);
    controller.seekBy(-10000);
    expect(player.seeks.at(-1)).toBe(615);
  });

  it('clamps seekBy and seekTo at the start', async () => {
    const {controller, player} = await setupAt(5);
    controller.seekBy(-10000);
    controller.seekTo(-5000);
    expect(player.seeks).toEqual([0, 0]);
  });

  it(`clamps seekBy and seekTo ${SEEK_END_MARGIN_MS} ms before the end`, async () => {
    const {controller, player} = await setupAt(7190);
    const end = (7200000 - SEEK_END_MARGIN_MS) / 1000;
    controller.seekBy(30000);
    controller.seekTo(7200000);
    controller.seekTo(9000000);
    expect(player.seeks).toEqual([end, end, end]);
    controller.seekTo(7199500);
    expect(player.seeks.at(-1)).toBe(end);
    controller.seekTo(7198000);
    expect(player.seeks.at(-1)).toBe(7198);
    controller.seekTo(7000000);
    expect(player.seeks.at(-1)).toBe(7000);
  });

  it('clamps at 0 for media shorter than the margin', async () => {
    const {controller, player} = await setup({durationMs: undefined});
    player.duration = 0.5;
    player.fire('loadedmetadata');
    controller.seekTo(400);
    expect(player.seeks).toEqual([0]);
  });

  it("seekTo doesn't clamp the end when the duration is unknown", async () => {
    const {controller, player} = await setup({durationMs: undefined});
    expect(controller.durationMs).toBe(0);
    controller.seekTo(90000);
    expect(player.seeks).toEqual([90]);
  });

  it('ignores a delta or position that is not a number', async () => {
    const {controller, player} = await setupAt(600);
    controller.seekBy(NaN);
    controller.seekTo(Infinity);
    expect(player.seeks).toEqual([]);
  });

  describe('canSeek', () => {
    it('is false until the metadata loads, then true', async () => {
      const {controller, player} = await setup();
      expect(controller.canSeek).toBe(false);
      controller.seekBy(30000);
      expect(player.seeks).toEqual([]);

      player.duration = 7200;
      player.fire('loadedmetadata');
      expect(controller.canSeek).toBe(true);
    });

    it('is false until the resume seek lands', async () => {
      const {controller, player} = await setup({startMs: 90000});
      player.duration = 7200;
      player.fire('loadedmetadata');
      expect(controller.canSeek).toBe(false);
      player.fire('seeking');
      player.fire('seeked');
      expect(controller.canSeek).toBe(true);
    });

    it('is false without a duration', async () => {
      const {controller, player} = await setup({durationMs: undefined});
      player.fire('loadedmetadata');
      expect(controller.canSeek).toBe(false);
      controller.seekBy(30000);
      expect(player.seeks).toEqual([]);
    });

    it('is false before the surface is set', async () => {
      const controller = new PlayerController(api, SESSION, listeners);
      await controller.ready;
      expect(controller.canSeek).toBe(false);
    });

    it('is false after an error', async () => {
      const {controller, player} = await setupAt(600);
      player.error = {code: 3, message: 'decode'};
      player.fire('error');
      expect(controller.canSeek).toBe(false);
    });

    it('is false after destroy', async () => {
      const {controller} = await setupAt(600);
      await controller.destroy();
      expect(controller.canSeek).toBe(false);
    });
  });
});

describe('playback rate', () => {
  it('starts at 1 by default', async () => {
    const {controller, player} = await setup();
    expect(controller.playbackRate).toBe(1);
    expect(player.playbackRate).toBe(1);
  });

  it('starts at the rate from the options, kept through the load reset', async () => {
    const init = deferred();
    initializeResult.mockReturnValueOnce(init.promise);
    const controller = new PlayerController(api, SESSION, listeners, {
      playbackRate: 1.5,
    });
    const player = Fake.instances[0];
    expect(controller.playbackRate).toBe(1.5);
    controller.attachSurface('surface-1');
    init.resolve();
    await controller.ready;

    // Setting src reset playbackRate to defaultPlaybackRate.
    expect(player.srcSets).toEqual([SESSION.url]);
    expect(player.defaultPlaybackRate).toBe(1.5);
    expect(player.playbackRate).toBe(1.5);
  });

  it('ignores a starting rate that is not a positive number', async () => {
    const {controller, player} = await setup({}, {playbackRate: 0});
    expect(controller.playbackRate).toBe(1);
    expect(player.playbackRate).toBe(1);
  });

  it('applies a rate set before the load once initialized, kept after the load', async () => {
    const init = deferred();
    initializeResult.mockReturnValueOnce(init.promise);
    const controller = new PlayerController(api, SESSION, listeners);
    const player = Fake.instances[0];
    controller.setPlaybackRate(0.75);
    expect(controller.playbackRate).toBe(0.75);
    expect(player.playbackRate).toBe(1);

    init.resolve();
    await controller.ready;
    expect(player.playbackRate).toBe(0.75);
    controller.attachSurface('surface-1');
    expect(player.srcSets).toEqual([SESSION.url]);
    expect(player.playbackRate).toBe(0.75);
  });

  it('sets the rate while playing', async () => {
    const {controller, player} = await setup();
    startPlaying(player);
    controller.setPlaybackRate(2);
    expect(controller.playbackRate).toBe(2);
    expect(player.playbackRate).toBe(2);
    expect(player.defaultPlaybackRate).toBe(2);

    controller.setPlaybackRate(1);
    expect(player.playbackRate).toBe(1);
  });

  describe('while playing (URL mode)', () => {
    /** Playing at 10 s; reports and state changes so far cleared. */
    const setupPlaying = async () => {
      const result = await setup();
      startPlaying(result.player);
      result.player.setPosition(10);
      result.player.fire('timeupdate');
      reporter.update.mockClear();
      listeners.onStateChange.mockClear();
      result.player.play.mockClear();
      return result;
    };

    /** The events Vega sends for the controller's own pause → play. */
    const firePauseAndPlay = (player: FakePlayer) => {
      player.paused = true;
      player.fire('pause');
      player.paused = false;
      player.fire('play');
      player.fire('playing');
    };

    it('pauses, sets the rate, then plays (not a rate change mid-play)', async () => {
      const {controller, player} = await setupPlaying();
      const order: string[] = [];
      let rate = player.playbackRate;
      Object.defineProperty(player, 'playbackRate', {
        get: () => rate,
        set: (value: number) => {
          rate = value;
          order.push(`rate ${value}`);
        },
      });
      player.pause.mockImplementation(() => order.push('pause'));
      player.play.mockImplementation(async () => {
        order.push('play');
      });

      controller.setPlaybackRate(2);
      expect(order).toEqual(['pause', 'rate 2', 'play']);
      expect(player.defaultPlaybackRate).toBe(2);
      expect(controller.playbackRate).toBe(2);
    });

    it("doesn't show or report its own pause and play", async () => {
      const {controller, player} = await setupPlaying();
      controller.setPlaybackRate(1.5);
      firePauseAndPlay(player);
      expect(listeners.onStateChange).not.toHaveBeenCalled();
      expect(reporter.update).not.toHaveBeenCalled();
      expect(controller.playerState).toBe('playing');
    });

    it("doesn't leave the stall watchdog suspended", async () => {
      const {controller, player} = await setupPlaying();
      controller.setPlaybackRate(1.5);
      firePauseAndPlay(player);
      player.fire('waiting');
      jest.advanceTimersByTime(STALL_TIMEOUT_MS);
      expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
    });

    it('watches a play that never resumes after it', async () => {
      const {controller, player} = await setupPlaying();
      player.fire('waiting');
      controller.setPlaybackRate(1.5);
      player.paused = true;
      player.fire('pause');
      player.paused = false;
      player.fire('play');
      jest.advanceTimersByTime(STALL_TIMEOUT_MS);
      expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);
    });

    it('shows and reports a pause the user makes after it', async () => {
      const {controller, player} = await setupPlaying();
      controller.setPlaybackRate(1.5);
      firePauseAndPlay(player);
      controller.pause();
      player.paused = true;
      player.fire('pause');
      expect(controller.playerState).toBe('paused');
      expect(listeners.onStateChange).toHaveBeenCalledWith('paused');
      expect(reporter.update).toHaveBeenCalledTimes(1);
    });

    it('only sets the rate while paused (Play applies it)', async () => {
      const {controller, player} = await setupPlaying();
      player.paused = true;
      player.fire('pause');
      player.pause.mockClear();
      controller.setPlaybackRate(0.5);
      expect(player.pause).not.toHaveBeenCalled();
      expect(player.play).not.toHaveBeenCalled();
      expect(player.playbackRate).toBe(0.5);
    });

    it('only sets the rate before the load', async () => {
      const controller = new PlayerController(api, SESSION, listeners);
      const player = Fake.instances[0];
      await controller.ready;
      player.paused = false;
      controller.setPlaybackRate(0.5);
      expect(player.pause).not.toHaveBeenCalled();
      expect(player.play).not.toHaveBeenCalled();
      expect(player.playbackRate).toBe(0.5);
    });
  });

  it('restores a rate the native load reset, on loadedmetadata', async () => {
    const {player} = await setup({}, {playbackRate: 1.25});
    player.playbackRate = 1;
    player.fire('loadedmetadata');
    expect(player.playbackRate).toBe(1.25);
  });

  it('ignores a rate that is not a positive number', async () => {
    const {controller, player} = await setup({}, {playbackRate: 1.5});
    controller.setPlaybackRate(0);
    controller.setPlaybackRate(-1);
    controller.setPlaybackRate(NaN);
    expect(controller.playbackRate).toBe(1.5);
    expect(player.playbackRate).toBe(1.5);
  });

  it('is ignored after destroy', async () => {
    const {controller, player} = await setup({}, {playbackRate: 1.5});
    await controller.destroy();
    controller.setPlaybackRate(2);
    expect(controller.playbackRate).toBe(1.5);
    expect(player.playbackRate).toBe(1.5);
  });

  it('is ignored after an error', async () => {
    const {controller, player} = await setup();
    player.error = {code: 3, message: 'decode'};
    player.fire('error');
    controller.setPlaybackRate(2);
    expect(controller.playbackRate).toBe(1);
    expect(player.playbackRate).toBe(1);
  });

  it('logs a player that throws on the rate and goes on', async () => {
    const controller = new PlayerController(api, SESSION, listeners);
    const player = Fake.instances[0];
    await controller.ready;
    Object.defineProperty(player, 'playbackRate', {
      get: () => 1,
      set: () => {
        throw new Error('no rate');
      },
    });
    controller.setPlaybackRate(2);
    expect(warn).toHaveBeenCalledWith(
      'Player playbackRate failed',
      expect.any(Error),
    );
    expect(controller.playbackRate).toBe(2);
  });

  it('gives a new controller (Retry, a track switch) the same rate', async () => {
    const first = await setup();
    first.controller.setPlaybackRate(1.75);
    await first.controller.destroy();

    const next = await setup({}, {playbackRate: first.controller.playbackRate});
    expect(next.player.playbackRate).toBe(1.75);
  });
});

describe('HLS mode', () => {
  const HLS: Partial<PlaybackSession> = {
    mode: 'hls',
    playMethod: 'Transcode',
    url: 'http://server/videos/item-1/master.m3u8?PlaySessionId=play-1',
    startMs: 90000,
    maxStreamingBitrate: 8_000_000,
  };

  /** Lets the adapter's attach → load chain and its callbacks run. */
  const flush = () =>
    new Promise<void>((resolve) => setImmediate(() => resolve()));

  const lastShaka = (): FakeShakaPlayer => shaka.Player.instances.at(-1)!;

  /** An HLS controller whose Shaka load waits for `load.resolve()`. */
  const setupHls = async (
    session: Partial<PlaybackSession> = {},
    {surface = true} = {},
  ) => {
    const load = deferred();
    shaka.Player.loadResult.mockReturnValueOnce(load.promise);
    const controller = new PlayerController(
      api,
      {...SESSION, ...HLS, ...session},
      listeners,
    );
    const player = Fake.instances.at(-1)!;
    if (surface) {
      controller.attachSurface('surface-1');
    }
    await controller.ready;
    return {controller, player, load, shakaPlayer: lastShaka()};
  };

  it('starts Shaka at the resume position, capped at the session bitrate', async () => {
    const {player, shakaPlayer} = await setupHls();
    await flush();
    expect(shakaPlayer.attach).toHaveBeenCalledWith(player);
    expect(shakaPlayer.load).toHaveBeenCalledWith(HLS.url, 90);
    expect(shakaPlayer.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        abr: {enabled: true, restrictions: {maxBandwidth: 8_000_000}},
      }),
    );
    expect(player.autoplay).toBe(false);
    expect(player.srcSets).toEqual([]);
  });

  it('hands the playlist to Shaka before the surface is set', async () => {
    const init = deferred();
    initializeResult.mockReturnValueOnce(init.promise);
    const controller = new PlayerController(
      api,
      {...SESSION, ...HLS},
      listeners,
    );
    const player = Fake.instances[0];
    const order: string[] = [];
    player.addEventListener.mockImplementation(() => order.push('listen'));
    player.setSurfaceHandle.mockImplementation(() => {
      order.push('surface');
      // Shaka was created, attached and configured before this.
      order.push(`shaka attached: ${lastShaka()?.attach.mock.calls.length}`);
    });
    controller.attachSurface('surface-1');
    init.resolve();
    await controller.ready;

    expect(order.lastIndexOf('listen')).toBeLessThan(order.indexOf('surface'));
    expect(order).toContain('shaka attached: 1');
    expect(player.play).not.toHaveBeenCalled();
  });

  it('plays once the load resolved, when the surface came first', async () => {
    const {player, load} = await setupHls();
    await flush();
    expect(player.setSurfaceHandle).toHaveBeenCalledWith('surface-1');
    expect(player.play).not.toHaveBeenCalled();

    load.resolve();
    await flush();
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('plays once the surface is set, when the load resolved first', async () => {
    const {controller, player, load} = await setupHls({}, {surface: false});
    load.resolve();
    await flush();
    expect(player.play).not.toHaveBeenCalled();

    controller.attachSurface('surface-1');
    expect(player.play).toHaveBeenCalledTimes(1);

    // A recreated surface doesn't start playback again.
    controller.detachSurface('surface-1');
    controller.attachSurface('surface-2');
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("doesn't seek on loadedmetadata (Shaka starts at the position)", async () => {
    const {player, load} = await setupHls();
    load.resolve();
    await flush();
    player.fire('loadedmetadata');
    player.fire('seeked');
    expect(player.seeks).toEqual([]);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('starts the reporter on the first playing', async () => {
    const {player, load} = await setupHls();
    load.resolve();
    await flush();
    expect(reporter.start).not.toHaveBeenCalled();

    player.paused = false;
    player.fire('playing');
    player.fire('playing');
    expect(reporter.start).toHaveBeenCalledTimes(1);
  });

  it('reports a Shaka error and stops the reporter', async () => {
    const {player, load, shakaPlayer} = await setupHls();
    load.resolve();
    await flush();
    player.fire('playing');

    shakaPlayer.fire('error', {category: 1, code: 1002, severity: 2});
    expect(listeners.onError).toHaveBeenCalledWith(
      'A network error stopped playback. Check the connection to the server.',
    );
    expect(reporter.stop).toHaveBeenCalledTimes(1);

    // One error only.
    shakaPlayer.fire('error', {category: 3, code: 3016, severity: 2});
    expect(listeners.onError).toHaveBeenCalledTimes(1);
  });

  it('reports a start that stalls after the load (7.1 AAC on the Fire TV)', async () => {
    // The TV's events for The Age of Adaline: the audio parser fails in the
    // pipeline, and nothing follows Shaka's seek to the start.
    const {controller, player, load} = await setupHls();
    load.resolve();
    await flush();
    player.paused = false;
    player.fire('play');
    player.fire('waiting');
    player.fire('loadedmetadata');
    player.fire('seeking');
    player.fire('seeked');
    // The spinner stays until the first frame plays.
    expect(controller.playerState).toBe('loading');

    jest.advanceTimersByTime(START_TIMEOUT_MS);
    expect(listeners.onError).toHaveBeenCalledWith(START_TIMEOUT_MESSAGE);
    expect(reporter.stop).toHaveBeenCalledTimes(1);
    expect(reporter.start).not.toHaveBeenCalled();
  });

  it('shows playing after the first playing that follows the start seek', async () => {
    const {controller, player, load} = await setupHls();
    load.resolve();
    await flush();
    player.paused = false;
    player.fire('seeked');
    player.fire('playing');
    expect(controller.playerState).toBe('playing');
  });

  describe('playback rate', () => {
    it('sets the element rate (and default) before the load, for Shaka to read', async () => {
      const {player, shakaPlayer, load} = await setupHls({}, {surface: true});
      // Shaka's MSE attach resets the element's rate to the default.
      expect(player.defaultPlaybackRate).toBe(1);
      expect(shakaPlayer.trickPlay).not.toHaveBeenCalled();
      load.resolve();
      await flush();
      expect(shakaPlayer.trickPlay).toHaveBeenCalledWith(1, false);
    });

    it('starts at the rate from the options', async () => {
      const load = deferred();
      shaka.Player.loadResult.mockReturnValueOnce(load.promise);
      const controller = new PlayerController(
        api,
        {...SESSION, ...HLS},
        listeners,
        {playbackRate: 0.5},
      );
      const player = Fake.instances.at(-1)!;
      controller.attachSurface('surface-1');
      await controller.ready;
      expect(player.defaultPlaybackRate).toBe(0.5);
      expect(player.playbackRate).toBe(0.5);

      load.resolve();
      await flush();
      expect(lastShaka().trickPlay).toHaveBeenLastCalledWith(0.5, false);
    });

    it('hands a rate set during the load to Shaka once loaded', async () => {
      const {controller, player, load, shakaPlayer} = await setupHls();
      await flush();
      controller.setPlaybackRate(1.25);
      expect(player.playbackRate).toBe(1.25);
      expect(shakaPlayer.trickPlay).not.toHaveBeenCalled();

      load.resolve();
      await flush();
      expect(shakaPlayer.trickPlay).toHaveBeenLastCalledWith(1.25, false);
    });

    it('goes through Shaka once loaded, so its buffering pause stays', async () => {
      const {controller, player, load, shakaPlayer} = await setupHls();
      load.resolve();
      await flush();
      // Shaka holds the element at rate 0 while it buffers.
      player.playbackRate = 0;
      controller.setPlaybackRate(2);
      expect(shakaPlayer.trickPlay).toHaveBeenLastCalledWith(2, false);
      expect(player.defaultPlaybackRate).toBe(2);
      expect(player.playbackRate).toBe(0);
      expect(controller.playbackRate).toBe(2);
    });

    it('changes speed mid-session through Shaka, with no pause or play', async () => {
      const {controller, player, load, shakaPlayer} = await setupHls();
      load.resolve();
      await flush();
      player.paused = false;
      player.fire('play');
      player.fire('playing');
      player.play.mockClear();
      reporter.update.mockClear();
      listeners.onStateChange.mockClear();

      controller.setPlaybackRate(2);
      expect(shakaPlayer.trickPlay).toHaveBeenLastCalledWith(2, false);
      expect(player.pause).not.toHaveBeenCalled();
      expect(player.play).not.toHaveBeenCalled();
      expect(controller.playbackRate).toBe(2);
      expect(controller.playerState).toBe('playing');
      expect(listeners.onStateChange).not.toHaveBeenCalled();

      controller.setPlaybackRate(0.75);
      expect(shakaPlayer.trickPlay).toHaveBeenLastCalledWith(0.75, false);
      expect(player.pause).not.toHaveBeenCalled();
    });

    it("doesn't touch the rate on loadedmetadata (Shaka owns it)", async () => {
      const {controller, player, load, shakaPlayer} = await setupHls();
      load.resolve();
      await flush();
      controller.setPlaybackRate(1.5);
      player.playbackRate = 0;
      player.fire('loadedmetadata');
      expect(player.playbackRate).toBe(0);
      expect(shakaPlayer.trickPlay).toHaveBeenCalledTimes(2);
    });

    it('is ignored after destroy', async () => {
      const {controller, load, shakaPlayer} = await setupHls();
      load.resolve();
      await flush();
      await controller.destroy();
      controller.setPlaybackRate(2);
      expect(shakaPlayer.trickPlay).toHaveBeenCalledTimes(1);
      expect(controller.playbackRate).toBe(1);
    });
  });

  it('reports a rejected load and never plays', async () => {
    const {player, load} = await setupHls();
    load.reject({category: 4, code: 4000, severity: 2});
    await flush();
    expect(listeners.onError).toHaveBeenCalledWith(
      "The server's stream couldn't be read.",
    );
    expect(reporter.stop).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('destroys Shaka before pausing, clearing the surface and deinitializing', async () => {
    const {controller, player, load, shakaPlayer} = await setupHls();
    load.resolve();
    await flush();
    const order: string[] = [];
    shakaPlayer.unload.mockImplementation(async () => {
      order.push('unload');
    });
    shakaPlayer.destroy.mockImplementation(async () => {
      order.push('shaka destroy');
    });
    player.pause.mockImplementation(() => order.push('pause'));
    player.clearSurfaceHandle.mockImplementation(() => order.push('clear'));
    player.deinitialize.mockImplementation(async () => {
      order.push('deinit');
    });
    player.removeEventListener.mockImplementation(() => order.push('remove'));

    await controller.destroy();
    expect(order.slice(0, 5)).toEqual([
      'unload',
      'shaka destroy',
      'pause',
      'clear',
      'deinit',
    ]);
    expect(order.slice(5).every((step) => step === 'remove')).toBe(true);
  });

  it("destroys Shaka first, then skips pausing and clearing a stuck player", async () => {
    const {controller, player, load, shakaPlayer} = await setupHls();
    load.resolve();
    await flush();
    player.paused = false;
    player.fire('play');
    player.fire('playing');
    player.setPosition(95);
    player.fire('timeupdate');
    jest.advanceTimersByTime(FREEZE_TIMEOUT_MS);
    expect(listeners.onError).toHaveBeenCalledWith(STALL_TIMEOUT_MESSAGE);

    await controller.destroy();
    expect(shakaPlayer.destroy).toHaveBeenCalledTimes(1);
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.clearSurfaceHandle).not.toHaveBeenCalled();
    expect(player.deinitialize).toHaveBeenCalledTimes(1);
    expect(player.listenerCount()).toBe(0);
  });

  it('logs a failed Shaka teardown and still deinitializes', async () => {
    const {controller, player, shakaPlayer} = await setupHls();
    shakaPlayer.unload.mockReturnValueOnce(Promise.reject(new Error('busy')));
    await controller.destroy();
    expect(shakaPlayer.destroy).toHaveBeenCalledTimes(1);
    expect(player.deinitialize).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it('tears down while the load is pending and ignores its rejection', async () => {
    const {controller, player, load, shakaPlayer} = await setupHls();
    await flush();
    const destroying = controller.destroy();
    // Shaka's unload interrupts the load (LOAD_INTERRUPTED, 7000).
    load.reject({category: 7, code: 7000, severity: 2});
    await destroying;
    await flush();

    expect(shakaPlayer.unload).toHaveBeenCalledTimes(1);
    expect(shakaPlayer.destroy).toHaveBeenCalledTimes(1);
    expect(player.deinitialize).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
    expect(listeners.onError).not.toHaveBeenCalled();
    expect(reporter.stop).toHaveBeenCalledTimes(1);
  });

  it("doesn't create Shaka when destroyed while initializing", async () => {
    const init = deferred();
    initializeResult.mockReturnValueOnce(init.promise);
    const controller = new PlayerController(
      api,
      {...SESSION, ...HLS},
      listeners,
    );
    const player = Fake.instances[0];
    controller.attachSurface('surface-1');
    const destroying = controller.destroy();
    init.resolve();
    await destroying;

    expect(shaka.Player.instances).toHaveLength(0);
    expect(player.deinitialize).toHaveBeenCalledTimes(1);
    expect(player.setSurfaceHandle).not.toHaveBeenCalled();
  });
});

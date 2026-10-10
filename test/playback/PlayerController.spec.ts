import type {Api} from '@jellyfin/sdk';
import {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';

import {
  INIT_ERROR_MESSAGE,
  PlayerController,
  type PlayerListeners,
  UNKNOWN_PLAYER_ERROR,
  mediaErrorMessage,
} from '../../src/playback/PlayerController';
import {createPlaybackReporter} from '../../src/playback/reporting';
import type {PlaybackSession, PlaybackSnapshot} from '../../src/playback/types';
import type {VideoPlayer as FakeVideoPlayer} from '../__mocks__/react-native-w3cmedia';

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
const setup = async (session: Partial<PlaybackSession> = {}) => {
  const controller = new PlayerController(
    api,
    {...SESSION, ...session},
    listeners,
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

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  Fake.instances.length = 0;
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
});

afterEach(() => {
  warn.mockRestore();
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

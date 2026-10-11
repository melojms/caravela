import type {Api} from '@jellyfin/sdk';
import {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';

import {
  INIT_ERROR_MESSAGE,
  PlayerController,
  type PlayerListeners,
  START_TIMEOUT_MESSAGE,
  START_TIMEOUT_MS,
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
    advance(START_TIMEOUT_MS * 10);
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

  it('stops after the first playing, even when playback stalls later', async () => {
    const {player} = await setup();
    startPlaying(player);
    player.fire('waiting');
    advance(START_TIMEOUT_MS * 10);
    expect(listeners.onError).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
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
    advance(START_TIMEOUT_MS * 2);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    expect(retry.controller.playerState).toBe('playing');
    expect(reporter.start).toHaveBeenCalledTimes(1);
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

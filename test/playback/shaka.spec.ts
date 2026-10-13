import type {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';

import {DEFAULT_MAX_BITRATE} from '../../src/playback/deviceProfile';
import type {FakeShaka, FakeShakaPlayer} from '../__mocks__/shaka';

type Adapter = typeof import('../../src/playback/shaka');
const vegaGlobal = global as unknown as {gmedia?: unknown};

const media = {name: 'video-player'} as unknown as VideoPlayer;
const URL = 'http://server/videos/item-1/master.m3u8?PlaySessionId=play-1';

let adapter: Adapter;
let shaka: FakeShaka;
let polyfillInstall: jest.Mock;

const SHAKA_BUILD = '../../src/vendor/shaka/dist/shaka-player.compiled';

/**
 * A fresh adapter (and mocks), so the one-time install runs again. A reset
 * registry rather than `isolateModules`: the adapter loads Shaka lazily, after
 * this returns, and must get the same mock as the test.
 */
const loadAdapter = () => {
  jest.resetModules();
  adapter = require('../../src/playback/shaka');
  shaka = require('../__mocks__/shaka').default;
  polyfillInstall = require('../__mocks__/shakaPolyfill').default.install;
};

const lastPlayer = (): FakeShakaPlayer => shaka.Player.instances.at(-1)!;

const shakaError = (category: number, severity = 2, code = 1001) => ({
  category,
  code,
  severity,
});

const deferred = () => {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};

let warn: jest.SpyInstance;

beforeEach(() => {
  loadAdapter();
  vegaGlobal.gmedia = undefined;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('setup', () => {
  // On the TV, Shaka's build reads `navigator.userAgent` while it loads, and
  // MiscPolyfill sets it. Loaded first, it threw inside Metro's require, which
  // aborts the app.
  it("loads Shaka's build only after Amazon's polyfills are installed", () => {
    jest.resetModules();
    const install = require('../__mocks__/shakaPolyfill').default.install;
    let installsBeforeShaka: number | undefined;
    jest.doMock(SHAKA_BUILD, () => {
      installsBeforeShaka = install.mock.calls.length;
      return jest.requireActual('../__mocks__/shaka');
    });
    try {
      const fresh: Adapter = require('../../src/playback/shaka');
      expect(installsBeforeShaka).toBeUndefined();

      fresh.createShakaSession(media);
      expect(installsBeforeShaka).toBe(5);
    } finally {
      jest.dontMock(SHAKA_BUILD);
    }
  });

  it('installs the polyfills once, before the first shaka.Player', () => {
    const order: string[] = [];
    polyfillInstall.mockImplementation(() =>
      order.push(`polyfill:${shaka.Player.instances.length}`),
    );
    shaka.polyfill.installAll.mockImplementation(() =>
      order.push(`installAll:${shaka.Player.instances.length}`),
    );

    adapter.createShakaSession(media);
    expect(order).toEqual([...Array(5).fill('polyfill:0'), 'installAll:0']);
    expect(shaka.Player.instances).toHaveLength(1);

    adapter.createShakaSession(media);
    expect(polyfillInstall).toHaveBeenCalledTimes(5);
    expect(shaka.polyfill.installAll).toHaveBeenCalledTimes(1);
    expect(shaka.Player.instances).toHaveLength(2);
  });

  it('points the document polyfill at the player before installing', () => {
    let seen: unknown;
    shaka.polyfill.installAll.mockImplementation(() => {
      seen = vegaGlobal.gmedia;
    });
    adapter.createShakaSession(media);
    expect(seen).toBe(media);
  });

  it('re-registers fetch for http/https and drops the caption parsers', () => {
    adapter.createShakaSession(media);
    const {NetworkingEngine, HttpFetchPlugin} = shaka.net;
    for (const scheme of ['http', 'https']) {
      expect(NetworkingEngine.unregisterScheme).toHaveBeenCalledWith(scheme);
      expect(NetworkingEngine.registerScheme).toHaveBeenCalledWith(
        scheme,
        HttpFetchPlugin.parse,
        NetworkingEngine.PluginPriority.APPLICATION,
        true,
      );
    }
    const {unregisterParser} = shaka.media.ClosedCaptionParser;
    expect(unregisterParser).toHaveBeenCalledWith('video/mp4');
    expect(unregisterParser).toHaveBeenCalledWith('video/mp2t');
  });
});

describe('configuration', () => {
  it("caps ABR at the session's bitrate", () => {
    adapter.createShakaSession(media, {maxBandwidth: 8_000_000});
    expect(lastPlayer().configure).toHaveBeenCalledWith(
      expect.objectContaining({
        abr: {enabled: true, restrictions: {maxBandwidth: 8_000_000}},
      }),
    );
  });

  it('caps ABR at the default bitrate without one', () => {
    adapter.createShakaSession(media, {maxBandwidth: undefined});
    expect(lastPlayer().configure).toHaveBeenCalledWith(
      expect.objectContaining({
        abr: {enabled: true, restrictions: {maxBandwidth: DEFAULT_MAX_BITRATE}},
      }),
    );
  });

  it('turns HLS sequence mode on', () => {
    adapter.createShakaSession(media);
    expect(adapter.HLS_SEQUENCE_MODE).toBe(true);
    const [config] = lastPlayer().configure.mock.calls[0] as [
      {manifest: {hls: {sequenceMode: boolean}}},
    ];
    expect(config.manifest.hls.sequenceMode).toBe(true);
  });
});

describe('load', () => {
  it('attaches to the player, then loads at the start time', async () => {
    const session = adapter.createShakaSession(media);
    const player = lastPlayer();
    const order: string[] = [];
    player.attach.mockImplementation(async () => {
      order.push('attach');
    });
    player.load.mockImplementation(async () => {
      order.push('load');
    });

    await session.load(URL, 90);
    expect(order).toEqual(['attach', 'load']);
    expect(player.attach).toHaveBeenCalledWith(media);
    expect(player.load).toHaveBeenCalledWith(URL, 90);
  });

  it('passes a rejected load to the caller', async () => {
    const session = adapter.createShakaSession(media);
    const error = shakaError(1);
    lastPlayer().load.mockReturnValueOnce(Promise.reject(error));
    await expect(session.load(URL, 0)).rejects.toBe(error);
  });

  it("doesn't load when destroyed while attaching", async () => {
    const session = adapter.createShakaSession(media);
    const player = lastPlayer();
    const attach = deferred();
    player.attach.mockReturnValueOnce(attach.promise);

    const loading = session.load(URL, 0);
    const destroying = session.destroy();
    attach.resolve();
    await loading;
    await destroying;
    expect(player.load).not.toHaveBeenCalled();
  });
});

describe('playback rate', () => {
  it("sets Shaka's rate once loaded, without the trick-play track", async () => {
    const session = adapter.createShakaSession(media);
    await session.load(URL, 0);
    session.setPlaybackRate(1.5);
    expect(lastPlayer().trickPlay).toHaveBeenCalledWith(1.5, false);
  });

  it('is ignored before the load resolves', async () => {
    const session = adapter.createShakaSession(media);
    const load = deferred();
    lastPlayer().load.mockReturnValueOnce(load.promise);
    const loading = session.load(URL, 0);
    session.setPlaybackRate(2);
    load.resolve();
    await loading;
    expect(lastPlayer().trickPlay).not.toHaveBeenCalled();
  });

  it('is ignored after a failed load and after destroy', async () => {
    const session = adapter.createShakaSession(media);
    lastPlayer().load.mockReturnValueOnce(Promise.reject(shakaError(1)));
    await expect(session.load(URL, 0)).rejects.toBeDefined();
    session.setPlaybackRate(2);

    const other = adapter.createShakaSession(media);
    await other.load(URL, 0);
    await other.destroy();
    other.setPlaybackRate(2);
    for (const player of shaka.Player.instances) {
      expect(player.trickPlay).not.toHaveBeenCalled();
    }
  });

  it('logs a throwing trickPlay and never throws', async () => {
    const session = adapter.createShakaSession(media);
    await session.load(URL, 0);
    lastPlayer().trickPlay.mockImplementationOnce(() => {
      throw new Error('no rate controller');
    });
    expect(() => session.setPlaybackRate(2)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      'Shaka trickPlay failed',
      expect.any(Error),
    );
  });
});

describe('errors', () => {
  it('forwards a critical error with a readable message', () => {
    const onError = jest.fn();
    adapter.createShakaSession(media, {onError});
    lastPlayer().fire('error', shakaError(1));
    expect(onError).toHaveBeenCalledWith(
      'A network error stopped playback. Check the connection to the server.',
    );
  });

  it('ignores recoverable errors', () => {
    const onError = jest.fn();
    adapter.createShakaSession(media, {onError});
    lastPlayer().fire('error', shakaError(1, 1));
    expect(onError).not.toHaveBeenCalled();
  });

  it('ignores errors after destroy()', async () => {
    const onError = jest.fn();
    const session = adapter.createShakaSession(media, {onError});
    const player = lastPlayer();
    await session.destroy();
    player.fire('error', shakaError(7));
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    [3, "This video couldn't be decoded."],
    [4, "The server's stream couldn't be read."],
    [5, "This video couldn't be streamed."],
    [6, 'Video playback error.'],
  ])('maps category %i', (category, message) => {
    expect(adapter.shakaErrorMessage(shakaError(category))).toBe(message);
  });

  it('falls back for anything that is not a Shaka error', () => {
    expect(adapter.shakaErrorMessage(new Error('boom'))).toBe(
      adapter.UNKNOWN_SHAKA_ERROR,
    );
    expect(adapter.shakaErrorMessage(undefined)).toBe(
      adapter.UNKNOWN_SHAKA_ERROR,
    );
  });
});

describe('buffering', () => {
  it("forwards Shaka's buffering event", () => {
    const onBuffering = jest.fn();
    adapter.createShakaSession(media, {onBuffering});
    lastPlayer().fire('buffering', undefined, {buffering: true});
    lastPlayer().fire('buffering', undefined, {buffering: false});
    expect(onBuffering.mock.calls).toEqual([[true], [false]]);
  });

  it('ignores buffering events after destroy()', async () => {
    const onBuffering = jest.fn();
    const session = adapter.createShakaSession(media, {onBuffering});
    const player = lastPlayer();
    await session.destroy();
    player.fire('buffering', undefined, {buffering: true});
    expect(onBuffering).not.toHaveBeenCalled();
  });

  it("reads Shaka's isBuffering() once loaded, and not after destroy", async () => {
    const session = adapter.createShakaSession(media);
    const player = lastPlayer();
    player.isBuffering.mockReturnValue(true);
    expect(session.isBuffering()).toBe(false);
    await session.load('http://server/master.m3u8', 0);
    expect(session.isBuffering()).toBe(true);
    await session.destroy();
    expect(session.isBuffering()).toBe(false);
  });

  it('answers false when isBuffering() throws', async () => {
    const session = adapter.createShakaSession(media);
    await session.load('http://server/master.m3u8', 0);
    lastPlayer().isBuffering.mockImplementation(() => {
      throw new Error('gone');
    });
    expect(session.isBuffering()).toBe(false);
  });
});

describe('destroy', () => {
  it('unloads, then destroys, and clears the document polyfill', async () => {
    const session = adapter.createShakaSession(media);
    const player = lastPlayer();
    const order: string[] = [];
    player.unload.mockImplementation(async () => {
      order.push('unload');
    });
    player.destroy.mockImplementation(async () => {
      order.push('destroy');
    });

    await session.destroy();
    expect(order).toEqual(['unload', 'destroy']);
    expect(vegaGlobal.gmedia).toBeNull();
  });

  it('is safe to call twice', async () => {
    const session = adapter.createShakaSession(media);
    const first = session.destroy();
    expect(session.destroy()).toBe(first);
    await first;
    expect(lastPlayer().destroy).toHaveBeenCalledTimes(1);
  });

  it('unloads and destroys after a failed load', async () => {
    const session = adapter.createShakaSession(media);
    const player = lastPlayer();
    player.load.mockReturnValueOnce(Promise.reject(shakaError(4)));
    await expect(session.load(URL, 0)).rejects.toBeDefined();

    await session.destroy();
    expect(player.unload).toHaveBeenCalledTimes(1);
    expect(player.destroy).toHaveBeenCalledTimes(1);
  });

  it('still destroys when unload fails, and never rejects', async () => {
    const session = adapter.createShakaSession(media);
    const player = lastPlayer();
    player.unload.mockReturnValueOnce(Promise.reject(shakaError(7)));
    player.destroy.mockReturnValueOnce(Promise.reject(new Error('gone')));

    await expect(session.destroy()).resolves.toBeUndefined();
    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("leaves another session's player in the document polyfill", async () => {
    const first = adapter.createShakaSession(media);
    const other = {name: 'next-player'} as unknown as VideoPlayer;
    adapter.createShakaSession(other);
    await first.destroy();
    expect(vegaGlobal.gmedia).toBe(other);
  });
});

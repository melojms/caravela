/* eslint-env jest */
// Stand-in for Amazon's Vega Shaka Player build, which lives in the
// gitignored src/vendor/shaka/. jest.config.json maps the import here, so the
// tests run on a clean checkout.

type Listener = (event: {type: string; detail?: unknown}) => void;

/**
 * A fake `shaka.Player`: spies for the calls the app makes, and `fire()` to
 * send Shaka events. Tests read `Player.instances` and change a call's
 * result with e.g. `player.unload.mockReturnValueOnce(promise)`.
 */
class Player {
  static instances: Player[] = [];
  static version = 'v4.16.13-mock';
  /**
   * What every instance's `load()` returns. The app calls it before a test
   * can reach the instance, so tests hold it open or fail it here:
   * `Player.loadResult.mockReturnValueOnce(promise)`.
   */
  static loadResult = jest.fn(() => Promise.resolve());

  private listeners = new Map<string, Set<Listener>>();

  attach = jest.fn((_media: unknown) => Promise.resolve());
  configure = jest.fn((_config: unknown, _value?: unknown) => true);
  load = jest.fn((_url: string, _startTime?: number) => Player.loadResult());
  unload = jest.fn(() => Promise.resolve());
  trickPlay = jest.fn((_rate: number, _useTrickPlayTrack?: boolean) => {});
  destroy = jest.fn(() => Promise.resolve());

  addEventListener = jest.fn((type: string, listener: Listener) => {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  });
  removeEventListener = jest.fn((type: string, listener: Listener) => {
    this.listeners.get(type)?.delete(listener);
  });

  constructor() {
    Player.instances.push(this);
  }

  /** Dispatches a Shaka event (e.g. `error` with a `shaka.util.Error`). */
  fire(type: string, detail?: unknown) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({type, detail});
    }
  }
}

const shaka = {
  Player,
  polyfill: {installAll: jest.fn()},
  net: {
    NetworkingEngine: {
      PluginPriority: {FALLBACK: 1, PREFERRED: 2, APPLICATION: 3},
      registerScheme: jest.fn(),
      unregisterScheme: jest.fn(),
    },
    HttpFetchPlugin: {parse: jest.fn()},
  },
  media: {
    ClosedCaptionParser: {unregisterParser: jest.fn()},
  },
  util: {
    Error: {
      Category: {
        NETWORK: 1,
        TEXT: 2,
        MEDIA: 3,
        MANIFEST: 4,
        STREAMING: 5,
        DRM: 6,
        PLAYER: 7,
        CAST: 8,
        STORAGE: 9,
        ADS: 10,
      },
      Severity: {RECOVERABLE: 1, CRITICAL: 2},
    },
  },
};

export type FakeShaka = typeof shaka;
export type FakeShakaPlayer = Player;
export default shaka;

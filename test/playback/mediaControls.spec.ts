import type {
  MediaSessionState,
  PlaybackStatus,
} from '@amazon-devices/kepler-media-controls';
import {KeplerMediaControlHandler} from '@amazon-devices/react-native-w3cmedia';

import {
  SEEK_BACK_STEP_MS,
  SEEK_FORWARD_STEP_MS,
} from '../../src/components/SeekBar';
import {
  MediaControlsHandler,
  type MediaControlsTarget,
  timeValueMs,
} from '../../src/playback/mediaControls';

const makeTarget = (title?: string): jest.Mocked<MediaControlsTarget> => ({
  play: jest.fn(),
  pause: jest.fn(),
  togglePause: jest.fn(),
  seekTo: jest.fn(),
  seekBy: jest.fn(),
  title,
  paused: false,
});

let target: jest.Mocked<MediaControlsTarget>;
let handler: MediaControlsHandler;
let warn: jest.SpyInstance;

beforeEach(() => {
  target = makeTarget('Big Buck Bunny');
  handler = new MediaControlsHandler(target);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// The package's index loads a native module, so no runtime import here.
const PLAYING = 'PLAYING' as PlaybackStatus.PLAYING;
const PAUSED = 'PAUSED' as PlaybackStatus.PAUSED;

const setPaused = (paused: boolean) => {
  (target as unknown as {paused: boolean}).paused = paused;
};

/** Every target call, so a test can check nothing else happened. */
const calls = () =>
  Object.fromEntries(
    Object.entries(target)
      .filter(([, value]) => jest.isMockFunction(value))
      .map(([name, fn]) => [name, (fn as jest.Mock).mock.calls]),
  );

it("is w3cmedia's handler, so the defaults cover the rest", () => {
  expect(handler).toBeInstanceOf(KeplerMediaControlHandler);
});

it.each([
  ['handlePlay', 'play'],
  ['handlePause', 'pause'],
  // "Alexa, stop" pauses; the viewer stays on the player.
  ['handleStop', 'pause'],
  ['handleTogglePlayPause', 'togglePause'],
] as const)('%s → %s()', async (command, method) => {
  await handler[command]();
  expect(target[method]).toHaveBeenCalledTimes(1);
  expect(target[method]).toHaveBeenCalledWith();
  const others = Object.entries(calls()).filter(([name]) => name !== method);
  expect(others.every(([, c]) => c.length === 0)).toBe(true);
});

it('handles a pause with its context like any pause', async () => {
  await handler.handlePause(undefined, {source: 'USER' as never});
  expect(target.pause).toHaveBeenCalledTimes(1);
});

it.each([
  [{seconds: 30, nanoseconds: 0}, 30_000],
  [{seconds: 10, nanoseconds: 500_000_000}, 10_500],
  [{seconds: 0, nanoseconds: 250_000_000}, 250],
])('skips forward %j as %d ms', async (delta, ms) => {
  await handler.handleSkipForward(delta);
  expect(target.seekBy).toHaveBeenCalledWith(ms);
  expect(target.seekTo).not.toHaveBeenCalled();
});

it.each([
  [{seconds: 10, nanoseconds: 0}, -10_000],
  [{seconds: 1, nanoseconds: 1_000_000}, -1001],
])('skips backward %j as %d ms', async (delta, ms) => {
  await handler.handleSkipBackward(delta);
  expect(target.seekBy).toHaveBeenCalledWith(ms);
});

it("treats a missing nanoseconds as 0, as w3cmedia's default does", async () => {
  await handler.handleSkipForward({seconds: 5} as never);
  expect(target.seekBy).toHaveBeenCalledWith(5000);
});

it('ignores a skip with no seconds', async () => {
  await handler.handleSkipForward({} as never);
  await handler.handleSkipBackward({nanoseconds: 5} as never);
  expect(target.seekBy).not.toHaveBeenCalled();
});

it("steps the remote's ⏩ and ⏪ like the overlay's buttons", async () => {
  await handler.handleFastForward();
  await handler.handleRewind();
  expect(target.seekBy.mock.calls).toEqual([
    [SEEK_FORWARD_STEP_MS],
    [-SEEK_BACK_STEP_MS],
  ]);
});

it('seeks to a position', async () => {
  await handler.handleSeek({seconds: 754, nanoseconds: 200_000_000});
  expect(target.seekTo).toHaveBeenCalledWith(754_200);
  expect(target.seekBy).not.toHaveBeenCalled();
});

it('ignores a seek with no seconds', async () => {
  await handler.handleSeek({} as never);
  expect(target.seekTo).not.toHaveBeenCalled();
});

it('starts over from 0', async () => {
  await handler.handleStartOver();
  expect(target.seekTo).toHaveBeenCalledWith(0);
});

it("doesn't call w3cmedia's default for the commands it handles", async () => {
  const proto = KeplerMediaControlHandler.prototype;
  const spies = (
    [
      'handlePlay',
      'handlePause',
      'handleStop',
      'handleTogglePlayPause',
      'handleSkipForward',
      'handleSkipBackward',
      'handleFastForward',
      'handleRewind',
      'handleSeek',
      'handleStartOver',
      'handleGetMetadataInfo',
    ] as const
  ).map((name) => jest.spyOn(proto, name));
  const time = {seconds: 1, nanoseconds: 0};
  await handler.handlePlay();
  await handler.handlePause();
  await handler.handleStop();
  await handler.handleTogglePlayPause();
  await handler.handleSkipForward(time);
  await handler.handleSkipBackward(time);
  await handler.handleFastForward();
  await handler.handleRewind();
  await handler.handleSeek(time);
  await handler.handleStartOver();
  await handler.handleGetMetadataInfo('item-1' as never);
  for (const spy of spies) {
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  }
});

describe('handleGetMetadataInfo', () => {
  it("answers with the item's title and the id asked for", async () => {
    const id = {contentId: 'item-1'} as never;
    await expect(handler.handleGetMetadataInfo(id)).resolves.toEqual({
      mediaId: id,
      title: 'Big Buck Bunny',
      artwork: [],
    });
  });

  it("doesn't throw without a title", async () => {
    handler = new MediaControlsHandler(makeTarget());
    const metadata = await handler.handleGetMetadataInfo('item-1' as never);
    expect(metadata).toEqual({mediaId: 'item-1', artwork: []});
  });

  it('reads the title when asked, not when made', async () => {
    const live: {-readonly [K in keyof MediaControlsTarget]: MediaControlsTarget[K]} =
      makeTarget();
    handler = new MediaControlsHandler(live);
    live.title = 'Later';
    const metadata = await handler.handleGetMetadataInfo('item-1' as never);
    expect(metadata.title).toBe('Later');
  });
});

describe('reportPaused', () => {
  /** w3cmedia's state object, reached through the player it gives the handler. */
  const withStateUtil = () => {
    const util = {
      playbackStatus: PLAYING as PlaybackStatus,
      updateState: jest.fn(),
    };
    handler.setMediaPlayer({mediaControlStateUtil: util} as never);
    return util;
  };

  it("sets w3cmedia's state to paused, then sends it to Vega", () => {
    const util = withStateUtil();
    const sent: PlaybackStatus[] = [];
    util.updateState.mockImplementation(() => sent.push(util.playbackStatus));
    handler.reportPaused();
    expect(util.playbackStatus).toBe(PAUSED);
    expect(sent).toEqual([PAUSED]);
    expect(util.updateState).toHaveBeenCalledWith();
    expect(warn).not.toHaveBeenCalled();
  });

  it('sends it every time', () => {
    const util = withStateUtil();
    handler.reportPaused();
    util.playbackStatus = PLAYING;
    handler.reportPaused();
    expect(util.updateState).toHaveBeenCalledTimes(2);
    expect(util.playbackStatus).toBe(PAUSED);
  });

  it.each([
    ['no player', undefined],
    ['a null player', null],
    ['no state object', {}],
    ['a null state object', {mediaControlStateUtil: null}],
    ['no updateState', {mediaControlStateUtil: {playbackStatus: 'PLAYING'}}],
    [
      'an updateState that throws',
      {
        mediaControlStateUtil: {
          updateState: () => {
            throw new Error('no server');
          },
        },
      },
    ],
    [
      'a state object that throws when read',
      Object.defineProperty({}, 'mediaControlStateUtil', {
        get: () => {
          throw new Error('gone');
        },
      }),
    ],
  ])("doesn't throw with %s, and warns once", (_, player) => {
    (handler as {mediaPlayer: unknown}).mediaPlayer = player;
    expect(() => {
      handler.reportPaused();
      handler.reportPaused();
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('handleGetSessionState', () => {
  const state = (id: number): MediaSessionState => ({
    id: {id},
    playbackState: {
      playbackStatus: PLAYING,
      playbackSpeed: 1,
      position: {
        updatedAtTime: {seconds: 1702965600, nanoseconds: 0},
        position: {seconds: 10, nanoseconds: 999999999},
      },
    },
    capabilities: {actions: [], speeds: [1], ratings: []} as never,
    controls: [{name: 'X-ray', state: 'off'}],
  });

  /** What w3cmedia's default answers. */
  const fromW3cmedia = (states: MediaSessionState[]) =>
    jest
      .spyOn(KeplerMediaControlHandler.prototype, 'handleGetSessionState')
      .mockResolvedValue(states as never);

  it("asks w3cmedia's default, for the session asked about", async () => {
    const spy = fromW3cmedia([state(1)]);
    await handler.handleGetSessionState({id: 1});
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({id: 1});
  });

  it("returns w3cmedia's state as is while playing", async () => {
    const states = [state(1)];
    fromW3cmedia(states);
    await expect(handler.handleGetSessionState()).resolves.toBe(states);
  });

  it('says paused while the controller is, and changes nothing else', async () => {
    setPaused(true);
    fromW3cmedia([state(1), state(2)]);
    const result = await handler.handleGetSessionState();
    expect(result).toEqual(
      [state(1), state(2)].map((s) => ({
        ...s,
        playbackState: {
          ...s.playbackState,
          playbackStatus: PAUSED,
        },
      })),
    );
  });

  it("leaves w3cmedia's own objects alone", async () => {
    setPaused(true);
    const original = state(1);
    fromW3cmedia([original]);
    await handler.handleGetSessionState();
    expect(original).toEqual(state(1));
  });

  it('reads paused when asked, not when made', async () => {
    fromW3cmedia([state(1)]);
    const [before] = await handler.handleGetSessionState();
    setPaused(true);
    const [after] = await handler.handleGetSessionState();
    expect(before.playbackState.playbackStatus).toBe(PLAYING);
    expect(after.playbackState.playbackStatus).toBe(PAUSED);
  });

  it("passes on w3cmedia's error", async () => {
    setPaused(true);
    jest
      .spyOn(KeplerMediaControlHandler.prototype, 'handleGetSessionState')
      .mockRejectedValue(new Error('Unable to get session state'));
    await expect(handler.handleGetSessionState()).rejects.toThrow(
      'Unable to get session state',
    );
  });
});

describe('timeValueMs', () => {
  it.each([
    [{seconds: 0, nanoseconds: 0}, 0],
    [{seconds: 2, nanoseconds: 999_999_999}, 2999.999999],
    [{seconds: 3, nanoseconds: undefined}, 3000],
    [{seconds: undefined, nanoseconds: 1}, NaN],
  ])('%j → %d', (time, ms) => {
    expect(timeValueMs(time as never)).toBe(ms);
  });
});

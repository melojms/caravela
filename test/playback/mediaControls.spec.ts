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
});

let target: jest.Mocked<MediaControlsTarget>;
let handler: MediaControlsHandler;

beforeEach(() => {
  target = makeTarget('Big Buck Bunny');
  handler = new MediaControlsHandler(target);
});

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

it("leaves the session state to w3cmedia's default", async () => {
  const spy = jest.spyOn(
    KeplerMediaControlHandler.prototype,
    'handleGetSessionState',
  );
  await handler.handleGetSessionState();
  expect(spy).toHaveBeenCalledTimes(1);
  spy.mockRestore();
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

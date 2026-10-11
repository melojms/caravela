import type {Api} from '@jellyfin/sdk';
import {getSessionApi} from '@jellyfin/sdk/lib/utils/api/session-api';

import {
  PAUSED_PROGRESS_INTERVAL_MS,
  PROGRESS_INTERVAL_MS,
  createPlaybackReporter,
} from '../../src/playback/reporting';
import type {
  PlaybackSession,
  PlaybackSnapshot,
} from '../../src/playback/types';

jest.mock('@jellyfin/sdk/lib/utils/api/session-api', () => ({
  getSessionApi: jest.fn(),
}));

const sessionApi = {
  reportPlaybackStart: jest.fn(),
  reportPlaybackProgress: jest.fn(),
  reportPlaybackStopped: jest.fn(),
};

const api = {} as Api;

const SESSION: PlaybackSession = {
  itemId: 'item-1',
  mediaSourceId: 'source-1',
  playSessionId: 'play-1',
  playMethod: 'DirectPlay',
  mode: 'url',
  url: 'http://server/Videos/item-1/stream?static=true',
  startMs: 60000,
  audioStreamIndex: 1,
  subtitleStreamIndex: 3,
  durationMs: 7200000,
};

let snapshot: PlaybackSnapshot;

const setup = (session: PlaybackSession = SESSION) =>
  createPlaybackReporter(api, session, () => snapshot);

const deferred = () => {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};

const progressCalls = () =>
  sessionApi.reportPlaybackProgress.mock.calls.map(
    ([params]) => params.playbackProgressInfo,
  );

const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (getSessionApi as jest.Mock).mockReturnValue(sessionApi);
  sessionApi.reportPlaybackStart.mockResolvedValue({});
  sessionApi.reportPlaybackProgress.mockResolvedValue({});
  sessionApi.reportPlaybackStopped.mockResolvedValue({});
  snapshot = {positionMs: 60000, isPaused: false};
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  jest.useRealTimers();
});

describe('start', () => {
  it('sends start with the session fields, then progress every 3 s', async () => {
    const reporter = setup();
    await reporter.start();

    expect(getSessionApi).toHaveBeenCalledWith(api);
    expect(sessionApi.reportPlaybackStart).toHaveBeenCalledWith({
      playbackStartInfo: {
        ItemId: 'item-1',
        MediaSourceId: 'source-1',
        PlaySessionId: 'play-1',
        PlayMethod: 'DirectPlay',
        PositionTicks: 600000000,
        IsPaused: false,
        CanSeek: true,
        IsMuted: false,
        AudioStreamIndex: 1,
        SubtitleStreamIndex: 3,
        RepeatMode: 'RepeatNone',
        PlaybackOrder: 'Default',
      },
    });
    expect(sessionApi.reportPlaybackProgress).not.toHaveBeenCalled();

    await advance(PROGRESS_INTERVAL_MS - 1);
    expect(sessionApi.reportPlaybackProgress).not.toHaveBeenCalled();

    snapshot = {positionMs: 63000, isPaused: false};
    await advance(1);
    expect(progressCalls()).toEqual([
      expect.objectContaining({
        ItemId: 'item-1',
        MediaSourceId: 'source-1',
        PlaySessionId: 'play-1',
        PlayMethod: 'DirectPlay',
        PositionTicks: 630000000,
        IsPaused: false,
        CanSeek: true,
        AudioStreamIndex: 1,
        SubtitleStreamIndex: 3,
      }),
    ]);

    await advance(PROGRESS_INTERVAL_MS * 2);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(3);
  });

  it('only starts once', async () => {
    const reporter = setup();
    await reporter.start();
    await reporter.start();
    expect(sessionApi.reportPlaybackStart).toHaveBeenCalledTimes(1);
    await advance(PROGRESS_INTERVAL_MS);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(1);
  });

  it('uses the 15 s cadence when it starts paused', async () => {
    snapshot = {positionMs: 0, isPaused: true};
    await setup().start();
    await advance(PAUSED_PROGRESS_INTERVAL_MS - 1);
    expect(sessionApi.reportPlaybackProgress).not.toHaveBeenCalled();
    await advance(1);
    expect(progressCalls()).toEqual([
      expect.objectContaining({IsPaused: true, PositionTicks: 0}),
    ]);
  });

  it('leaves the stream indexes out when the session has none', async () => {
    await setup({
      ...SESSION,
      audioStreamIndex: undefined,
      subtitleStreamIndex: undefined,
    }).start();
    const [[{playbackStartInfo}]] = sessionApi.reportPlaybackStart.mock.calls;
    expect(playbackStartInfo.AudioStreamIndex).toBeUndefined();
    expect(playbackStartInfo.SubtitleStreamIndex).toBeUndefined();
  });
});

describe('ticks', () => {
  it('converts ms to whole ticks and clamps negative positions', async () => {
    const reporter = setup();
    await reporter.start();

    snapshot = {positionMs: 1234.56789, isPaused: false};
    await advance(PROGRESS_INTERVAL_MS);
    snapshot = {positionMs: -50, isPaused: false};
    await advance(PROGRESS_INTERVAL_MS);

    expect(progressCalls().map(info => info.PositionTicks)).toEqual([
      12345679, 0,
    ]);
  });
});

describe('update', () => {
  it('sends progress right away and resets the 3 s timer', async () => {
    const reporter = setup();
    await reporter.start();

    await advance(2000);
    snapshot = {positionMs: 90000, isPaused: false};
    await reporter.update();
    expect(progressCalls()).toEqual([
      expect.objectContaining({PositionTicks: 900000000, IsPaused: false}),
    ]);

    // The old timer would have fired 1 s later; the new one fires at 3 s.
    await advance(PROGRESS_INTERVAL_MS - 1);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(2);
  });

  it('switches to 15 s on pause and back to 3 s on play', async () => {
    const reporter = setup();
    await reporter.start();

    snapshot = {positionMs: 61000, isPaused: true};
    await reporter.update();
    expect(progressCalls()).toEqual([
      expect.objectContaining({IsPaused: true, PositionTicks: 610000000}),
    ]);

    await advance(PAUSED_PROGRESS_INTERVAL_MS - 1);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(2);
    await advance(PAUSED_PROGRESS_INTERVAL_MS);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(3);

    snapshot = {positionMs: 61000, isPaused: false};
    await reporter.update();
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(4);
    await advance(PROGRESS_INTERVAL_MS);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(5);
  });

  it('picks up the paused state on its own at the next tick', async () => {
    const reporter = setup();
    await reporter.start();
    snapshot = {positionMs: 61000, isPaused: true};
    await advance(PROGRESS_INTERVAL_MS);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(1);
    await advance(PROGRESS_INTERVAL_MS * 4);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(1);
    await advance(PAUSED_PROGRESS_INTERVAL_MS - PROGRESS_INTERVAL_MS * 4);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(2);
  });

  it('does nothing before start', async () => {
    await setup().update();
    await advance(PAUSED_PROGRESS_INTERVAL_MS);
    expect(sessionApi.reportPlaybackProgress).not.toHaveBeenCalled();
  });

  it('waits for an in-flight report, then sends the latest state', async () => {
    const reporter = setup();
    const start = deferred();
    sessionApi.reportPlaybackStart.mockReturnValue(start.promise);
    const started = reporter.start();

    snapshot = {positionMs: 61000, isPaused: true};
    const updated = reporter.update();
    snapshot = {positionMs: 62000, isPaused: true};
    reporter.update();
    expect(sessionApi.reportPlaybackProgress).not.toHaveBeenCalled();

    start.resolve();
    await started;
    await updated;
    expect(progressCalls()).toEqual([
      expect.objectContaining({PositionTicks: 620000000, IsPaused: true}),
    ]);
  });
});

describe('stop', () => {
  it('sends stopped with the final position', async () => {
    const reporter = setup();
    await reporter.start();
    snapshot = {positionMs: 4500000, isPaused: false};
    await reporter.stop();

    expect(sessionApi.reportPlaybackStopped).toHaveBeenCalledWith({
      playbackStopInfo: {
        ItemId: 'item-1',
        MediaSourceId: 'source-1',
        PlaySessionId: 'play-1',
        PositionTicks: 45000000000,
        Failed: false,
      },
    });
  });

  it.each(['DirectStream', 'Transcode'] as const)(
    'sends stopped for %s too (the server ends the transcode)',
    async playMethod => {
      const reporter = setup({...SESSION, playMethod});
      await reporter.start();
      await reporter.stop();
      expect(sessionApi.reportPlaybackStopped).toHaveBeenCalledWith({
        playbackStopInfo: expect.objectContaining({PlaySessionId: 'play-1'}),
      });
    },
  );

  it('is safe to call twice', async () => {
    const reporter = setup();
    await reporter.start();
    const first = reporter.stop();
    const second = reporter.stop();
    expect(second).toBe(first);
    await first;
    await reporter.stop();
    expect(sessionApi.reportPlaybackStopped).toHaveBeenCalledTimes(1);
  });

  it('sends nothing more after it', async () => {
    const reporter = setup();
    await reporter.start();
    await reporter.stop();
    await reporter.update();
    await reporter.start();
    await advance(PAUSED_PROGRESS_INTERVAL_MS * 2);
    expect(sessionApi.reportPlaybackStart).toHaveBeenCalledTimes(1);
    expect(sessionApi.reportPlaybackProgress).not.toHaveBeenCalled();
  });

  it('sends nothing when playback never started', async () => {
    const reporter = setup();
    await reporter.stop();
    await reporter.start();
    expect(sessionApi.reportPlaybackStopped).not.toHaveBeenCalled();
    expect(sessionApi.reportPlaybackStart).not.toHaveBeenCalled();
  });

  it('still sends stopped after earlier reports failed', async () => {
    sessionApi.reportPlaybackStart.mockRejectedValue(new Error('offline'));
    sessionApi.reportPlaybackProgress.mockRejectedValue(new Error('offline'));
    const reporter = setup();
    await reporter.start();
    await advance(PROGRESS_INTERVAL_MS);
    await expect(reporter.stop()).resolves.toBeUndefined();
    expect(sessionApi.reportPlaybackStopped).toHaveBeenCalledTimes(1);
  });

  it('sends stopped after an in-flight progress, with the position at stop()', async () => {
    const reporter = setup();
    await reporter.start();
    const progress = deferred();
    sessionApi.reportPlaybackProgress.mockReturnValue(progress.promise);
    await advance(PROGRESS_INTERVAL_MS);

    snapshot = {positionMs: 70000, isPaused: false};
    const stopped = reporter.stop();
    snapshot = {positionMs: 0, isPaused: false};
    await Promise.resolve();
    expect(sessionApi.reportPlaybackStopped).not.toHaveBeenCalled();

    progress.resolve();
    await stopped;
    expect(sessionApi.reportPlaybackStopped).toHaveBeenCalledWith({
      playbackStopInfo: expect.objectContaining({PositionTicks: 700000000}),
    });
  });

  it('never rejects when stopped itself fails', async () => {
    sessionApi.reportPlaybackStopped.mockRejectedValue(new Error('500'));
    const reporter = setup();
    await reporter.start();
    await expect(reporter.stop()).resolves.toBeUndefined();
  });
});

describe('errors', () => {
  it('keeps the timer going after a rejected report', async () => {
    sessionApi.reportPlaybackStart.mockRejectedValue(new Error('offline'));
    sessionApi.reportPlaybackProgress.mockRejectedValueOnce(new Error('500'));
    const reporter = setup();
    await expect(reporter.start()).resolves.toBeUndefined();

    await advance(PROGRESS_INTERVAL_MS);
    await advance(PROGRESS_INTERVAL_MS);
    await advance(PROGRESS_INTERVAL_MS);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledWith(
      'Reporting playback progress failed',
      expect.any(Error),
    );
  });

  it('skips a tick while a report is still in flight', async () => {
    const reporter = setup();
    await reporter.start();
    const slow = deferred();
    sessionApi.reportPlaybackProgress.mockReturnValueOnce(slow.promise);

    await advance(PROGRESS_INTERVAL_MS);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(1);
    await advance(PROGRESS_INTERVAL_MS * 2);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(1);

    slow.resolve();
    await advance(PROGRESS_INTERVAL_MS);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(2);
  });

  it('skips a tick while start is still in flight', async () => {
    const start = deferred();
    sessionApi.reportPlaybackStart.mockReturnValue(start.promise);
    const reporter = setup();
    const started = reporter.start();
    await advance(PROGRESS_INTERVAL_MS);
    expect(sessionApi.reportPlaybackProgress).not.toHaveBeenCalled();
    start.resolve();
    await started;
    await advance(PROGRESS_INTERVAL_MS);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(1);
  });

  it('survives a throwing snapshot and stops with the last known position', async () => {
    let fail = false;
    const reporter = createPlaybackReporter(api, SESSION, () => {
      if (fail) {
        throw new Error('player gone');
      }
      return snapshot;
    });
    await reporter.start();
    snapshot = {positionMs: 66000, isPaused: false};
    await advance(PROGRESS_INTERVAL_MS);

    fail = true;
    await advance(PROGRESS_INTERVAL_MS);
    expect(sessionApi.reportPlaybackProgress).toHaveBeenCalledTimes(1);
    await reporter.stop();
    expect(sessionApi.reportPlaybackStopped).toHaveBeenCalledWith({
      playbackStopInfo: expect.objectContaining({PositionTicks: 660000000}),
    });
  });
});

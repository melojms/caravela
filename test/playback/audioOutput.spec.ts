import {
  AudioEvent,
  AudioManager,
  AudioRole,
  AudioStatus,
  emitAudioEvent,
  headsetEvent,
  resetAudioManager,
} from '../__mocks__/keplerscript-audio-lib';
import {watchAudioOutput} from '../../src/playback/audioOutput';

const register = AudioManager.registerAudioEventObserverAsync;
const unregister = AudioManager.unregisterAudioEventObserverAsync;

/** Runs the timers due in `ms` and the promises they settle. */
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

let dolby: boolean;
let readDolby: jest.Mock<boolean, []>;
let onChange: jest.Mock<void, [boolean]>;
let stops: (() => void)[];
let log: jest.SpyInstance;
let warn: jest.SpyInstance;

/** Starts a watcher (stopped after the test) and lets it register. */
const start = async (options?: {settleMs?: number[]}) => {
  const stop = watchAudioOutput(onChange, {readDolby, ...options});
  stops.push(stop);
  await advance(0);
  return stop;
};

beforeEach(() => {
  jest.useFakeTimers();
  resetAudioManager();
  dolby = true;
  readDolby = jest.fn(() => dolby);
  onChange = jest.fn();
  stops = [];
  log = jest.spyOn(console, 'log').mockImplementation(() => {});
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  stops.forEach((stop) => stop());
  await advance(0);
  jest.useRealTimers();
  log.mockRestore();
  warn.mockRestore();
});

describe('watchAudioOutput', () => {
  it('reads the baseline and registers the observer on start', async () => {
    await start();

    expect(readDolby).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reads again 1 s and 2.5 s after an event, without a callback when nothing changed', async () => {
    await start();
    readDolby.mockClear();

    emitAudioEvent(headsetEvent(true));
    await advance(999);
    expect(readDolby).not.toHaveBeenCalled();
    await advance(1);
    expect(readDolby).toHaveBeenCalledTimes(1);
    await advance(1500);
    expect(readDolby).toHaveBeenCalledTimes(2);
    await advance(10_000);

    expect(readDolby).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('logs each output event', async () => {
    await start();
    log.mockClear();

    emitAudioEvent(headsetEvent(true));

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0].join(' ')).toContain('"connect":true');
  });

  it('reports a change seen at the 1 s read once', async () => {
    await start();

    emitAudioEvent(headsetEvent(true));
    dolby = false;
    await advance(1000);
    expect(onChange).toHaveBeenCalledWith(false);
    await advance(1500);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('reports a change only visible at the 2.5 s read', async () => {
    await start();

    emitAudioEvent(headsetEvent(true));
    await advance(1000);
    dolby = false;
    await advance(1500);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('restarts the schedule on a second event and reports once', async () => {
    await start();
    readDolby.mockClear();

    emitAudioEvent(headsetEvent(false));
    await advance(800);
    dolby = false;
    emitAudioEvent(headsetEvent(true));
    await advance(999);
    expect(readDolby).not.toHaveBeenCalled();
    await advance(1);
    expect(readDolby).toHaveBeenCalledTimes(1);
    await advance(10_000);

    expect(readDolby).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('reports Dolby gained, then lost', async () => {
    dolby = false;
    await start();

    emitAudioEvent(headsetEvent(false));
    dolby = true;
    await advance(2500);
    emitAudioEvent(headsetEvent(true));
    dolby = false;
    await advance(2500);

    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('uses the given settle delays', async () => {
    await start({settleMs: [200]});
    readDolby.mockClear();

    emitAudioEvent(headsetEvent(true));
    dolby = false;
    await advance(200);
    await advance(10_000);

    expect(readDolby).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('ignores events that are not a sink connecting or going away', async () => {
    await start();
    readDolby.mockClear();
    log.mockClear();

    emitAudioEvent({audioEvent: AudioEvent.VOLUME_UPDATE, volume: 30});
    emitAudioEvent({audioEvent: AudioEvent.SERVER_UP});
    emitAudioEvent({
      ...headsetEvent(true),
      device: 0x10,
      role: AudioRole.ROLE_SOURCE,
    });
    emitAudioEvent(undefined);
    emitAudioEvent('nonsense');
    dolby = false;
    await advance(10_000);

    expect(readDolby).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('counts a device event without a role, or as source and sink, as an output change', async () => {
    await start();

    emitAudioEvent({audioEvent: AudioEvent.DEVICE_STATE_UPDATE, connect: true});
    dolby = false;
    await advance(2500);
    emitAudioEvent({
      ...headsetEvent(false),
      role: AudioRole.ROLE_SOURCE_SINK,
    });
    dolby = true;
    await advance(2500);

    expect(onChange.mock.calls).toEqual([[false], [true]]);
  });

  it('counts a read that throws as no change', async () => {
    await start();

    emitAudioEvent(headsetEvent(true));
    dolby = false;
    readDolby.mockImplementationOnce(() => {
      throw new Error('no answer');
    });
    await advance(1000);
    expect(onChange).not.toHaveBeenCalled();
    await advance(1500);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('takes the first answer as the baseline when the start read throws', async () => {
    readDolby.mockImplementationOnce(() => {
      throw new Error('no answer');
    });
    await start();

    emitAudioEvent(headsetEvent(true));
    await advance(2500);
    expect(onChange).not.toHaveBeenCalled();
    emitAudioEvent(headsetEvent(false));
    dolby = false;
    await advance(2500);

    expect(onChange.mock.calls).toEqual([[false]]);
  });

  it('keeps watching when onChange throws', async () => {
    onChange.mockImplementationOnce(() => {
      throw new Error('player failed');
    });
    await start();

    emitAudioEvent(headsetEvent(true));
    dolby = false;
    await advance(2500);
    emitAudioEvent(headsetEvent(false));
    dolby = true;
    await advance(2500);

    expect(onChange.mock.calls).toEqual([[false], [true]]);
  });

  it('unregisters on stop and calls back no more', async () => {
    const stop = await start();

    emitAudioEvent(headsetEvent(true));
    dolby = false;
    stop();
    await advance(10_000);

    expect(unregister).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores events that arrive after stop', async () => {
    let callback: ((event: unknown) => void) | undefined;
    register.mockImplementationOnce(async (cb) => {
      callback = cb;
      return AudioStatus.STATUS_NO_ERROR;
    });
    const stop = await start();
    stop();
    readDolby.mockClear();

    callback?.(headsetEvent(true));
    dolby = false;
    await advance(10_000);

    expect(readDolby).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('unregisters once, however often it is stopped', async () => {
    const stop = await start();

    stop();
    stop();
    await advance(0);

    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('unregisters once registration finishes when stopped before', async () => {
    let finish: (status: number) => void = () => {};
    register.mockImplementationOnce(
      () => new Promise<number>((resolve) => (finish = resolve)),
    );
    const stop = await start();

    stop();
    await advance(0);
    expect(unregister).not.toHaveBeenCalled();
    finish(AudioStatus.STATUS_NO_ERROR);
    await advance(0);

    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('never fires, and logs once, when registration rejects', async () => {
    register.mockRejectedValueOnce(null);
    const stop = await start();

    emitAudioEvent(headsetEvent(true));
    dolby = false;
    await advance(10_000);
    stop();
    await advance(0);

    expect(onChange).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(unregister).not.toHaveBeenCalled();
  });

  it('never fires, and logs once, when registration answers an error', async () => {
    let callback: ((event: unknown) => void) | undefined;
    register.mockImplementationOnce(async (cb) => {
      callback = cb;
      return AudioStatus.STATUS_ALREADY_EXISTS;
    });
    const stop = await start();

    callback?.(headsetEvent(true));
    dolby = false;
    await advance(10_000);
    stop();
    await advance(0);

    expect(onChange).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0].join(' ')).toContain(
      String(AudioStatus.STATUS_ALREADY_EXISTS),
    );
    // Someone else's observer: not ours to remove.
    expect(unregister).not.toHaveBeenCalled();
  });

  it('logs the registration status', async () => {
    await start();

    expect(log.mock.calls.map((c) => c.join(' '))).toContainEqual(
      expect.stringContaining(`registered ${AudioStatus.STATUS_NO_ERROR}`),
    );
  });

  it('swallows an unregister that rejects', async () => {
    unregister.mockRejectedValueOnce(new Error('dead object'));
    const stop = await start();

    stop();
    await advance(0);

    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('stops the running watcher when a second one starts', async () => {
    await start();
    const second = jest.fn<void, [boolean]>();

    stops.push(watchAudioOutput(second, {readDolby}));
    await advance(0);
    emitAudioEvent(headsetEvent(true));
    dolby = false;
    await advance(2500);

    expect(unregister).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(2);
    expect(unregister.mock.invocationCallOrder[0]).toBeLessThan(
      register.mock.invocationCallOrder[1],
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(false);
  });

  it('registers the second watcher after the first one unregisters', async () => {
    await start();
    let finish: (status: number) => void = () => {};
    unregister.mockImplementationOnce(
      () => new Promise<number>((resolve) => (finish = resolve)),
    );

    stops.push(watchAudioOutput(jest.fn(), {readDolby}));
    await advance(0);
    expect(register).toHaveBeenCalledTimes(1);
    finish(AudioStatus.STATUS_NO_ERROR);
    await advance(0);

    expect(register).toHaveBeenCalledTimes(2);
  });

  it('does not register a watcher stopped while waiting for the previous one', async () => {
    await start();
    let finish: (status: number) => void = () => {};
    unregister.mockImplementationOnce(
      () => new Promise<number>((resolve) => (finish = resolve)),
    );

    const stop = watchAudioOutput(jest.fn(), {readDolby});
    stop();
    finish(AudioStatus.STATUS_NO_ERROR);
    await advance(0);

    expect(register).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledTimes(1);
  });
});

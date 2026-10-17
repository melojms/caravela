// The rule asks for com.amazon.audio.privilege.settings.control for any use
// of the library; Vega's docs say only its setters need it (system apps
// only), and the event observer registers without it on the Fire TV.
// eslint-disable-next-line @amazon-devices/kepler/api-privileges-check
import {
  AudioEvent,
  AudioManager,
  AudioRole,
  AudioStatus,
} from '@amazon-devices/keplerscript-audio-lib';

export type AudioOutputOptions = {
  /** Reads whether Dolby (AC-3 / E-AC-3) is supported right now. */
  readDolby: () => boolean;
  /** Delays after an output event before reading again (default [1000, 2500] ms). */
  settleMs?: number[];
};

/**
 * The output's new formats show up 0.5–1.6 s after its event on the Fire TV
 * (R5-0 probe), so it's read a little later, and again once more.
 */
const DEFAULT_SETTLE_MS = [1000, 2500];

/** The running watcher's stop: Vega allows one audio event observer per app. */
let stopActive: (() => void) | undefined;
/** Settles once the last stopped watcher's observer is gone. */
let released: Promise<unknown> = Promise.resolve();

const show = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/** An output (sink) connecting or going away; a missing role counts. */
const isOutputEvent = (event: unknown) => {
  if (typeof event !== 'object' || event === null) {
    return false;
  }
  const {audioEvent, role} = event as {audioEvent?: unknown; role?: unknown};
  return (
    audioEvent === AudioEvent.DEVICE_STATE_UPDATE &&
    role !== AudioRole.ROLE_SOURCE
  );
};

/**
 * Calls onChange(dolby) when the output's Dolby support differs from the last
 * value seen. Returns a stop function.
 *
 * Starting a watcher stops the running one (one observer per app); the new
 * one registers once the old one has unregistered. A registration that fails
 * logs once and leaves a watcher that never fires. A `readDolby` that throws
 * counts as no change; if the read at start throws, the first answer after
 * an event becomes the baseline without a callback.
 */
export function watchAudioOutput(
  onChange: (dolby: boolean) => void,
  {readDolby, settleMs = DEFAULT_SETTLE_MS}: AudioOutputOptions,
): () => void {
  stopActive?.();

  const read = (): boolean | undefined => {
    try {
      return readDolby();
    } catch {
      return undefined;
    }
  };

  let last = read();
  let stopped = false;
  let failed = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  const check = () => {
    const dolby = read();
    if (stopped || dolby === undefined || dolby === last) {
      return;
    }
    const known = last !== undefined;
    last = dolby;
    if (!known) {
      return;
    }
    try {
      onChange(dolby);
    } catch (reason) {
      console.warn('Audio output change handling failed', reason);
    }
  };

  const onEvent = (event: unknown) => {
    if (stopped || failed || !isOutputEvent(event)) {
      return;
    }
    // Unconditional: a Release build's device log shows it.
    console.log('Audio output event', show(event));
    clearTimers();
    timers = settleMs.map((ms) => setTimeout(check, ms));
  };

  const fail = (reason: unknown) => {
    failed = true;
    console.warn('Audio output observer registration failed', reason);
  };

  /** Whether the observer is ours, so stop removes it. */
  const registered = released.then(async () => {
    if (stopped) {
      return false;
    }
    try {
      const status = await AudioManager.registerAudioEventObserverAsync(
        onEvent,
      );
      if (status !== AudioStatus.STATUS_NO_ERROR) {
        fail(status);
        return false;
      }
      console.log('Audio output observer registered', status);
      return true;
    } catch (reason) {
      fail(reason);
      return false;
    }
  });

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearTimers();
    if (stopActive === stop) {
      stopActive = undefined;
    }
    released = registered
      .then((ours) =>
        ours ? AudioManager.unregisterAudioEventObserverAsync() : undefined,
      )
      .catch(() => undefined);
  };
  stopActive = stop;
  return stop;
}

import type {Api} from '@jellyfin/sdk';
import type {PlaybackProgressInfo} from '@jellyfin/sdk/lib/generated-client/models/playback-progress-info';
import {PlaybackOrder} from '@jellyfin/sdk/lib/generated-client/models/playback-order';
import {RepeatMode} from '@jellyfin/sdk/lib/generated-client/models/repeat-mode';
import {getSessionApi} from '@jellyfin/sdk/lib/utils/api/session-api';

import {msToTicks} from '../api/itemInfo';
import type {PlaybackSession, PlaybackSnapshot} from './types';

/** androidtv `PROGRESS_REPORTING_INTERVAL`. */
export const PROGRESS_INTERVAL_MS = 3000;
/** androidtv `PROGRESS_REPORTING_PAUSE_INTERVAL`: keeps a paused session alive. */
export const PAUSED_PROGRESS_INTERVAL_MS = 15000;

/**
 * Reports one play session to the server (start, progress, stopped).
 * Every method resolves once its report is done and never rejects, so callers
 * can fire and forget.
 */
export type PlaybackReporter = {
  /** Playback began: sends start, then progress every 3 s (15 s if paused). */
  start(): Promise<void>;
  /** Play, pause or seek: sends progress now and restarts the timer. */
  update(): Promise<void>;
  /**
   * Playback ended or was left: sends stopped with the last position (the
   * start position if start never went out), so the server ends the session
   * and its transcode. Safe to repeat.
   */
  stop(): Promise<void>;
};

const positionTicks = (ms: number): number =>
  Math.round(msToTicks(Math.max(0, ms)));

const warn = (what: string, reason: unknown) => {
  if (__DEV__) {
    console.warn(`Reporting playback ${what} failed`, reason);
  }
};

/** Ports androidtv's `PlaySessionService` / `ReportingHelper` report loop. */
export function createPlaybackReporter(
  api: Api,
  session: PlaybackSession,
  getSnapshot: () => PlaybackSnapshot,
): PlaybackReporter {
  const sessionApi = getSessionApi(api);

  let state: 'idle' | 'started' | 'stopped' = 'idle';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let pendingUpdate = false;
  let stopping: Promise<void> | undefined;
  let last: PlaybackSnapshot = {positionMs: session.startMs, isPaused: false};

  // A throwing player must not break reporting: fall back to the last read.
  const readSnapshot = (): PlaybackSnapshot | undefined => {
    try {
      last = getSnapshot();
      return last;
    } catch (reason) {
      warn('snapshot', reason);
      return undefined;
    }
  };

  // Start and progress share their fields (PlaybackStartInfo has the same shape).
  const playingInfo = (snapshot: PlaybackSnapshot): PlaybackProgressInfo => ({
    ItemId: session.itemId,
    MediaSourceId: session.mediaSourceId,
    PlaySessionId: session.playSessionId,
    PlayMethod: session.playMethod,
    PositionTicks: positionTicks(snapshot.positionMs),
    IsPaused: snapshot.isPaused,
    CanSeek: true,
    IsMuted: false,
    // A client-side subtitle switch changes the snapshot, not the session.
    AudioStreamIndex: snapshot.audioStreamIndex ?? session.audioStreamIndex,
    SubtitleStreamIndex:
      snapshot.subtitleStreamIndex ?? session.subtitleStreamIndex,
    RepeatMode: RepeatMode.RepeatNone,
    PlaybackOrder: PlaybackOrder.Default,
  });

  const send = (what: string, request: () => Promise<unknown>) => {
    const pending = (async () => {
      try {
        await request();
      } catch (reason) {
        warn(what, reason);
      }
    })();
    inFlight = pending;
    return pending.then(() => {
      if (inFlight === pending) {
        inFlight = undefined;
      }
      // An update() that arrived mid-request goes out now, with fresh state.
      if (pendingUpdate && state === 'started') {
        pendingUpdate = false;
        const snapshot = readSnapshot();
        if (snapshot) {
          return sendProgress(snapshot);
        }
      }
    });
  };

  const sendProgress = (snapshot: PlaybackSnapshot): Promise<void> =>
    send('progress', () =>
      sessionApi.reportPlaybackProgress({
        playbackProgressInfo: playingInfo(snapshot),
      }),
    );

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const schedule = (isPaused: boolean) => {
    clearTimer();
    timer = setTimeout(
      tick,
      isPaused ? PAUSED_PROGRESS_INTERVAL_MS : PROGRESS_INTERVAL_MS,
    );
  };

  function tick() {
    timer = undefined;
    if (state !== 'started') {
      return;
    }
    const snapshot = readSnapshot();
    // Skip this tick while a report is still on its way; keep the cadence.
    if (snapshot && !inFlight) {
      sendProgress(snapshot);
    }
    schedule((snapshot ?? last).isPaused);
  }

  return {
    start() {
      if (state !== 'idle') {
        return Promise.resolve();
      }
      state = 'started';
      const snapshot = readSnapshot() ?? last;
      schedule(snapshot.isPaused);
      return send('start', () =>
        sessionApi.reportPlaybackStart({
          playbackStartInfo: playingInfo(snapshot),
        }),
      );
    },

    update() {
      if (state !== 'started') {
        return Promise.resolve();
      }
      const snapshot = readSnapshot();
      schedule((snapshot ?? last).isPaused);
      if (!snapshot) {
        return Promise.resolve();
      }
      if (inFlight) {
        pendingUpdate = true;
        return inFlight;
      }
      return sendProgress(snapshot);
    },

    stop() {
      if (stopping) {
        return stopping;
      }
      const wasStarted = state === 'started';
      state = 'stopped';
      pendingUpdate = false;
      clearTimer();
      // Read now: the player may be torn down by the time the request goes.
      // Never started: the server already began the PlaySessionId's
      // transcode, so stopped still goes out, at the start position.
      const snapshot = wasStarted ? readSnapshot() ?? last : last;
      const previous = inFlight;
      stopping = (async () => {
        // Stopped goes last, so a late progress can't reopen the session.
        await previous;
        // No stopEncodingProcess: 12.0 dropped DELETE /Videos/ActiveEncodings.
        // The server ends the PlaySessionId's transcode on stopped (10.x did).
        await send('stopped', () =>
          sessionApi.reportPlaybackStopped({
            playbackStopInfo: {
              ItemId: session.itemId,
              MediaSourceId: session.mediaSourceId,
              PlaySessionId: session.playSessionId,
              PositionTicks: positionTicks(snapshot.positionMs),
              Failed: false,
            },
          }),
        );
      })();
      return stopping;
    },
  };
}

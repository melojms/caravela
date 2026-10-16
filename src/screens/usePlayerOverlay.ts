import {
  type HWEvent,
  useTVEventHandler,
} from '@amazon-devices/react-native-kepler';
import {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler} from 'react-native';

import type {OverlayFocus} from '../components/PlayerOverlay';

/**
 * Leanback's `PlaybackSupportFragment` hides the controls this long after
 * playback (re)starts (`lb_playback_controls_show_time_ms`).
 */
export const HIDE_AFTER_PLAY_MS = 3000;

/**
 * androidtv's own fade task (`CustomPlaybackOverlayFragment.startFadeTimer`)
 * hides the overlay this long after the last key. Leanback's tickle timeout is
 * 0 there, so this is what hides it after input.
 */
export const HIDE_AFTER_INPUT_MS = 6000;

/** `eventKeyAction` for a key press (1 is the release). */
const KEY_DOWN = 0;

/** Where a D-pad key that brings the overlay up puts focus. */
const DPAD_TARGETS: Partial<Record<string, OverlayFocus>> = {
  left: 'seek',
  right: 'seek',
  up: 'playpause',
  down: 'playpause',
};

/**
 * The remote's media keys. They also arrive through Vega Media Controls, which
 * the manifest declares, at `PlayerController` (Play/Pause toggles, ⏩ +30 s,
 * ⏪ −10 s), so acting here too would run each press twice: Play/Pause would
 * resume and pause again at once. They only bring the overlay up. Vega OS
 * 2.0+ sends the normalised names; 1.x the raw values.
 */
const SKIP_KEYS = new Set([
  'skip_forward',
  'fastforward',
  'forward',
  'skip_backward',
  'rewind',
]);

/** The simulator's OK key (and a keyboard's Enter) arrives as `enter`. */
const isOk = (eventType: string) =>
  eventType === 'select' || eventType === 'enter';

export type PlayerOverlayOptions = {
  /** There's something to show it for: a session, or a switch's tracks. */
  available: boolean;
  /** Playing now: the only state the overlay hides itself in. */
  playing: boolean;
  /**
   * Brings the overlay up when it turns true: paused, loading after playback
   * started, or a track switch reloading.
   */
  attention: boolean;
  /** A picker or the chapter row is open: it owns D-pad, OK and skip keys. */
  popupOpen: boolean;
  /** The seek bar is scrubbing: no auto-hide. */
  scrubbing: boolean;
  /** OK released with the overlay hidden. */
  onTogglePause(): void;
};

export type PlayerOverlayState = {
  visible: boolean;
  /** What the overlay focuses; a new `key` moves focus there. */
  focus: {target: OverlayFocus; key: number};
  /** Moves focus to `target` (e.g. back to a picker's opener). */
  focusOn(target: OverlayFocus): void;
  /** Input inside the overlay: the hide timer starts over. */
  onActivity(): void;
};

/**
 * When the player overlay shows, after androidtv's
 * `CustomPlaybackOverlayFragment` key listener and Leanback's fading:
 * - hidden while playing; a D-pad key brings it up and does nothing else
 *   (Left/Right focus the seek bar, Up/Down Play/Pause);
 * - up on pause, on loading after playback started and during a track
 *   switch;
 * - hides itself while playing after `HIDE_AFTER_PLAY_MS` from (re)start or
 *   `HIDE_AFTER_INPUT_MS` from the last input, never while a popup is open or
 *   the seek bar scrubs;
 * - Back hides it (playback stays as it is); with it hidden, Back is left to
 *   the navigator, which leaves the player;
 * - OK released with it hidden toggles pause (on the release: the press
 *   would otherwise show the overlay and the release press its button);
 * - the remote's media keys are `PlayerController`'s, through Vega Media
 *   Controls (see `SKIP_KEYS`); fast-forward / rewind bring it up.
 */
export const usePlayerOverlay = (
  options: PlayerOverlayOptions,
): PlayerOverlayState => {
  const {available, playing, attention, popupOpen, scrubbing} = options;
  const [visible, setVisible] = useState(false);
  const [focus, setFocus] = useState<PlayerOverlayState['focus']>({
    target: 'playpause',
    key: 0,
  });
  /** Bumped to start the hide timer over, with this delay. */
  const [timer, setTimer] = useState({ms: HIDE_AFTER_INPUT_MS, key: 0});

  const shown = visible && available;
  // The key and Back handlers are subscribed once; they read from here.
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const latest = useRef(options);
  latest.current = options;

  /** Starts the hide timer over; nothing while hidden (no renders then). */
  const restart = useCallback((ms: number = HIDE_AFTER_INPUT_MS) => {
    if (shownRef.current) {
      setTimer((current) => ({ms, key: current.key + 1}));
    }
  }, []);

  const show = useCallback(
    (target: OverlayFocus) => {
      if (!shownRef.current) {
        shownRef.current = true;
        setVisible(true);
        setFocus((current) => ({target, key: current.key + 1}));
      }
      restart();
    },
    [restart],
  );

  const hide = useCallback(() => {
    shownRef.current = false;
    setVisible(false);
  }, []);

  const focusOn = useCallback(
    (target: OverlayFocus) =>
      setFocus((current) => ({target, key: current.key + 1})),
    [],
  );
  const onActivity = useCallback(() => restart(), [restart]);

  // Nothing to show (an error, a new resolve): it starts hidden next time.
  useEffect(() => {
    if (!available) {
      setVisible(false);
    }
  }, [available]);

  useEffect(() => {
    if (attention && available) {
      show('playpause');
    }
  }, [attention, available, show]);

  const suspended = popupOpen || scrubbing;
  useEffect(() => {
    if (playing) {
      restart(HIDE_AFTER_PLAY_MS);
    }
  }, [playing, restart]);
  useEffect(() => {
    if (!suspended) {
      restart();
    }
  }, [suspended, restart]);

  useEffect(() => {
    if (!shown || !playing || suspended) {
      return;
    }
    const handle = setTimeout(hide, timer.ms);
    return () => clearTimeout(handle);
  }, [shown, playing, suspended, timer, hide]);

  // Registered once on mount: pickers and the chapter row register later, so
  // Vega's BackHandler (newest first) asks them before this.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!shownRef.current) {
          return false;
        }
        hide();
        return true;
      },
    );
    return () => subscription.remove();
  }, [hide]);

  /** OK went down with the overlay hidden, so its release toggles pause. */
  const okDownRef = useRef(false);

  // useTVEventHandler re-subscribes when its callback changes; keep it stable.
  const onKey = useCallback(
    (event: HWEvent) => {
      const current = latest.current;
      if (!current.available) {
        return;
      }
      const {eventType, eventKeyAction} = event;
      if (isOk(eventType)) {
        if (current.popupOpen) {
          okDownRef.current = false;
        } else if (eventKeyAction === KEY_DOWN) {
          okDownRef.current = !shownRef.current;
          restart();
        } else if (okDownRef.current) {
          okDownRef.current = false;
          if (!shownRef.current) {
            current.onTogglePause();
          }
        }
        return;
      }
      // A held key repeats as more presses.
      if (eventKeyAction !== KEY_DOWN) {
        return;
      }
      restart();
      const target = DPAD_TARGETS[eventType];
      if (target) {
        // With the overlay up, focus moves natively (or the popup has it).
        if (!current.popupOpen && !shownRef.current) {
          show(target);
        }
        return;
      }
      // The controller seeks; the overlay shows where it lands.
      if (SKIP_KEYS.has(eventType) && !current.popupOpen) {
        show('playpause');
      }
    },
    [restart, show],
  );
  useTVEventHandler(onKey);

  return {visible: shown, focus, focusOn, onActivity};
};

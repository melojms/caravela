import {
  FocusManager,
  type HWEvent,
  useTVEventHandler,
} from '@amazon-devices/react-native-kepler';
import {uses24HourClock} from '@amazon-devices/react-native-localize';
import React, {
  memo,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  findNodeHandle,
  Image,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  type TargetedEvent,
  View,
} from 'react-native';

import {formatMillis} from '../api/itemInfo';
import type {TrickplayTile} from '../playback/types';
import {colors, focus, px, radius, spacing, typography} from '../theme';
import {formatClock} from './ToolbarClock';

/** androidtv's `skipBackLength` / `skipForwardLength` defaults. */
export const SEEK_BACK_STEP_MS = 10_000;
export const SEEK_FORWARD_STEP_MS = 30_000;

/** androidtv refreshes "Ends at" every 30 s while the overlay is up. */
export const ENDS_AT_REFRESH_MS = 30_000;

/** `eventKeyAction` for a key press (1 is the release). */
const KEY_DOWN = 0;
const KEY_UP = 1;

export type SeekBarProps = {
  positionMs: number;
  durationMs: number;
  /** False (e.g. a live or unknown-length stream): no scrubbing. */
  canSeek: boolean;
  /** The trickplay cell for a position, or undefined for no thumbnail. */
  thumbnailAt?: (ms: number) => TrickplayTile | undefined;
  backStepMs?: number;
  forwardStepMs?: number;
  /** "Ends at" counts the remaining time at this speed (androidtv does). */
  playbackSpeed?: number;
  hasTVPreferredFocus?: boolean;
  /** OK on a scrub cursor: seek there. */
  onSeek: (ms: number) => void;
  /** True when Left/Right start a scrub, false when it's seeked or dropped. */
  onScrubbingChange?: (scrubbing: boolean) => void;
  /** Any key the bar handles, so the screen can restart its hide timer. */
  onActivity?: () => void;
  onFocus?: () => void;
  /** The focusable bar, e.g. to point another view's focus at it. */
  ref?: Ref<View>;
  testID?: string;
};

// The thumbnail's width on the 1080p canvas; its height follows the tile.
const THUMB_WIDTH = px(320);
// The cursor's time label when there's no thumbnail.
const LABEL_WIDTH = px(160);
const TRACK_HEIGHT = px(8);
const TRACK_HEIGHT_FOCUSED = px(14);
const KNOB_SIZE = px(28);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** "Ends at" in the device's 12/24 h format. */
export const endsAtLabel = (
  nowMs: number,
  remainingMs: number,
  speed: number,
  use24Hour: boolean,
): string =>
  `Ends at ${formatClock(
    new Date(nowMs + Math.round(remainingMs / (speed > 0 ? speed : 1))),
    use24Hour,
  )}`;

type ThumbnailProps = {tile: TrickplayTile; testID: string};

/**
 * One trickplay cell: a fixed-size window onto the scaled sheet. The dark
 * placeholder covers it until the sheet has loaded.
 */
const Thumbnail = ({tile, testID}: ThumbnailProps) => {
  const [loadedUrl, setLoadedUrl] = useState<string>();
  const scale = THUMB_WIDTH / tile.width;
  const height = Math.round(tile.height * scale);
  const handleLoad = useCallback(() => setLoadedUrl(tile.url), [tile.url]);

  return (
    <View testID={testID} style={[styles.thumbnail, {height}]}>
      <Image
        testID={`${testID}-image`}
        source={{uri: tile.url}}
        onLoad={handleLoad}
        style={[
          styles.sheet,
          {
            width: tile.sheetWidth * scale,
            height: tile.sheetHeight * scale,
            left: -tile.offsetX * scale,
            top: -tile.offsetY * scale,
          },
        ]}
      />
      {loadedUrl !== tile.url && (
        <View
          testID={`${testID}-placeholder`}
          style={[StyleSheet.absoluteFill, styles.placeholder]}
        />
      )}
    </View>
  );
};

/**
 * The player's seek bar, after androidtv's Leanback transport row: progress,
 * elapsed / -remaining / "Ends at" under it. While focused, Left/Right move a
 * scrub cursor (with a trickplay thumbnail above it) and OK seeks there;
 * losing focus drops the scrub.
 */
export const SeekBar = memo(
  ({
    positionMs,
    durationMs,
    canSeek,
    thumbnailAt,
    backStepMs = SEEK_BACK_STEP_MS,
    forwardStepMs = SEEK_FORWARD_STEP_MS,
    playbackSpeed = 1,
    hasTVPreferredFocus,
    onSeek,
    onScrubbingChange,
    onActivity,
    onFocus,
    ref,
    testID = 'seek-bar',
  }: SeekBarProps) => {
    const [focused, setFocused] = useState(false);
    /** The scrub cursor; null when not scrubbing. */
    const [cursorMs, setCursorMs] = useState<number | null>(null);
    const [barWidth, setBarWidth] = useState(0);
    const [now, setNow] = useState(() => Date.now());

    const barRef = useRef<View | null>(null);
    const setBarRef = useCallback(
      (node: View | null) => {
        barRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    // The key handler is subscribed once; it reads everything from here.
    const focusedRef = useRef(false);
    const cursorRef = useRef<number | null>(null);
    const latest = useRef({
      positionMs,
      durationMs,
      canSeek,
      backStepMs,
      forwardStepMs,
      onSeek,
      onScrubbingChange,
      onActivity,
    });
    latest.current = {
      positionMs,
      durationMs,
      canSeek,
      backStepMs,
      forwardStepMs,
      onSeek,
      onScrubbingChange,
      onActivity,
    };

    const setCursor = useCallback((next: number | null) => {
      const was = cursorRef.current;
      cursorRef.current = next;
      setCursorMs(next);
      if ((was === null) !== (next === null)) {
        latest.current.onScrubbingChange?.(next !== null);
      }
    }, []);

    const onKey = useCallback(
      (event: HWEvent) => {
        if (!focusedRef.current) {
          return;
        }
        const {eventType, eventKeyAction} = event;
        const props = latest.current;
        if (eventType === 'left' || eventType === 'right') {
          // A held key repeats as more presses; each one steps.
          if (eventKeyAction !== KEY_DOWN) {
            return;
          }
          props.onActivity?.();
          if (!props.canSeek || props.durationMs <= 0) {
            return;
          }
          const from = cursorRef.current ?? props.positionMs;
          const step =
            eventType === 'right' ? props.forwardStepMs : -props.backStepMs;
          setCursor(clamp(from + step, 0, props.durationMs));
          return;
        }
        // The simulator's OK key (and a keyboard's Enter) arrives as `enter`.
        // Seek on the release, like the screen's own OK handling.
        if (
          (eventType === 'select' || eventType === 'enter') &&
          eventKeyAction === KEY_UP
        ) {
          props.onActivity?.();
          const target = cursorRef.current;
          if (target !== null) {
            setCursor(null);
            props.onSeek(target);
          }
        }
      },
      [setCursor],
    );
    useTVEventHandler(onKey);

    // No scrubbing once seeking isn't possible.
    useEffect(() => {
      if ((!canSeek || durationMs <= 0) && cursorRef.current !== null) {
        setCursor(null);
      }
    }, [canSeek, durationMs, setCursor]);

    // An unmount mid-scrub (the overlay closing) ends it for the screen too.
    useEffect(
      () => () => {
        if (cursorRef.current !== null) {
          latest.current.onScrubbingChange?.(false);
        }
      },
      [],
    );

    // "Ends at" moves with the clock even while paused.
    useEffect(() => {
      const timer = setInterval(() => setNow(Date.now()), ENDS_AT_REFRESH_MS);
      return () => clearInterval(timer);
    }, []);

    const handleFocus = useCallback(
      (event?: NativeSyntheticEvent<TargetedEvent>) => {
        focusedRef.current = true;
        setFocused(true);
        // Left/Right scrub: keep Vega's focus search from leaving the bar.
        const tag =
          event?.nativeEvent?.target ??
          (barRef.current ? findNodeHandle(barRef.current) : null);
        if (typeof tag === 'number') {
          FocusManager.setNextFocus(tag, tag, 'left');
          FocusManager.setNextFocus(tag, tag, 'right');
        }
        onFocus?.();
      },
      [onFocus],
    );
    const handleBlur = useCallback(() => {
      focusedRef.current = false;
      setFocused(false);
      setCursor(null);
    }, [setCursor]);
    const handleLayout = useCallback((event: LayoutChangeEvent) => {
      setBarWidth(event.nativeEvent.layout.width);
    }, []);

    const scrubbing = cursorMs !== null;
    const shownMs = clamp(cursorMs ?? positionMs, 0, Math.max(0, durationMs));
    const fraction = durationMs > 0 ? shownMs / durationMs : 0;
    const playedFraction =
      durationMs > 0 ? clamp(positionMs / durationMs, 0, 1) : 0;
    const remainingMs = Math.max(0, durationMs - positionMs);

    const tile = scrubbing ? thumbnailAt?.(shownMs) : undefined;
    const columnWidth = tile ? THUMB_WIDTH : LABEL_WIDTH;
    // Centred on the cursor, kept inside the bar (so inside the screen).
    const columnLeft = clamp(
      fraction * barWidth - columnWidth / 2,
      0,
      Math.max(0, barWidth - columnWidth),
    );

    return (
      <View testID={testID} style={styles.container}>
        {scrubbing && (
          <View style={styles.anchor}>
            <View
              testID={`${testID}-cursor`}
              style={[styles.column, {left: columnLeft, width: columnWidth}]}>
              {tile && <Thumbnail tile={tile} testID={`${testID}-thumb`} />}
              <Text testID={`${testID}-cursor-time`} style={styles.cursorTime}>
                {formatMillis(shownMs)}
              </Text>
            </View>
          </View>
        )}
        <Pressable
          ref={setBarRef}
          testID={`${testID}-bar`}
          accessibilityRole="adjustable"
          accessibilityLabel="Seek"
          accessibilityValue={{
            min: 0,
            max: Math.round(durationMs / 1000),
            now: Math.round(shownMs / 1000),
          }}
          hasTVPreferredFocus={hasTVPreferredFocus}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onLayout={handleLayout}
          style={styles.hit}>
          <View
            testID={`${testID}-track`}
            style={[styles.track, focused && styles.trackFocused]}>
            <View
              testID={`${testID}-fill`}
              style={[styles.fill, {width: `${playedFraction * 100}%`}]}
            />
            {scrubbing && (
              <View
                testID={`${testID}-scrub-fill`}
                style={[
                  styles.scrubFill,
                  {
                    left: `${Math.min(playedFraction, fraction) * 100}%`,
                    width: `${Math.abs(fraction - playedFraction) * 100}%`,
                  },
                ]}
              />
            )}
          </View>
          {focused && (
            <View
              testID={`${testID}-knob`}
              style={[styles.knob, {left: `${fraction * 100}%`}]}
            />
          )}
        </Pressable>
        <View style={styles.times}>
          <Text testID={`${testID}-elapsed`} style={styles.time}>
            {formatMillis(shownMs)}
          </Text>
          {durationMs > 0 && (
            <Text testID={`${testID}-ends`} style={styles.ends}>
              {endsAtLabel(now, remainingMs, playbackSpeed, uses24HourClock())}
            </Text>
          )}
          <Text testID={`${testID}-remaining`} style={styles.time}>
            {`-${formatMillis(Math.max(0, durationMs - shownMs))}`}
          </Text>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
  // Zero-height, so the cursor column hangs above the bar without taking
  // space in the overlay's layout.
  anchor: {
    height: 0,
    zIndex: 1,
  },
  column: {
    position: 'absolute',
    bottom: spacing.sm,
    alignItems: 'center',
  },
  thumbnail: {
    width: THUMB_WIDTH,
    overflow: 'hidden',
    borderRadius: radius.sm,
    borderWidth: px(2),
    borderColor: colors.text,
    backgroundColor: '#000000',
  },
  sheet: {
    position: 'absolute',
  },
  placeholder: {
    backgroundColor: colors.background,
  },
  cursorTime: {
    ...typography.label,
    marginTop: spacing.xs,
    color: colors.text,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: {width: 0, height: px(2)},
    textShadowRadius: px(8),
  },
  // A taller hit area than the track, so the knob and focus fit inside.
  hit: {
    height: KNOB_SIZE + 2 * focus.borderWidth,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    overflow: 'hidden',
  },
  trackFocused: {
    height: TRACK_HEIGHT_FOCUSED,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.violet,
  },
  scrubFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: colors.violetLight,
  },
  knob: {
    position: 'absolute',
    top: focus.borderWidth,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    marginLeft: -KNOB_SIZE / 2,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    borderWidth: px(4),
    borderColor: colors.focus,
  },
  times: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xxs,
  },
  time: {
    ...typography.caption,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  ends: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

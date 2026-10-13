import {FocusManager} from '@amazon-devices/react-native-kepler';
import {
  Defs,
  LinearGradient,
  Rect,
  Stop,
  Svg,
} from '@amazon-devices/react-native-svg';
import React, {
  memo,
  type RefObject,
  useCallback,
  useRef,
  useState,
} from 'react';
import {
  findNodeHandle,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {PlayerTitle, TrickplayTile} from '../playback/types';
import {colors, focus, layout, px, radius, spacing, typography} from '../theme';
import {PlayerIcon, type PlayerIconName} from './playerIcons';
import {SeekBar} from './SeekBar';

/** The overlay elements that can be given focus. */
export type OverlayFocus =
  | 'seek'
  | 'playpause'
  | 'rewind'
  | 'fastforward'
  | 'subtitles'
  | 'audio'
  | 'chapters'
  | 'speed'
  | 'zoom';

type ButtonKey = Exclude<OverlayFocus, 'seek'>;

export type PlayerOverlayProps = {
  title: PlayerTitle;
  positionMs: number;
  durationMs: number;
  paused: boolean;
  canSeek: boolean;
  thumbnailAt?: (ms: number) => TrickplayTile | undefined;
  /** "Ends at" counts the remaining time at this speed; 1 by default. */
  playbackSpeed?: number;
  /** A short status line near the title, e.g. "Loading subtitles…". */
  hint?: string;
  /**
   * The element to focus; a new `key` remounts the controls to move focus
   * there. A target that isn't shown falls back to Play/Pause.
   */
  focus: {target: OverlayFocus; key: number};
  hasSubtitles: boolean;
  hasAudio: boolean;
  hasChapters: boolean;
  onPlayPause: () => void;
  onRewind: () => void;
  onFastForward: () => void;
  onSeek: (ms: number) => void;
  onSubtitles: () => void;
  onAudio: () => void;
  onChapters: () => void;
  onSpeed: () => void;
  onZoom: () => void;
  onScrubbingChange?: (scrubbing: boolean) => void;
  /** A key the seek bar handled, or focus moving inside the overlay. */
  onActivity?: () => void;
  /**
   * The top edge of the bottom controls (seek bar and buttons), in layout
   * units from the top of the screen, so subtitles can sit above it.
   */
  onControlsLayout?: (topY: number) => void;
  testID?: string;
};

// The same round icon buttons as the details page (DetailsActions).
const ICON_SIZE = px(48);
const ICON_PADDING = px(20);
const ROUND_SIZE = ICON_SIZE + 2 * ICON_PADDING + 2 * focus.borderWidth;
const BUTTON_WIDTH = px(170);
const LABEL_HEIGHT = px(38);
const LABEL_WIDTH = px(280);

// The scrims fade from transparent to SCRIM_SOLID over FADE_HEIGHT. The
// stops trace the curve of the old stacked bands (their alphas, each at its
// band's middle), which eases in rather than ramping linearly.
const SCRIM_CURVE = [0.04, 0.1, 0.18, 0.27, 0.36, 0.45, 0.54, 0.62];
const SCRIM_SOLID = 0.7;
const SCRIM_STOPS: {offset: number; alpha: number}[] = [
  {offset: 0, alpha: 0},
  ...SCRIM_CURVE.map((alpha, i) => ({
    offset: (i + 0.5) / SCRIM_CURVE.length,
    alpha,
  })),
  {offset: 1, alpha: SCRIM_SOLID},
];
const FADE_HEIGHT = px(96);
const CONTROLS_PADDING_TOP = px(16);

type OverlayButtonProps = {
  icon: PlayerIconName;
  label: string;
  hasTVPreferredFocus: boolean;
  onPress: () => void;
  onFocus: (button: View | null) => void;
  /** The focusable button, when the overlay needs its tag. */
  buttonRef?: RefObject<View | null>;
  testID: string;
};

/**
 * A round icon button; the focused one shows its label underneath, like
 * Leanback's transport actions.
 */
const OverlayButton = memo(
  ({
    icon,
    label,
    hasTVPreferredFocus,
    onPress,
    onFocus,
    buttonRef,
    testID,
  }: OverlayButtonProps) => {
    const [focused, setFocused] = useState(false);
    const ownRef = useRef<View | null>(null);
    const ref = buttonRef ?? ownRef;
    const handleFocus = useCallback(() => {
      setFocused(true);
      onFocus(ref.current);
    }, [onFocus, ref]);
    const handleBlur = useCallback(() => setFocused(false), []);

    return (
      <Pressable
        ref={ref}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={styles.button}>
        <View
          testID={`${testID}-circle`}
          style={[styles.circle, focused && styles.circleFocused]}>
          <PlayerIcon
            icon={icon}
            color={focused ? colors.text : colors.textMuted}
            size={ICON_SIZE}
            testID={`${testID}-icon`}
          />
        </View>
        <View style={styles.labelBox}>
          {focused && (
            <Text
              testID={`${testID}-label`}
              style={styles.label}
              numberOfLines={1}>
              {label}
            </Text>
          )}
        </View>
      </Pressable>
    );
  },
);

const tagOf = (ref: RefObject<View | null>): number | undefined => {
  const node = ref.current;
  const tag = node ? findNodeHandle(node) : null;
  return typeof tag === 'number' ? tag : undefined;
};

/**
 * A vertical gradient from transparent to the solid scrim, full width;
 * `reverse` fades upwards (solid at the top). Never takes focus or touches.
 */
const Fade = ({
  reverse = false,
  testID,
}: {
  reverse?: boolean;
  testID: string;
}) => {
  const id = reverse ? 'scrim-fade-up' : 'scrim-fade-down';
  return (
    <View testID={testID} style={styles.fade} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient
            id={id}
            x1="0"
            y1={reverse ? '1' : '0'}
            x2="0"
            y2={reverse ? '0' : '1'}>
            {SCRIM_STOPS.map(({offset, alpha}) => (
              <Stop
                key={offset}
                offset={offset}
                stopColor="#000000"
                stopOpacity={alpha}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
};

type ButtonSpec = {
  key: ButtonKey;
  icon: PlayerIconName;
  label: string;
  onPress: () => void;
};

/**
 * The player overlay, after androidtv's Leanback overlay: the title at the
 * top; the seek bar and one row of round buttons at the bottom, primary
 * actions on the left and secondary ones on the right. Presentational: the
 * screen decides when it shows and what each button does.
 */
export const PlayerOverlay = ({
  title,
  positionMs,
  durationMs,
  paused,
  canSeek,
  thumbnailAt,
  playbackSpeed,
  hint,
  focus: focusRequest,
  hasSubtitles,
  hasAudio,
  hasChapters,
  onPlayPause,
  onRewind,
  onFastForward,
  onSeek,
  onSubtitles,
  onAudio,
  onChapters,
  onSpeed,
  onZoom,
  onScrubbingChange,
  onActivity,
  onControlsLayout,
  testID = 'player-overlay',
}: PlayerOverlayProps) => {
  // androidtv: Rewind / Fast-forward only when it can seek, Subtitles with
  // any track, Audio with more than one (the screen decides `hasAudio`).
  const primary: ButtonSpec[] = [
    {
      key: 'playpause',
      icon: paused ? 'play' : 'pause',
      label: paused ? 'Play' : 'Pause',
      onPress: onPlayPause,
    },
  ];
  if (canSeek) {
    primary.push(
      {key: 'rewind', icon: 'rewind', label: 'Rewind', onPress: onRewind},
      {
        key: 'fastforward',
        icon: 'fastforward',
        label: 'Fast forward',
        onPress: onFastForward,
      },
    );
  }
  if (hasSubtitles) {
    primary.push({
      key: 'subtitles',
      icon: 'subtitles',
      label: 'Subtitles',
      onPress: onSubtitles,
    });
  }
  if (hasAudio) {
    primary.push({
      key: 'audio',
      icon: 'audio',
      label: 'Audio',
      onPress: onAudio,
    });
  }
  const secondary: ButtonSpec[] = [];
  if (hasChapters) {
    secondary.push({
      key: 'chapters',
      icon: 'chapters',
      label: 'Chapters',
      onPress: onChapters,
    });
  }
  secondary.push(
    {key: 'speed', icon: 'speed', label: 'Playback speed', onPress: onSpeed},
    {key: 'zoom', icon: 'zoom', label: 'Zoom', onPress: onZoom},
  );

  const target: OverlayFocus =
    focusRequest.target === 'seek' ||
    [...primary, ...secondary].some(({key}) => key === focusRequest.target)
      ? focusRequest.target
      : 'playpause';

  const seekRef = useRef<View | null>(null);
  const playPauseRef = useRef<View | null>(null);

  // Down from the seek bar lands on Play/Pause (Cartesian search would pick
  // whichever button is under the focus point); Up from any button lands on
  // the seek bar.
  const handleSeekFocus = useCallback(() => {
    const from = tagOf(seekRef);
    const to = tagOf(playPauseRef);
    if (from !== undefined && to !== undefined) {
      FocusManager.setNextFocus(from, to, 'down');
    }
    onActivity?.();
  }, [onActivity]);
  const handleButtonFocus = useCallback(
    (button: View | null) => {
      const from = button ? findNodeHandle(button) : null;
      const to = tagOf(seekRef);
      if (typeof from === 'number' && to !== undefined) {
        FocusManager.setNextFocus(from, to, 'up');
      }
      onActivity?.();
    },
    [onActivity],
  );

  const handleControlsLayout = useCallback(
    (event: LayoutChangeEvent) =>
      onControlsLayout?.(
        event.nativeEvent.layout.y + FADE_HEIGHT + CONTROLS_PADDING_TOP,
      ),
    [onControlsLayout],
  );

  const renderButton = (spec: ButtonSpec) => (
    <OverlayButton
      key={spec.key}
      icon={spec.icon}
      label={spec.label}
      hasTVPreferredFocus={target === spec.key}
      onPress={spec.onPress}
      onFocus={handleButtonFocus}
      buttonRef={spec.key === 'playpause' ? playPauseRef : undefined}
      testID={`${testID}-${spec.key}`}
    />
  );

  return (
    <View testID={testID} style={styles.overlay} pointerEvents="box-none">
      <View style={styles.top}>
        <View style={styles.topScrim}>
          <Text
            testID={`${testID}-title`}
            style={styles.title}
            numberOfLines={1}>
            {title.title}
          </Text>
          {title.subtitle !== undefined && (
            <Text
              testID={`${testID}-subtitle`}
              style={styles.subtitle}
              numberOfLines={1}>
              {title.subtitle}
            </Text>
          )}
          {hint !== undefined && (
            <Text
              testID={`${testID}-hint`}
              style={styles.hint}
              numberOfLines={1}>
              {hint}
            </Text>
          )}
        </View>
        <Fade reverse testID={`${testID}-top-fade`} />
      </View>
      <View
        testID={`${testID}-controls`}
        style={styles.bottom}
        onLayout={handleControlsLayout}>
        <Fade testID={`${testID}-bottom-fade`} />
        {/* Remounted on a new focus key, so preferred focus applies again. */}
        <View key={focusRequest.key} style={styles.controls}>
          <SeekBar
            ref={seekRef}
            positionMs={positionMs}
            durationMs={durationMs}
            canSeek={canSeek}
            thumbnailAt={thumbnailAt}
            playbackSpeed={playbackSpeed}
            hasTVPreferredFocus={target === 'seek'}
            onSeek={onSeek}
            onScrubbingChange={onScrubbingChange}
            onActivity={onActivity}
            onFocus={handleSeekFocus}
            testID={`${testID}-seek`}
          />
          <View style={styles.row}>
            <View style={styles.group} testID={`${testID}-primary`}>
              {primary.map(renderButton)}
            </View>
            <View style={styles.group} testID={`${testID}-secondary`}>
              {secondary.map(renderButton)}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  top: {},
  topScrim: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    backgroundColor: `rgba(0, 0, 0, ${SCRIM_SOLID})`,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.heading,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  hint: {
    ...typography.caption,
    color: colors.cyan,
    marginTop: spacing.xs,
  },
  bottom: {},
  fade: {
    height: FADE_HEIGHT,
  },
  controls: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: CONTROLS_PADDING_TOP,
    paddingBottom: spacing.lg,
    backgroundColor: `rgba(0, 0, 0, ${SCRIM_SOLID})`,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  button: {
    width: BUTTON_WIDTH,
    alignItems: 'center',
  },
  circle: {
    width: ROUND_SIZE,
    height: ROUND_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    // Always drawn (transparent at rest), so focus doesn't shift the button.
    borderWidth: focus.borderWidth,
    borderColor: colors.transparent,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  circleFocused: {
    borderColor: colors.focus,
    backgroundColor: colors.violet,
    transform: [{scale: focus.scale}],
  },
  // Reserved even when empty, so the row doesn't jump as focus moves.
  labelBox: {
    height: LABEL_HEIGHT,
    marginTop: spacing.xs,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  // Wider than the button and centred under it, so long labels fit.
  label: {
    width: LABEL_WIDTH,
    textAlign: 'center',
    fontSize: px(24),
    lineHeight: px(30),
    fontWeight: '600',
    color: colors.text,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: {width: 0, height: px(2)},
    textShadowRadius: px(8),
  },
});

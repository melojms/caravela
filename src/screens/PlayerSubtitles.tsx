import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {
  DEFAULT_SUBTITLE_STYLE,
  type SubtitleStyle,
  SubtitleView,
} from '../components/SubtitleView';
import {
  activeCues,
  type SubtitleCue,
  useSubtitleCues,
} from '../playback/subtitles';
import {colors, px, spacing, typography} from '../theme';

type PositionListener = (positionMs: number) => void;

/**
 * The player position, pushed to subscribers without a React render, so the
 * screen can skip its own renders while playing.
 */
export type PositionFeed = {
  /** The last position sent, in ms. */
  current(): number;
  emit(positionMs: number): void;
  /** Calls `listener` on every `emit`; returns the unsubscribe. */
  subscribe(listener: PositionListener): () => void;
};

export const createPositionFeed = (startMs: number): PositionFeed => {
  let positionMs = startMs;
  const listeners = new Set<PositionListener>();
  return {
    current: () => positionMs,
    emit(next) {
      positionMs = next;
      listeners.forEach((listener) => listener(next));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const NO_CUES: readonly SubtitleCue[] = [];

const sameCues = (a: readonly SubtitleCue[], b: readonly SubtitleCue[]) =>
  a.length === b.length && a.every((cue, index) => cue === b[index]);

/** The gap between the lowest line and the overlay's controls. */
export const SUBTITLE_CONTROLS_GAP = px(24);

export const LOADING_SUBTITLES = 'Loading subtitles…';

/** Lifted subtitles sit on the bottom of their (shortened) box. */
const LIFTED_STYLE: SubtitleStyle = {
  ...DEFAULT_SUBTITLE_STYLE,
  bottomOffset: 0,
};

type PlayerSubtitlesProps = {
  /** The external track's WebVTT URL; none draws nothing. */
  vttUrl?: string;
  positions: PositionFeed;
  /**
   * Draws nothing while set (scrubbing, the chapter row), but keeps following
   * the feed, so the current cue shows again as soon as it clears.
   */
  hidden?: boolean;
  /**
   * The top of the overlay's controls, in dp from the top of the screen: the
   * lowest line sits just above it (Amazon's caption guidance: move captions
   * clear of the controls rather than hide them). Unset: the normal place.
   */
  liftAboveY?: number;
  /** Shows "Loading subtitles…" where subtitles go while the cues load. */
  showLoading?: boolean;
  /** The cues started or finished loading (also false on unmount). */
  onLoadingChange?: (loading: boolean) => void;
};

/**
 * Draws an external subtitle track at the player position. It follows the
 * feed itself and only renders when the set of active cues changes. A failed
 * load draws nothing.
 */
export const PlayerSubtitles = ({
  vttUrl,
  positions,
  hidden = false,
  liftAboveY,
  showLoading = false,
  onLoadingChange,
}: PlayerSubtitlesProps) => {
  const {cues, error, loading} = useSubtitleCues(vttUrl);
  const [active, setActive] = useState(NO_CUES);
  const activeRef = useRef(NO_CUES);

  useEffect(() => {
    const update = (positionMs: number) => {
      const next = activeCues(cues, positionMs);
      if (!sameCues(activeRef.current, next)) {
        activeRef.current = next.length > 0 ? next : NO_CUES;
        setActive(activeRef.current);
      }
    };
    update(positions.current());
    return positions.subscribe(update);
  }, [cues, positions]);

  useEffect(() => {
    if (error && __DEV__) {
      // The message never holds the URL (it carries the token).
      console.warn('Subtitles failed:', error.message);
    }
  }, [error]);

  const onLoadingRef = useRef(onLoadingChange);
  onLoadingRef.current = onLoadingChange;
  useEffect(() => {
    onLoadingRef.current?.(loading);
  }, [loading]);
  useEffect(() => () => onLoadingRef.current?.(false), []);

  const lifted = liftAboveY !== undefined;
  const content = loading ? (
    showLoading &&
    !hidden && (
      <View
        style={[styles.loadingBox, !lifted && styles.loadingBoxResting]}
        pointerEvents="none">
        <Text testID="player-subtitles-loading" style={styles.loading}>
          {LOADING_SUBTITLES}
        </Text>
      </View>
    )
  ) : (
    <SubtitleView
      cues={hidden ? NO_CUES : active}
      style={lifted ? LIFTED_STYLE : undefined}
    />
  );
  if (!lifted) {
    return content || null;
  }
  return (
    <View
      testID="player-subtitles-lifted"
      pointerEvents="none"
      style={[
        styles.lifted,
        {height: Math.max(0, liftAboveY - SUBTITLE_CONTROLS_GAP)},
      ]}>
      {content}
    </View>
  );
};

const styles = StyleSheet.create({
  // Ends where the lifted lines should sit; SubtitleView fills it.
  lifted: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  loadingBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  // Where the lowest subtitle line goes when nothing is lifted.
  loadingBoxResting: {
    bottom: `${DEFAULT_SUBTITLE_STYLE.bottomOffset * 100}%`,
  },
  loading: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: px(8),
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});

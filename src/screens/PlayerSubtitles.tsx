import React, {useEffect, useRef, useState} from 'react';

import {SubtitleView} from '../components/SubtitleView';
import {
  activeCues,
  type SubtitleCue,
  useSubtitleCues,
} from '../playback/subtitles';

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

type PlayerSubtitlesProps = {
  /** The external track's WebVTT URL; none draws nothing. */
  vttUrl?: string;
  positions: PositionFeed;
};

/**
 * Draws an external subtitle track at the player position. It follows the
 * feed itself and only renders when the set of active cues changes. A failed
 * load draws nothing.
 */
export const PlayerSubtitles = ({vttUrl, positions}: PlayerSubtitlesProps) => {
  const {cues, error} = useSubtitleCues(vttUrl);
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

  return <SubtitleView cues={active} />;
};

import {
  type HWEvent,
  useTVEventHandler,
} from '@amazon-devices/react-native-kepler';
import {KeplerVideoSurfaceView} from '@amazon-devices/react-native-w3cmedia';
import {useQueryClient} from '@tanstack/react-query';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {detailsKeys} from '../api/details';
import {homeKeys, isUnauthorized} from '../api/home';
import {formatMillis} from '../api/itemInfo';
import {useSession} from '../auth/SessionContext';
import {FocusableButton} from '../components/FocusableButton';
import {TRACK_OFF_INDEX, TrackPicker} from '../components/TrackPicker';
import {RootStackScreenProps} from '../navigation/types';
import {PlayerController, type PlayerState} from '../playback/PlayerController';
import {type PlaybackRequest, resolvePlayback} from '../playback/resolver';
import type {PlaybackResolution, PlaybackSession} from '../playback/types';
import {colors, layout, px, radius, spacing, typography} from '../theme';
import {createPositionFeed, PlayerSubtitles} from './PlayerSubtitles';

type PlayerProps = RootStackScreenProps<'Player'>;

type Phase =
  | {kind: 'resolving'}
  | {kind: 'unavailable'; message: string}
  | {kind: 'error'; message: string}
  | {kind: 'ready'; session: PlaybackSession};

type Position = {positionMs: number; durationMs: number};

/** The tracks the viewer picked; the server's defaults apply until then. */
type TrackChoice = Pick<
  PlaybackRequest,
  'audioStreamIndex' | 'subtitleStreamIndex'
>;

/** A session and the tracks playing (or about to play) in it. */
type Tracks = {
  session: PlaybackSession;
  audioIndex?: number;
  /** -1 = off. */
  subtitleIndex: number;
};

type PickerKind = 'audio' | 'subtitles';
type OverlayButton = 'play' | PickerKind;

export const RESOLVE_ERROR_MESSAGE =
  "Couldn't start playback. Check the connection to the server.";

/** `eventKeyAction` for a key press (1 is the release). */
const KEY_DOWN = 0;

/**
 * Full-screen video for one item. Each visit (and each Retry) asks the server
 * for a new play session; the controller reports it and is destroyed on
 * unmount, which sends stopped.
 */
export const PlayerScreen = ({route, navigation}: PlayerProps) => {
  const {itemId, title, startMs} = route.params;
  const {session, expireSession} = useSession();
  const queryClient = useQueryClient();
  const api = session?.api;
  const serverId = session?.server.id ?? '';
  const userId = session?.user.Id ?? '';

  const [phase, setPhase] = useState<Phase>({kind: 'resolving'});
  const [attempt, setAttempt] = useState(0);
  const [playerState, setPlayerState] = useState<PlayerState>('loading');
  const [hasPlayed, setHasPlayed] = useState(false);
  const [position, setPosition] = useState<Position>({
    positionMs: startMs,
    durationMs: 0,
  });

  /** A client-side subtitle switch in `session`; a new session drops it. */
  const [subtitlePick, setSubtitlePick] = useState<{
    session: PlaybackSession;
    index: number;
  }>();
  /** Set while a track switch re-resolves: the overlay keeps showing these. */
  const [switching, setSwitching] = useState<Tracks | null>(null);
  const [picker, setPicker] = useState<PickerKind | null>(null);
  /** The overlay button to focus; `key` remounts the row to move focus. */
  const [overlayFocus, setOverlayFocus] = useState<{
    button: OverlayButton;
    key: number;
  }>({button: 'play', key: 0});
  const [positions] = useState(() => createPositionFeed(startMs));

  const controllerRef = useRef<PlayerController | null>(null);
  const surfaceRef = useRef<string | undefined>(undefined);
  /** Where a Retry or a track switch starts: the last known position. */
  const resumeFromRef = useRef(startMs);
  /** Sent with every resolve, so Retry and later switches keep it. */
  const choiceRef = useRef<TrackChoice>({});
  /** Resolves when the last controller's stopped report is done. */
  const stoppedRef = useRef<Promise<void> | undefined>(undefined);

  // Not a query: every visit needs its own PlaySessionId.
  useEffect(() => {
    if (!api || !userId) {
      return;
    }
    let cancelled = false;
    setPhase({kind: 'resolving'});
    const request: PlaybackRequest = {
      itemId,
      userId,
      startMs: resumeFromRef.current,
      ...choiceRef.current,
    };
    const resolve = () => {
      if (cancelled) {
        return;
      }
      resolvePlayback(api, request).then(onResolved, onFailed);
    };
    const onResolved = (resolution: PlaybackResolution) => {
      if (cancelled) {
        return;
      }
      setSwitching(null);
      setPhase(
        resolution.kind === 'play'
          ? {kind: 'ready', session: resolution.session}
          : {kind: 'unavailable', message: resolution.message},
      );
    };
    const onFailed = (error: unknown) => {
      if (cancelled) {
        return;
      }
      setSwitching(null);
      if (isUnauthorized(error)) {
        // The picker takes over with the expired notice.
        expireSession();
        return;
      }
      setPhase({kind: 'error', message: RESOLVE_ERROR_MESSAGE});
    };
    // A previous controller (Retry, a track switch) must be stopped first:
    // its stopped report also ends a running transcode.
    const stopped = stoppedRef.current;
    if (stopped) {
      stopped.then(resolve, resolve);
    } else {
      resolve();
    }
    return () => {
      cancelled = true;
    };
  }, [api, userId, itemId, attempt, expireSession]);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  useEffect(() => {
    if (phase.kind !== 'ready' || !api) {
      return;
    }
    setPlayerState('loading');
    setHasPlayed(false);
    let state: PlayerState = 'loading';
    const controller = new PlayerController(api, phase.session, {
      onStateChange: (next) => {
        state = next;
        setPlayerState(next);
        positions.emit(controller.positionMs);
        setPosition({
          positionMs: controller.positionMs,
          durationMs: controller.durationMs,
        });
        if (next === 'playing') {
          setHasPlayed(true);
        } else if (next === 'ended') {
          // The controller already sent stopped; unmount destroys it.
          goBack();
        }
      },
      onPositionChange: (positionMs, durationMs) => {
        // Subtitles follow the feed; the overlay only shows while paused, so
        // skip the screen's renders while playing.
        positions.emit(positionMs);
        if (state !== 'playing') {
          setPosition({positionMs, durationMs});
        }
      },
      onError: (message) => {
        if (controller.positionMs > 0) {
          resumeFromRef.current = controller.positionMs;
        }
        setPhase({kind: 'error', message});
      },
    });
    controllerRef.current = controller;
    if (surfaceRef.current) {
      controller.attachSurface(surfaceRef.current);
    }
    return () => {
      controllerRef.current = null;
      stoppedRef.current = controller.destroy();
    };
  }, [phase, api, goBack, positions]);

  // Declared after the controller effect, so its cleanup runs after destroy():
  // refetch once the server has the stopped position.
  useEffect(
    () => () => {
      (stoppedRef.current ?? Promise.resolve()).then(() => {
        queryClient.invalidateQueries({
          queryKey: detailsKeys.item(serverId, userId, itemId),
        });
        queryClient.invalidateQueries({
          queryKey: homeKeys.all(serverId, userId),
        });
      });
    },
    [queryClient, serverId, userId, itemId],
  );

  const onSurfaceViewCreated = useCallback((handle: string) => {
    surfaceRef.current = handle;
    controllerRef.current?.attachSurface(handle);
  }, []);

  const onSurfaceViewDestroyed = useCallback((handle: string) => {
    if (surfaceRef.current === handle) {
      surfaceRef.current = undefined;
    }
    controllerRef.current?.detachSurface(handle);
  }, []);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const playing = phase.kind === 'ready';
  const showSpinner =
    phase.kind === 'resolving' || (playing && playerState === 'loading');
  const showOverlay =
    switching !== null ||
    (playing &&
      (playerState === 'paused' || (playerState === 'loading' && hasPlayed)));

  const tracks: Tracks | null = playing
    ? {
        session: phase.session,
        audioIndex: phase.session.audioStreamIndex,
        subtitleIndex:
          subtitlePick?.session === phase.session
            ? subtitlePick.index
            : phase.session.subtitleStreamIndex ?? TRACK_OFF_INDEX,
      }
    : switching;
  const shownSubtitle = playing
    ? phase.session.subtitleTracks?.find(
        (track) => track.index === tracks?.subtitleIndex,
      )
    : undefined;

  // The overlay buttons press on OK, so OK only toggles pause without them.
  // A picker keeps playback paused until it closes.
  const overlayRef = useRef(showOverlay);
  overlayRef.current = showOverlay;
  const pickerOpenRef = useRef(false);
  pickerOpenRef.current = showOverlay && picker !== null;

  // Closing the overlay drops its picker; it opens again on Play.
  useEffect(() => {
    if (!showOverlay) {
      setPicker(null);
      setOverlayFocus((current) =>
        current.button === 'play' ? current : {button: 'play', key: 0},
      );
    }
  }, [showOverlay]);

  // useTVEventHandler re-subscribes when its callback changes; keep it stable.
  const onKey = useCallback((event: HWEvent) => {
    const controller = controllerRef.current;
    if (!controller || event.eventKeyAction !== KEY_DOWN) {
      return;
    }
    switch (event.eventType) {
      // The simulator's OK key (and a keyboard's Enter) arrives as `enter`.
      case 'select':
      case 'enter':
        if (!overlayRef.current) {
          controller.togglePause();
        }
        break;
      // The Fire TV remote's play/pause key arrives as `play`.
      case 'playpause':
      case 'play':
        if (!pickerOpenRef.current) {
          controller.togglePause();
        }
        break;
      case 'pause':
        controller.pause();
        break;
    }
  }, []);
  useTVEventHandler(onKey);

  const resume = useCallback(() => controllerRef.current?.play(), []);
  const openAudio = useCallback(() => setPicker('audio'), []);
  const openSubtitles = useCallback(() => setPicker('subtitles'), []);
  // Focus goes back to the button the picker opened from.
  const closePicker = () => {
    if (picker) {
      const opener = picker;
      setOverlayFocus((current) => ({button: opener, key: current.key + 1}));
      setPicker(null);
    }
  };

  /**
   * Stops the controller, then resolves again at the current position with
   * these tracks (androidtv's `stop()` + `playInternal`). A newer switch
   * cancels this one's resolve.
   */
  const reload = (next: Tracks) => {
    const controller = controllerRef.current;
    if (controller) {
      resumeFromRef.current = controller.positionMs;
    }
    choiceRef.current = {
      ...(next.audioIndex !== undefined && {audioStreamIndex: next.audioIndex}),
      subtitleStreamIndex: next.subtitleIndex,
    };
    setSwitching(next);
    setPhase({kind: 'resolving'});
    setAttempt((count) => count + 1);
  };

  const pick = (kind: PickerKind, index: number) => {
    closePicker();
    if (!tracks) {
      return;
    }
    if (kind === 'audio') {
      if (index !== tracks.audioIndex) {
        reload({...tracks, audioIndex: index});
      }
      return;
    }
    if (index === tracks.subtitleIndex) {
      return;
    }
    const burnIn = (subtitleIndex: number) =>
      tracks.session.subtitleTracks?.find(
        (track) => track.index === subtitleIndex,
      )?.delivery === 'burn-in';
    const controller = controllerRef.current;
    if (
      !playing ||
      !controller ||
      burnIn(index) ||
      burnIn(tracks.subtitleIndex)
    ) {
      reload({...tracks, subtitleIndex: index});
      return;
    }
    // External or off on both sides: no new session.
    choiceRef.current = {...choiceRef.current, subtitleStreamIndex: index};
    controller.setSubtitleStreamIndex(index);
    setSubtitlePick({session: phase.session, index});
  };

  return (
    <View style={styles.screen} testID="player-screen">
      <KeplerVideoSurfaceView
        testID="player-surface"
        style={StyleSheet.absoluteFill}
        scalingmode="fit"
        onSurfaceViewCreated={onSurfaceViewCreated}
        onSurfaceViewDestroyed={onSurfaceViewDestroyed}
      />
      {playing && shownSubtitle?.delivery === 'external' && (
        <PlayerSubtitles vttUrl={shownSubtitle.vttUrl} positions={positions} />
      )}
      {showSpinner && (
        <View style={styles.center} testID="player-loading">
          <ActivityIndicator size="large" color={colors.cyan} />
        </View>
      )}
      {(phase.kind === 'unavailable' || phase.kind === 'error') && (
        <View style={[styles.center, styles.scrim]} testID="player-message">
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{phase.message}</Text>
          <View style={styles.buttons}>
            {phase.kind === 'error' && (
              <FocusableButton
                testID="player-retry"
                label="Retry"
                hasTVPreferredFocus
                onPress={retry}
              />
            )}
            <FocusableButton
              testID="player-back"
              label="Back"
              hasTVPreferredFocus={phase.kind === 'unavailable'}
              onPress={goBack}
            />
          </View>
        </View>
      )}
      {showOverlay && tracks && (
        <PlayerOverlay
          title={title}
          positionMs={position.positionMs}
          durationMs={position.durationMs}
          focus={overlayFocus}
          // androidtv: Audio with more than one track, Subtitles with any.
          hasAudio={(tracks.session.audioTracks?.length ?? 0) > 1}
          hasSubtitles={(tracks.session.subtitleTracks?.length ?? 0) > 0}
          onPlay={resume}
          onAudio={openAudio}
          onSubtitles={openSubtitles}
        />
      )}
      {showOverlay && tracks && picker === 'audio' && (
        <TrackPicker
          testID="player-audio-picker"
          title="Audio"
          tracks={tracks.session.audioTracks ?? []}
          selectedIndex={tracks.audioIndex}
          onSelect={(index) => pick('audio', index)}
          onClose={closePicker}
        />
      )}
      {showOverlay && tracks && picker === 'subtitles' && (
        <TrackPicker
          testID="player-subtitle-picker"
          title="Subtitles"
          tracks={tracks.session.subtitleTracks ?? []}
          selectedIndex={tracks.subtitleIndex}
          offLabel="None"
          onSelect={(index) => pick('subtitles', index)}
          onClose={closePicker}
        />
      )}
    </View>
  );
};

type OverlayProps = {
  title: string;
  positionMs: number;
  durationMs: number;
  focus: {button: OverlayButton; key: number};
  hasAudio: boolean;
  hasSubtitles: boolean;
  onPlay: () => void;
  onAudio: () => void;
  onSubtitles: () => void;
};

/**
 * The paused overlay: title, a thin progress bar, the times and androidtv's
 * Play / Subtitles / Audio actions (in its order). Task 11 redoes it.
 */
const PlayerOverlay = ({
  title,
  positionMs,
  durationMs,
  focus,
  hasAudio,
  hasSubtitles,
  onPlay,
  onAudio,
  onSubtitles,
}: OverlayProps) => {
  const progress =
    durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  return (
    <View style={styles.overlay} testID="player-overlay">
      <Text style={styles.overlayTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.track}>
        <View
          testID="player-progress"
          style={[styles.fill, {width: `${progress * 100}%`}]}
        />
      </View>
      <Text style={styles.times} testID="player-times">
        {`${formatMillis(positionMs)} / ${formatMillis(durationMs)}`}
      </Text>
      {/* Remounted to move focus back to the button a picker opened from. */}
      <View style={styles.controls} key={focus.key}>
        <FocusableButton
          testID="player-play"
          label="Play"
          hasTVPreferredFocus={focus.button === 'play'}
          onPress={onPlay}
        />
        {hasSubtitles && (
          <FocusableButton
            testID="player-subtitles"
            label="Subtitles"
            hasTVPreferredFocus={focus.button === 'subtitles'}
            onPress={onSubtitles}
          />
        )}
        {hasAudio && (
          <FocusableButton
            testID="player-audio"
            label="Audio"
            hasTVPreferredFocus={focus.button === 'audio'}
            onPress={onAudio}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.screenPadding,
  },
  scrim: {
    backgroundColor: colors.background,
  },
  title: {
    ...typography.title,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayTitle: {
    ...typography.heading,
    color: colors.text,
  },
  track: {
    height: px(6),
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.violet,
  },
  times: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  controls: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
});

import {useKeplerAppStateManager} from '@amazon-devices/react-native-kepler';
import {KeplerVideoSurfaceView} from '@amazon-devices/react-native-w3cmedia';
import {useQueryClient} from '@tanstack/react-query';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {detailsKeys, useItemDetails} from '../api/details';
import {homeKeys, isUnauthorized} from '../api/home';
import {playerTitle} from '../api/itemInfo';
import {useSession} from '../auth/SessionContext';
import {ChapterRow} from '../components/ChapterRow';
import {FocusableButton} from '../components/FocusableButton';
import {PlayerOverlay} from '../components/PlayerOverlay';
import {SEEK_BACK_STEP_MS, SEEK_FORWARD_STEP_MS} from '../components/SeekBar';
import {TRACK_OFF_INDEX, TrackPicker} from '../components/TrackPicker';
import {RootStackScreenProps} from '../navigation/types';
import {currentChapterIndex, itemChapters} from '../playback/chapters';
import {PlayerController, type PlayerState} from '../playback/PlayerController';
import {type PlaybackRequest, resolvePlayback} from '../playback/resolver';
import {trickplayInfo, trickplayTile} from '../playback/trickplay';
import {
  type Chapter,
  type MediaTrack,
  PLAYBACK_SPEEDS,
  type PlaybackResolution,
  type PlaybackSession,
  type PlaybackSpeed,
  type PlayerTitle,
  type ZoomMode,
} from '../playback/types';
import {colors, layout, spacing, typography} from '../theme';
import {
  createPositionFeed,
  LOADING_SUBTITLES,
  PlayerSubtitles,
} from './PlayerSubtitles';
import {usePlayerOverlay} from './usePlayerOverlay';

type PlayerProps = RootStackScreenProps<'Player'>;

type Phase =
  | {kind: 'resolving'}
  | {kind: 'unavailable'; message: string}
  | {kind: 'error'; message: string}
  | {kind: 'ready'; session: PlaybackSession};

type Position = {
  positionMs: number;
  durationMs: number;
  canSeek: boolean;
  /** The player is paused (it stays so through a seek's loading). */
  paused: boolean;
};

/**
 * The tracks the viewer picked; the server's defaults apply until then. The
 * server only honours the indexes for a named media source (otherwise it
 * applies the user's remembered tracks), so a pick names its session's.
 */
type TrackChoice = Pick<
  PlaybackRequest,
  'mediaSourceId' | 'audioStreamIndex' | 'subtitleStreamIndex'
>;

/** A session and the tracks playing (or about to play) in it. */
type Tracks = {
  session: PlaybackSession;
  audioIndex?: number;
  /** -1 = off. */
  subtitleIndex: number;
};

type PickerKind = 'audio' | 'subtitles' | 'speed' | 'zoom';
/** What sits over the overlay; each is also the button it opened from. */
type Popup = PickerKind | 'chapters';

export const RESOLVE_ERROR_MESSAGE =
  "Couldn't start playback. Check the connection to the server.";

/** androidtv's `PlaybackSpeedAction` labels: `%.2fx`. */
export const speedLabel = (speed: number) => `${speed.toFixed(2)}x`;

const SPEED_TRACKS: MediaTrack[] = PLAYBACK_SPEEDS.map((speed, index) => ({
  index,
  label: speedLabel(speed),
}));

/**
 * androidtv's Zoom menu (its Fit is labelled "Normal") and the
 * `KeplerVideoSurfaceView` `scalingmode` for each (`strech` is Amazon's
 * spelling).
 */
const ZOOM_MODES: {
  mode: ZoomMode;
  label: string;
  scaling: 'fit' | 'fill' | 'strech';
}[] = [
  {mode: 'fit', label: 'Normal', scaling: 'fit'},
  {mode: 'crop', label: 'Auto crop', scaling: 'fill'},
  {mode: 'stretch', label: 'Stretch', scaling: 'strech'},
];

const ZOOM_TRACKS: MediaTrack[] = ZOOM_MODES.map(({label}, index) => ({
  index,
  label,
}));

/**
 * The speed last picked, for the app's lifetime (androidtv's
 * `VideoSpeedController.previousSpeedSelection`): every new controller starts
 * at it.
 */
let speedSelection: PlaybackSpeed = 1;

/** Back to 1× (tests: the choice outlives a screen on purpose). */
export const resetPlaybackSpeed = () => {
  speedSelection = 1;
};

const NO_CHAPTERS: Chapter[] = [];

const readPosition = (controller: PlayerController): Position => ({
  positionMs: controller.positionMs,
  durationMs: controller.durationMs,
  canSeek: controller.canSeek,
  paused: controller.paused,
});

/**
 * Full-screen video for one item. Each visit (and each Retry) asks the server
 * for a new play session; the controller reports it and is destroyed on
 * unmount, which sends stopped. The screen leaves (Back, the end of playback,
 * or the app going to the background) by going back, so unmount does that
 * teardown.
 */
export const PlayerScreen = ({route, navigation}: PlayerProps) => {
  const {itemId, title, startMs} = route.params;
  const {session, expireSession} = useSession();
  const queryClient = useQueryClient();
  const api = session?.api;
  // Vega Media Controls sends Alexa's and the remote's playback commands to
  // this component. The manager is per root tag, so this is the same one for
  // the app's lifetime and never recreates the controller.
  const appStateManager = useKeplerAppStateManager();
  const componentInstance = useMemo(
    () => appStateManager.getComponentInstance(),
    [appStateManager],
  );
  const serverId = session?.server.id ?? '';
  const userId = session?.user.Id ?? '';
  // Only the overlay uses it; a failed load just leaves the fallbacks.
  const {data: item} = useItemDetails(itemId);

  const [phase, setPhase] = useState<Phase>({kind: 'resolving'});
  const [attempt, setAttempt] = useState(0);
  const [playerState, setPlayerState] = useState<PlayerState>('loading');
  const [hasPlayed, setHasPlayed] = useState(false);
  const [position, setPosition] = useState<Position>({
    positionMs: startMs,
    durationMs: 0,
    canSeek: false,
    paused: true,
  });

  /** A client-side subtitle switch in `session`; a new session drops it. */
  const [subtitlePick, setSubtitlePick] = useState<{
    session: PlaybackSession;
    index: number;
  }>();
  /** Set while a track switch re-resolves: the overlay keeps showing these. */
  const [switching, setSwitching] = useState<Tracks | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  /** The chapter the row opens on, read when it opens. */
  const [chapterIndex, setChapterIndex] = useState(0);
  const [speed, setSpeed] = useState<PlaybackSpeed>(speedSelection);
  // Each visit starts at Fit (androidtv doesn't keep the zoom).
  const [zoom, setZoom] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  /** The top of the overlay's controls, for lifting subtitles above it. */
  const [controlsTop, setControlsTop] = useState<number>();
  const [subtitlesLoading, setSubtitlesLoading] = useState(false);
  const [positions] = useState(() => createPositionFeed(startMs));

  const controllerRef = useRef<PlayerController | null>(null);
  const surfaceRef = useRef<string | undefined>(undefined);
  /** Where a Retry or a track switch starts: the last known position. */
  const resumeFromRef = useRef(startMs);
  /**
   * The last position a controller reported while healthy (or a switch read).
   * After an error the player may have reset its own (it reads near 0), and
   * it reads 0 before the media loads, so neither may replace this.
   */
  const reportedRef = useRef(startMs);
  /** Sent with every resolve, so Retry and later switches keep it. */
  const choiceRef = useRef<TrackChoice>({});
  /** Resolves when the last controller's stopped report is done. */
  const stoppedRef = useRef<Promise<void> | undefined>(undefined);
  /** The overlay is up, so position updates render (they're skipped when not). */
  const overlayShownRef = useRef(false);

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
  // In the background the player must be released (Amazon's lifecycle tests:
  // no audio on the launcher), and JS is suspended ~4 s later: leave at once,
  // in any phase. Details refetches the stopped position on return. Only
  // `background`: `inactive` and blur/focus (an Alexa question) keep playing.
  const leftRef = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      // Not focused: going back would pop whatever is on top instead.
      if (next !== 'background' || leftRef.current || !navigation.isFocused()) {
        return;
      }
      leftRef.current = true;
      goBack();
    });
    return () => subscription.remove();
  }, [goBack, navigation]);
  useEffect(() => {
    if (phase.kind !== 'ready' || !api) {
      return;
    }
    setPlayerState('loading');
    setHasPlayed(false);
    let state: PlayerState = 'loading';
    const controller = new PlayerController(
      api,
      phase.session,
      {
        onStateChange: (next) => {
          state = next;
          setPlayerState(next);
          positions.emit(controller.positionMs);
          setPosition(readPosition(controller));
          if (next === 'playing') {
            setHasPlayed(true);
          } else if (next === 'ended') {
            // The controller already sent stopped; unmount destroys it.
            goBack();
          }
        },
        onPositionChange: (positionMs, durationMs) => {
          if (positionMs > 0) {
            reportedRef.current = positionMs;
          }
          // Subtitles follow the feed; the screen only renders for the
          // overlay, so it skips these while playing with the overlay hidden.
          positions.emit(positionMs);
          if (state !== 'playing' || overlayShownRef.current) {
            setPosition({
              positionMs,
              durationMs,
              canSeek: controller.canSeek,
              paused: controller.paused,
            });
          }
        },
        onError: (message) => {
          // Not `controller.positionMs`: the failed player may have reset it.
          resumeFromRef.current = reportedRef.current;
          setPhase({kind: 'error', message});
        },
      },
      // Retry and track switches keep the speed too.
      {playbackRate: speedSelection, componentInstance, title},
    );
    controllerRef.current = controller;
    if (surfaceRef.current) {
      controller.attachSurface(surfaceRef.current);
    }
    return () => {
      controllerRef.current = null;
      stoppedRef.current = controller.destroy();
    };
  }, [phase, api, goBack, positions, componentInstance, title]);

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
  const externalSubtitle =
    shownSubtitle?.delivery === 'external' ? shownSubtitle : undefined;

  const togglePause = useCallback(
    () => controllerRef.current?.togglePause(),
    [],
  );
  const seekBy = useCallback(
    (deltaMs: number) => controllerRef.current?.seekBy(deltaMs),
    [],
  );

  const overlay = usePlayerOverlay({
    available: tracks !== null,
    playing: playing && playerState === 'playing',
    attention:
      switching !== null ||
      (playing &&
        (playerState === 'paused' || (playerState === 'loading' && hasPlayed))),
    popupOpen: popup !== null,
    scrubbing,
    onTogglePause: togglePause,
  });
  const overlayShown = overlay.visible && tracks !== null;
  overlayShownRef.current = overlayShown;

  // Position updates were skipped while it was hidden: catch up before it
  // paints.
  useLayoutEffect(() => {
    const controller = controllerRef.current;
    if (overlayShown && controller) {
      setPosition(readPosition(controller));
    }
  }, [overlayShown]);

  // Hiding the overlay drops its popup and any scrub.
  useEffect(() => {
    if (!overlayShown) {
      setPopup(null);
      setScrubbing(false);
    }
  }, [overlayShown]);

  const {focusOn} = overlay;
  const popupRef = useRef(popup);
  popupRef.current = popup;
  // Focus goes back to the button the popup opened from.
  const closePopup = useCallback(() => {
    const opener = popupRef.current;
    if (opener) {
      popupRef.current = null;
      focusOn(opener);
      setPopup(null);
    }
  }, [focusOn]);

  const openAudio = useCallback(() => setPopup('audio'), []);
  const openSubtitles = useCallback(() => setPopup('subtitles'), []);
  const openSpeed = useCallback(() => setPopup('speed'), []);
  const openZoom = useCallback(() => setPopup('zoom'), []);

  const chapters = useMemo(
    () => (api && item ? itemChapters(api, item) : NO_CHAPTERS),
    [api, item],
  );
  const openChapters = useCallback(() => {
    const controller = controllerRef.current;
    setChapterIndex(
      currentChapterIndex(
        chapters,
        controller ? controller.positionMs : positions.current(),
      ),
    );
    setPopup('chapters');
  }, [chapters, positions]);

  const seekTo = useCallback(
    (ms: number) => {
      const controller = controllerRef.current;
      if (!controller) {
        return;
      }
      controller.seekTo(ms);
      // Show the target now; the bar would jump back until `seeked`.
      positions.emit(ms);
      setPosition((current) => ({...current, positionMs: ms}));
    },
    [positions],
  );
  const selectChapter = useCallback(
    (chapter: Chapter) => {
      seekTo(chapter.startMs);
      closePopup();
    },
    [seekTo, closePopup],
  );

  const rewind = useCallback(() => seekBy(-SEEK_BACK_STEP_MS), [seekBy]);
  const fastForward = useCallback(() => seekBy(SEEK_FORWARD_STEP_MS), [seekBy]);

  const mediaSourceId = tracks?.session.mediaSourceId;
  const thumbnailAt = useMemo(() => {
    const info =
      item && mediaSourceId ? trickplayInfo(item, mediaSourceId) : undefined;
    return api && info
      ? (ms: number) => trickplayTile(api, info, ms)
      : undefined;
  }, [api, item, mediaSourceId]);

  const overlayTitle: PlayerTitle = useMemo(
    () => (item ? playerTitle(item) : {title}),
    [item, title],
  );

  /**
   * Stops the controller, then resolves again at the current position with
   * these tracks (androidtv's `stop()` + `playInternal`). A newer switch
   * cancels this one's resolve.
   */
  const reload = (next: Tracks) => {
    // The live position is the freshest (it includes a seek in flight); it
    // reads 0 before the media loads, and there's no controller during
    // another switch: the last known one covers those.
    const live = controllerRef.current?.positionMs ?? 0;
    if (live > 0) {
      reportedRef.current = live;
    }
    resumeFromRef.current = reportedRef.current;
    choiceRef.current = {
      mediaSourceId: next.session.mediaSourceId,
      ...(next.audioIndex !== undefined && {audioStreamIndex: next.audioIndex}),
      subtitleStreamIndex: next.subtitleIndex,
    };
    setSwitching(next);
    setPhase({kind: 'resolving'});
    setAttempt((count) => count + 1);
  };

  const pickTrack = (kind: 'audio' | 'subtitles', index: number) => {
    closePopup();
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
    choiceRef.current = {
      ...choiceRef.current,
      mediaSourceId: phase.session.mediaSourceId,
      subtitleStreamIndex: index,
    };
    controller.setSubtitleStreamIndex(index);
    setSubtitlePick({session: phase.session, index});
  };

  const pickSpeed = (index: number) => {
    closePopup();
    const next = PLAYBACK_SPEEDS[index];
    if (next === undefined) {
      return;
    }
    speedSelection = next;
    setSpeed(next);
    controllerRef.current?.setPlaybackRate(next);
  };

  const pickZoom = (index: number) => {
    closePopup();
    if (ZOOM_MODES[index]) {
      setZoom(index);
    }
  };

  const chaptersOpen = overlayShown && popup === 'chapters';

  return (
    <View style={styles.screen} testID="player-screen">
      <KeplerVideoSurfaceView
        testID="player-surface"
        style={StyleSheet.absoluteFill}
        scalingmode={ZOOM_MODES[zoom].scaling}
        onSurfaceViewCreated={onSurfaceViewCreated}
        onSurfaceViewDestroyed={onSurfaceViewDestroyed}
      />
      {/* Above the controls while the overlay is up; the thumbnail and the
          chapter row cover where they'd be, so they hide then. */}
      {playing && externalSubtitle && (
        <PlayerSubtitles
          vttUrl={externalSubtitle.vttUrl}
          positions={positions}
          hidden={scrubbing || chaptersOpen}
          liftAboveY={overlayShown && !chaptersOpen ? controlsTop : undefined}
          showLoading={!overlayShown}
          onLoadingChange={setSubtitlesLoading}
        />
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
      {/* The chapter row replaces it, so its controls don't show through. */}
      {overlayShown && tracks && !chaptersOpen && (
        <PlayerOverlay
          title={overlayTitle}
          positionMs={position.positionMs}
          durationMs={position.durationMs}
          // A seek while paused loads without playing: still Play.
          paused={
            playerState === 'paused' ||
            (playerState === 'loading' && position.paused)
          }
          canSeek={playing && position.canSeek}
          thumbnailAt={thumbnailAt}
          playbackSpeed={speed}
          hint={
            externalSubtitle && subtitlesLoading ? LOADING_SUBTITLES : undefined
          }
          focus={overlay.focus}
          // androidtv: Audio with more than one track, Subtitles with any.
          hasAudio={(tracks.session.audioTracks?.length ?? 0) > 1}
          hasSubtitles={(tracks.session.subtitleTracks?.length ?? 0) > 0}
          hasChapters={chapters.length > 0}
          onPlayPause={togglePause}
          onRewind={rewind}
          onFastForward={fastForward}
          onSeek={seekTo}
          onSubtitles={openSubtitles}
          onAudio={openAudio}
          onChapters={openChapters}
          onSpeed={openSpeed}
          onZoom={openZoom}
          onScrubbingChange={setScrubbing}
          onActivity={overlay.onActivity}
          onControlsLayout={setControlsTop}
        />
      )}
      {chaptersOpen && (
        <ChapterRow
          testID="player-chapters"
          chapters={chapters}
          currentIndex={chapterIndex}
          onSelect={selectChapter}
          onClose={closePopup}
        />
      )}
      {overlayShown && tracks && popup === 'audio' && (
        <TrackPicker
          testID="player-audio-picker"
          title="Audio"
          tracks={tracks.session.audioTracks ?? []}
          selectedIndex={tracks.audioIndex}
          onSelect={(index) => pickTrack('audio', index)}
          onClose={closePopup}
        />
      )}
      {overlayShown && tracks && popup === 'subtitles' && (
        <TrackPicker
          testID="player-subtitle-picker"
          title="Subtitles"
          tracks={tracks.session.subtitleTracks ?? []}
          selectedIndex={tracks.subtitleIndex}
          offLabel="None"
          onSelect={(index) => pickTrack('subtitles', index)}
          onClose={closePopup}
        />
      )}
      {overlayShown && popup === 'speed' && (
        <TrackPicker
          testID="player-speed-picker"
          title="Playback speed"
          tracks={SPEED_TRACKS}
          selectedIndex={PLAYBACK_SPEEDS.indexOf(speed)}
          onSelect={pickSpeed}
          onClose={closePopup}
        />
      )}
      {overlayShown && popup === 'zoom' && (
        <TrackPicker
          testID="player-zoom-picker"
          title="Zoom"
          tracks={ZOOM_TRACKS}
          selectedIndex={zoom}
          onSelect={pickZoom}
          onClose={closePopup}
        />
      )}
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
});

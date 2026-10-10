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
import {RootStackScreenProps} from '../navigation/types';
import {PlayerController, type PlayerState} from '../playback/PlayerController';
import {resolvePlayback} from '../playback/resolver';
import type {PlaybackSession} from '../playback/types';
import {colors, layout, px, radius, spacing, typography} from '../theme';

type PlayerProps = RootStackScreenProps<'Player'>;

type Phase =
  | {kind: 'resolving'}
  | {kind: 'unavailable'; message: string}
  | {kind: 'error'; message: string}
  | {kind: 'ready'; session: PlaybackSession};

type Position = {positionMs: number; durationMs: number};

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

  const controllerRef = useRef<PlayerController | null>(null);
  const surfaceRef = useRef<string | undefined>(undefined);
  /** Where a Retry starts: the last position once something played. */
  const resumeFromRef = useRef(startMs);
  /** Resolves when the last controller's stopped report is done. */
  const stoppedRef = useRef<Promise<void>>(Promise.resolve());

  // Not a query: every visit needs its own PlaySessionId.
  useEffect(() => {
    if (!api || !userId) {
      return;
    }
    let cancelled = false;
    setPhase({kind: 'resolving'});
    resolvePlayback(api, {itemId, userId, startMs: resumeFromRef.current}).then(
      (resolution) => {
        if (cancelled) {
          return;
        }
        setPhase(
          resolution.kind === 'play'
            ? {kind: 'ready', session: resolution.session}
            : {kind: 'unavailable', message: resolution.message},
        );
      },
      (error) => {
        if (cancelled) {
          return;
        }
        if (isUnauthorized(error)) {
          // The picker takes over with the expired notice.
          expireSession();
          return;
        }
        setPhase({kind: 'error', message: RESOLVE_ERROR_MESSAGE});
      },
    );
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
        // Only the overlay shows the position; skip renders while playing.
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
  }, [phase, api, goBack]);

  // Declared after the controller effect, so its cleanup runs after destroy():
  // refetch once the server has the stopped position.
  useEffect(
    () => () => {
      stoppedRef.current.then(() => {
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

  // useTVEventHandler re-subscribes when its callback changes; keep it stable.
  const onKey = useCallback((event: HWEvent) => {
    const controller = controllerRef.current;
    if (!controller || event.eventKeyAction !== KEY_DOWN) {
      return;
    }
    switch (event.eventType) {
      // The simulator's OK key (and a keyboard's Enter) arrives as `enter`,
      // and the Fire TV remote's play/pause key as `play`.
      case 'select':
      case 'enter':
      case 'playpause':
      case 'play':
        controller.togglePause();
        break;
      case 'pause':
        controller.pause();
        break;
    }
  }, []);
  useTVEventHandler(onKey);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const playing = phase.kind === 'ready';
  const showSpinner =
    phase.kind === 'resolving' || (playing && playerState === 'loading');
  const showOverlay =
    playing &&
    (playerState === 'paused' || (playerState === 'loading' && hasPlayed));

  return (
    <View style={styles.screen} testID="player-screen">
      <KeplerVideoSurfaceView
        testID="player-surface"
        style={StyleSheet.absoluteFill}
        scalingmode="fit"
        onSurfaceViewCreated={onSurfaceViewCreated}
        onSurfaceViewDestroyed={onSurfaceViewDestroyed}
      />
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
      {showOverlay && (
        <PlayerOverlay
          title={title}
          positionMs={position.positionMs}
          durationMs={position.durationMs}
        />
      )}
    </View>
  );
};

type OverlayProps = {title: string; positionMs: number; durationMs: number};

/** The paused overlay: title, a thin progress bar and the times. Task 11 adds controls. */
const PlayerOverlay = ({title, positionMs, durationMs}: OverlayProps) => {
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
});

import {isAxiosError} from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {AuthError, getAuthService} from '../../auth/authService';
import type {AuthService, QuickConnectAttempt} from '../../auth/authService';
import {useSession} from '../../auth/SessionContext';
import {getAuthStore} from '../../auth/store';
import type {AuthStore} from '../../auth/store';
import {FocusableButton} from '../../components/FocusableButton';
import type {
  AuthStackParamList,
  RootStackScreenProps,
} from '../../navigation/types';
import {colors, layout, px, radius, spacing, typography} from '../../theme';
import {QUICK_CONNECT_OFF} from './PasswordScreen';

/** The service's default; the server itself expires codes after 10 minutes. */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const GENERIC_ERROR = 'Something went wrong. Try again.';

/** m:ss, rounded up so the countdown shows 0:00 only at the end. */
export const formatCountdown = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const seconds = total % 60;
  return `${Math.floor(total / 60)}:${seconds < 10 ? '0' : ''}${seconds}`;
};

type QuickConnectScreenProps = RootStackScreenProps<'QuickConnect'> & {
  /** Injected in tests; the app uses the default service and store. */
  authService?: AuthService;
  authStore?: AuthStore;
  /** How long a code stays valid before the screen offers Try again. */
  timeoutMs?: number;
};

type Status =
  | {kind: 'starting'}
  | {kind: 'waiting'; code: string; deadline: number}
  | {kind: 'failed'; message: string}
  // The server name may load after the failure, so it's filled in on render.
  | {kind: 'offline'};

/**
 * Shows a Quick Connect code and waits for another signed-in device to
 * approve it. Quick Connect is the default sign-in; Use password switches to
 * the Password screen.
 */
export const QuickConnectScreen = ({
  route,
  navigation,
  authService,
  authStore,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: QuickConnectScreenProps) => {
  const {serverId, userId} = route.params;
  const {signIn} = useSession();
  const [service] = useState(() => authService ?? getAuthService());
  const [store] = useState(() => authStore ?? getAuthStore());

  const [serverName, setServerName] = useState<string>();
  const [username, setUsername] = useState<string>();
  const [status, setStatus] = useState<Status>({kind: 'starting'});
  const [now, setNow] = useState(() => Date.now());

  const attempt = useRef<QuickConnectAttempt | undefined>(undefined);
  // Bumped by every new attempt and on unmount, so a late result (such as a
  // session that resolves after the screen has gone) is dropped.
  const generation = useRef(0);
  const mounted = useRef(true);
  // The username once it's looked up; undefined when it's unknown.
  const usernameLookup = useRef<Promise<string | undefined>>(
    Promise.resolve(undefined),
  );
  // Refs, so a new identity for these doesn't restart the attempt.
  const latest = useRef({signIn, navigation});
  latest.current = {signIn, navigation};

  const passwordParams = useCallback(
    (name?: string, notice?: string): AuthStackParamList['Password'] => ({
      serverId,
      ...(userId ? {userId} : {}),
      ...(name ? {username: name} : {}),
      ...(notice ? {notice} : {}),
    }),
    [serverId, userId],
  );

  const cancel = useCallback(() => {
    generation.current += 1;
    attempt.current?.cancel();
    attempt.current = undefined;
  }, []);

  const start = useCallback(() => {
    cancel();
    const run = generation.current;
    const isCurrent = () => generation.current === run;
    setStatus({kind: 'starting'});

    const fail = (error: unknown) => {
      if (!isCurrent()) {
        return;
      }
      attempt.current = undefined;
      if (error instanceof AuthError) {
        switch (error.code) {
          case 'quick-connect-cancelled':
            return;
          case 'quick-connect-disabled':
            // Waits for the username so Password can show it.
            usernameLookup.current.then((name) => {
              if (mounted.current && isCurrent()) {
                generation.current += 1;
                latest.current.navigation.replace(
                  'Password',
                  passwordParams(name, QUICK_CONNECT_OFF),
                );
              }
            });
            return;
          case 'quick-connect-timeout':
            setStatus({kind: 'failed', message: 'The code expired.'});
            return;
          default:
            setStatus({kind: 'failed', message: error.message});
            return;
        }
      }
      setStatus(
        isAxiosError(error) && !error.response
          ? {kind: 'offline'}
          : {kind: 'failed', message: GENERIC_ERROR},
      );
    };

    service.startQuickConnect(serverId, {timeoutMs}).then((started) => {
      if (!isCurrent()) {
        // The screen moved on while the code was being requested.
        started.cancel();
        return;
      }
      attempt.current = started;
      const startedAt = Date.now();
      setNow(startedAt);
      setStatus({
        kind: 'waiting',
        code: started.code,
        deadline: startedAt + timeoutMs,
      });
      started.session.then((session) => {
        if (isCurrent()) {
          attempt.current = undefined;
          latest.current.signIn(session);
        }
      }, fail);
    }, fail);
  }, [cancel, passwordParams, service, serverId, timeoutMs]);

  useEffect(() => {
    mounted.current = true;
    start();
    // Back, Cancel, Use password and unmount all end the attempt.
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [start, cancel]);

  useEffect(() => {
    let cancelled = false;
    usernameLookup.current = store
      .getServer(serverId)
      .then(async (server) => {
        if (cancelled) {
          return undefined;
        }
        setServerName(server?.name);
        if (!userId) {
          return undefined;
        }
        const name =
          server?.users[userId]?.name ??
          (await service.getPublicUsers(serverId)).find(
            (user) => user.id === userId,
          )?.name;
        if (!cancelled) {
          setUsername(name);
        }
        return name;
      })
      .catch(() => {
        // Without a name the screens fall back to generic text.
        return undefined;
      });
    return () => {
      cancelled = true;
    };
  }, [service, store, serverId, userId]);

  const waiting = status.kind === 'waiting';
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  const failed = status.kind === 'failed' || status.kind === 'offline';

  const onCancel = useCallback(() => {
    cancel();
    navigation.goBack();
  }, [cancel, navigation]);

  const onUsePassword = useCallback(() => {
    cancel();
    navigation.replace('Password', passwordParams(username));
  }, [cancel, navigation, passwordParams, username]);

  return (
    <View style={styles.container} testID="quick-connect-screen">
      <Text style={styles.title}>Sign in with Quick Connect</Text>
      <Text style={styles.hint} testID="quick-connect-instructions">
        On another device signed in to {serverName ?? 'this server'}, open
        Settings → Quick Connect and enter this code.
      </Text>

      <View style={styles.body}>
        {status.kind === 'waiting' ? (
          <>
            <Text style={styles.code} testID="quick-connect-code">
              {status.code}
            </Text>
            <Text style={styles.countdown} testID="quick-connect-countdown">
              Expires in {formatCountdown(status.deadline - now)}
            </Text>
          </>
        ) : failed ? (
          <Text style={styles.error} testID="quick-connect-error">
            {status.kind === 'offline'
              ? `Can't reach ${serverName ?? 'the server'}.`
              : status.message}
          </Text>
        ) : (
          <ActivityIndicator
            testID="quick-connect-loading"
            size="large"
            color={colors.cyan}
          />
        )}
      </View>

      <View style={styles.actions}>
        {failed ? (
          <>
            <FocusableButton
              testID="quick-connect-retry"
              label="Try again"
              hasTVPreferredFocus
              onPress={start}
            />
            <View style={styles.actionGap} />
          </>
        ) : null}
        <FocusableButton
          testID="quick-connect-cancel"
          label="Cancel"
          hasTVPreferredFocus={!failed}
          onPress={onCancel}
        />
        <View style={styles.actionGap} />
        <FocusableButton
          testID="quick-connect-use-password"
          label="Use password"
          onPress={onUsePassword}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: layout.screenPadding,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  title: {
    ...typography.display,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  hint: {
    ...typography.body,
    color: colors.textMuted,
    maxWidth: px(1200),
  },
  body: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: px(200),
    marginTop: spacing.xl,
  },
  code: {
    ...typography.display,
    fontSize: px(96),
    lineHeight: px(112),
    letterSpacing: px(24),
    color: colors.text,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  countdown: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  error: {
    ...typography.heading,
    color: colors.violetLight,
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.xl,
  },
  actionGap: {
    width: spacing.md,
  },
});

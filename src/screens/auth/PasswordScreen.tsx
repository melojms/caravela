import {isAxiosError} from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputSubmitEditingEventData,
  View,
} from 'react-native';

import {AuthError, getAuthService} from '../../auth/authService';
import type {AuthService} from '../../auth/authService';
import {useSession} from '../../auth/SessionContext';
import {getAuthStore} from '../../auth/store';
import type {AuthStore} from '../../auth/store';
import {FocusableButton} from '../../components/FocusableButton';
import type {RootStackScreenProps} from '../../navigation/types';
import {
  colors,
  focus,
  layout,
  px,
  radius,
  spacing,
  typography,
} from '../../theme';

/** The notice Quick Connect passes when the server has it turned off. */
export const QUICK_CONNECT_OFF = 'Quick Connect is turned off on this server.';

const GENERIC_ERROR = 'Something went wrong. Try again.';

/**
 * Vega's keyboard also calls onSubmitEditing for its own actions (such as
 * show/hide password), so only the return key's action counts. The event
 * has no submitAction outside Vega.
 */
const isReturnKey = (
  event: NativeSyntheticEvent<TextInputSubmitEditingEventData>,
  returnKey: 'next' | 'go',
) => {
  const action = (event.nativeEvent as {submitAction?: string}).submitAction;
  return action === undefined || action === returnKey;
};

type PasswordScreenProps = RootStackScreenProps<'Password'> & {
  /** Injected in tests; the app uses the default service and store. */
  authService?: AuthService;
  authStore?: AuthStore;
};

/**
 * Signs in with a username and password. The username comes from the picker
 * or Quick Connect; without one (Add user, for hidden users) it is typed in.
 */
export const PasswordScreen = ({
  route,
  navigation,
  authService,
  authStore,
}: PasswordScreenProps) => {
  const {serverId, userId, username, notice} = route.params;
  const {signIn} = useSession();
  const [service] = useState(() => authService ?? getAuthService());
  const [store] = useState(() => authStore ?? getAuthStore());

  const [serverName, setServerName] = useState<string>();
  const [usernameInput, setUsernameInput] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [signingIn, setSigningIn] = useState(false);
  const [focused, setFocused] = useState<'username' | 'password'>();
  const passwordInput = useRef<TextInput>(null);
  // A ref as well as state, so a second press in the same frame is ignored.
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    store.getServer(serverId).then(
      (server) => {
        if (!cancelled) {
          setServerName(server?.name);
        }
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [store, serverId]);

  const submit = useCallback(async () => {
    if (busy.current) {
      return;
    }
    const name = username ?? usernameInput.trim();
    if (!name) {
      setError('Enter a username.');
      return;
    }
    busy.current = true;
    setSigningIn(true);
    setError(undefined);
    try {
      // An empty password is allowed, for users without one.
      const session = await service.loginWithPassword(serverId, name, password);
      if (mounted.current) {
        signIn(session);
      }
    } catch (e) {
      if (mounted.current) {
        setError(
          e instanceof AuthError && e.code === 'invalid-credentials'
            ? 'Wrong username or password.'
            : isAxiosError(e) && !e.response
            ? `Can't reach ${serverName ?? 'the server'}.`
            : GENERIC_ERROR,
        );
      }
    } finally {
      busy.current = false;
      if (mounted.current) {
        setSigningIn(false);
      }
    }
  }, [
    username,
    usernameInput,
    password,
    service,
    serverId,
    serverName,
    signIn,
  ]);

  const onUsernameSubmit = useCallback(
    (event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      if (isReturnKey(event, 'next')) {
        passwordInput.current?.focus();
      }
    },
    [],
  );

  const onPasswordSubmit = useCallback(
    (event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      if (isReturnKey(event, 'go')) {
        submit();
      }
    },
    [submit],
  );

  const onChangeUsername = useCallback((text: string) => {
    setUsernameInput(text);
    setError(undefined);
  }, []);

  const onChangePassword = useCallback((text: string) => {
    setPassword(text);
    setError(undefined);
  }, []);

  const quickConnectOff = notice === QUICK_CONNECT_OFF;

  return (
    <View style={styles.container} testID="password-screen">
      <Text style={styles.title}>Sign in</Text>
      {serverName ? (
        <Text style={styles.hint} numberOfLines={1}>
          {serverName}
        </Text>
      ) : null}

      {notice ? (
        <View style={styles.notice} testID="password-notice">
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <View style={styles.form}>
        {username ? (
          <Text
            style={styles.username}
            testID="password-username"
            numberOfLines={1}
            ellipsizeMode="tail">
            {username}
          </Text>
        ) : (
          <TextInput
            testID="password-username-input"
            style={[
              styles.input,
              styles.inputGap,
              focused === 'username' && styles.inputFocused,
            ]}
            value={usernameInput}
            onChangeText={onChangeUsername}
            placeholder="Username"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Username"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={onUsernameSubmit}
            onFocus={() => setFocused('username')}
            onBlur={() => setFocused(undefined)}
            editable={!signingIn}
            hasTVPreferredFocus
          />
        )}
        <TextInput
          ref={passwordInput}
          testID="password-input"
          style={[styles.input, focused === 'password' && styles.inputFocused]}
          value={password}
          onChangeText={onChangePassword}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Password"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={onPasswordSubmit}
          onFocus={() => setFocused('password')}
          onBlur={() => setFocused(undefined)}
          editable={!signingIn}
          hasTVPreferredFocus={Boolean(username)}
        />
      </View>

      <View style={styles.status}>
        {signingIn ? (
          <ActivityIndicator color={colors.cyan} />
        ) : error ? (
          <Text style={styles.error} testID="password-error">
            {error}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <FocusableButton
          testID="password-sign-in"
          label={signingIn ? 'Signing in…' : 'Sign in'}
          onPress={signingIn ? undefined : submit}
        />
        {quickConnectOff ? null : (
          <>
            <View style={styles.actionGap} />
            <FocusableButton
              testID="password-use-quick-connect"
              label="Use Quick Connect"
              onPress={() =>
                navigation.navigate('QuickConnect', {
                  serverId,
                  ...(userId ? {userId} : {}),
                })
              }
            />
          </>
        )}
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
  },
  notice: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  noticeText: {
    ...typography.body,
    color: colors.text,
  },
  form: {
    marginTop: spacing.lg,
  },
  username: {
    ...typography.heading,
    color: colors.text,
    maxWidth: px(960),
    marginBottom: spacing.md,
  },
  input: {
    ...typography.heading,
    maxWidth: px(960),
    minHeight: px(88),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    textAlignVertical: 'center',
    borderRadius: radius.md,
    borderWidth: focus.borderWidth,
    borderColor: colors.transparent,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  inputGap: {
    marginBottom: spacing.md,
  },
  inputFocused: {
    borderColor: colors.focus,
    backgroundColor: colors.surfaceRaised,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: px(56),
    marginTop: spacing.sm,
  },
  error: {
    ...typography.body,
    color: colors.violetLight,
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  actionGap: {
    width: spacing.md,
  },
});

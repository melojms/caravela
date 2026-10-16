import {useNavigation} from '@amazon-devices/react-navigation__native';
import type {NativeStackNavigationProp} from '@amazon-devices/react-navigation__native-stack';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {useSession} from '../auth/SessionContext';
import {getAuthStore} from '../auth/store';
import type {AuthStore, AutoLogin} from '../auth/store';
import {FocusableButton} from '../components/FocusableButton';
import type {RootStackParamList} from '../navigation/types';
import {colors, spacing, typography} from '../theme';
import {ScreenContainer} from './ScreenContainer';

/** One choice in the auto-login row. */
interface AutoLoginOption {
  key: string;
  label: string;
  value: AutoLogin;
}

/** Identifies an auto-login value, so equal values compare equal. */
export const autoLoginKey = (value: AutoLogin) =>
  value.mode === 'specificUser'
    ? `specificUser:${value.serverId}:${value.userId}`
    : value.mode;

type SettingsScreenProps = {
  /** Injected in tests; the app uses the default store. */
  authStore?: AuthStore;
};

export const SettingsScreen = ({authStore}: SettingsScreenProps) => {
  const {session, switchUser, signOut} = useSession();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [store] = useState(() => authStore ?? getAuthStore());

  const [selected, setSelected] = useState<AutoLogin>();
  // A saved specificUser for someone other than the current user.
  const [otherUser, setOtherUser] = useState<AutoLoginOption>();
  const [error, setError] = useState<string>();
  const [signingOut, setSigningOut] = useState(false);
  // Refs as well as state, so a second press in the same frame is ignored.
  const signingOutRef = useRef(false);
  // The last value the store confirmed, to revert to when a save fails.
  const savedValue = useRef<AutoLogin | undefined>(undefined);
  // Bumped by every save, so only the latest one can revert the selection.
  const saveCount = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const currentServerId = session?.server.id;
  const currentUserId = session?.user.Id;

  useEffect(() => {
    let cancelled = false;
    store.getState().then(
      (state) => {
        if (cancelled) {
          return;
        }
        const {autoLogin} = state;
        savedValue.current = autoLogin;
        setSelected(autoLogin);
        if (
          autoLogin.mode === 'specificUser' &&
          (autoLogin.serverId !== currentServerId ||
            autoLogin.userId !== currentUserId)
        ) {
          const server = state.servers[autoLogin.serverId];
          const name = server?.users[autoLogin.userId]?.name;
          // Names the server too, as the same name can exist on two servers.
          const where =
            server && server.id !== currentServerId ? ` on ${server.name}` : '';
          setOtherUser({
            key: autoLoginKey(autoLogin),
            label: name ? `Only ${name}${where}` : 'Only another user',
            value: autoLogin,
          });
        }
      },
      (reason) => {
        console.warn('Loading the auto-login setting failed', reason);
        if (!cancelled) {
          setError("Couldn't load the setting.");
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [store, currentServerId, currentUserId]);

  const saveAutoLogin = useCallback(
    async (value: AutoLogin) => {
      const save = ++saveCount.current;
      setSelected(value);
      setError(undefined);
      try {
        await store.setAutoLogin(value);
        savedValue.current = value;
      } catch (reason) {
        console.warn('Saving the auto-login setting failed', reason);
        if (mounted.current && save === saveCount.current) {
          setSelected(savedValue.current);
          setError("Couldn't save the setting.");
        }
      }
    },
    [store],
  );

  const onSignOut = useCallback(async () => {
    if (signingOutRef.current) {
      return;
    }
    signingOutRef.current = true;
    setSigningOut(true);
    try {
      await signOut();
    } catch (reason) {
      // SessionContext already shows the picker; the server keeps the token.
      console.warn('Signing out failed', reason);
    } finally {
      signingOutRef.current = false;
      if (mounted.current) {
        setSigningOut(false);
      }
    }
  }, [signOut]);

  const options: AutoLoginOption[] = [
    {key: 'disabled', label: 'Off', value: {mode: 'disabled'}},
    {key: 'lastUser', label: 'Last user', value: {mode: 'lastUser'}},
  ];
  if (session) {
    const value: AutoLogin = {
      mode: 'specificUser',
      serverId: session.server.id,
      userId: session.user.Id,
    };
    options.push({
      key: autoLoginKey(value),
      label: `Only ${session.user.Name}`,
      value,
    });
  }
  if (otherUser) {
    options.push(otherUser);
  }
  const selectedKey = selected && autoLoginKey(selected);

  return (
    <ScreenContainer title="Settings" testID="settings-screen">
      <Text style={styles.heading}>Account</Text>

      {session ? (
        <View style={styles.signedIn} testID="settings-signed-in">
          <Text style={styles.label}>Signed in as</Text>
          <Text
            style={styles.userName}
            numberOfLines={1}
            testID="settings-user-name">
            {session.user.Name}
          </Text>
          <Text
            style={styles.server}
            numberOfLines={1}
            testID="settings-server">
            {session.server.name} · {session.server.address}
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <FocusableButton
          testID="settings-switch-user"
          label="Switch user"
          onPress={switchUser}
        />
        <View style={styles.gap} />
        <FocusableButton
          testID="settings-sign-out"
          label={signingOut ? 'Signing out…' : 'Sign out'}
          onPress={onSignOut}
        />
      </View>

      <Text style={styles.label}>Auto-login</Text>
      <View style={styles.row} testID="settings-auto-login">
        {options.map((option, index) => (
          <React.Fragment key={option.key}>
            {index > 0 ? <View style={styles.gap} /> : null}
            <FocusableButton
              testID={`settings-auto-login-${option.value.mode}${
                option === otherUser ? '-other' : ''
              }`}
              label={option.label}
              active={option.key === selectedKey}
              onPress={() => saveAutoLogin(option.value)}
            />
          </React.Fragment>
        ))}
      </View>
      {error ? (
        <Text style={styles.error} testID="settings-error">
          {error}
        </Text>
      ) : null}

      <Text style={styles.heading}>About</Text>
      <View style={styles.row}>
        <FocusableButton
          testID="settings-about"
          label="About"
          onPress={() => navigation.navigate('About')}
        />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  heading: {
    ...typography.heading,
    color: colors.text,
    marginBottom: spacing.md,
  },
  signedIn: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  userName: {
    ...typography.title,
    color: colors.text,
  },
  server: {
    ...typography.body,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  gap: {
    width: spacing.md,
  },
  error: {
    ...typography.body,
    color: colors.violetLight,
    marginTop: -spacing.md,
  },
});

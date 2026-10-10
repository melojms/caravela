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

import {discoverServer, ServerDiscoveryError} from '../../api/serverDiscovery';
import {useSession} from '../../auth/SessionContext';
import {getAuthStore} from '../../auth/store';
import type {AuthStore} from '../../auth/store';
import {FocusableButton} from '../../components/FocusableButton';
import {
  colors,
  focus,
  layout,
  px,
  radius,
  spacing,
  typography,
} from '../../theme';

type AddServerScreenProps = {
  /** Injected in tests; the app uses the real discovery and store. */
  discover?: typeof discoverServer;
  store?: Pick<AuthStore, 'upsertServer'>;
};

const GENERIC_ERROR = 'Something went wrong. Try again.';

/**
 * Vega's keyboard also calls onSubmitEditing for its own actions (such as
 * show/hide password), so only the return key's action submits. The event
 * has no submitAction outside Vega.
 */
const isSubmitKey = (
  event: NativeSyntheticEvent<TextInputSubmitEditingEventData>,
) => {
  const action = (event.nativeEvent as {submitAction?: string}).submitAction;
  return action === undefined || action === 'go';
};

/**
 * Asks for a server address, finds the Jellyfin server behind it and saves
 * it. Selecting the server makes the session gate show its user picker.
 */
export const AddServerScreen = ({
  discover = discoverServer,
  store,
}: AddServerScreenProps) => {
  const {selectServer} = useSession();
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  // A ref as well as state, so a second press in the same frame is ignored.
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const connect = useCallback(async () => {
    if (busy.current) {
      return;
    }
    const input = address.trim();
    if (!input) {
      setError('Enter a server address.');
      return;
    }
    busy.current = true;
    setConnecting(true);
    setError(undefined);
    try {
      const {address: url, systemInfo} = await discover(input);
      if (!mounted.current) {
        return;
      }
      await (store ?? getAuthStore()).upsertServer({
        id: systemInfo.Id,
        name: systemInfo.ServerName ?? url,
        address: url,
        version: systemInfo.Version,
      });
      if (mounted.current) {
        selectServer(systemInfo.Id);
      }
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof ServerDiscoveryError ? e.message : GENERIC_ERROR);
      }
    } finally {
      busy.current = false;
      if (mounted.current) {
        setConnecting(false);
      }
    }
  }, [address, discover, store, selectServer]);

  const onChangeText = useCallback((text: string) => {
    setAddress(text);
    setError(undefined);
  }, []);

  const onSubmitEditing = useCallback(
    (event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      if (isSubmitKey(event)) {
        connect();
      }
    },
    [connect],
  );

  return (
    <View style={styles.container} testID="add-server-screen">
      <Text style={styles.title}>Connect to a server</Text>
      <Text style={styles.hint}>
        Enter your Jellyfin server address, e.g. jellyfin.example.com or
        192.168.1.10:8096
      </Text>
      <TextInput
        testID="add-server-input"
        style={[styles.input, inputFocused && styles.inputFocused]}
        value={address}
        onChangeText={onChangeText}
        placeholder="Server address"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Server address"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        editable={!connecting}
        hasTVPreferredFocus
      />
      <View style={styles.status}>
        {connecting ? (
          <>
            <ActivityIndicator color={colors.cyan} />
            <Text style={styles.statusText}>Connecting…</Text>
          </>
        ) : error ? (
          <Text style={styles.error} testID="add-server-error">
            {error}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <FocusableButton
          testID="add-server-connect"
          label="Connect"
          onPress={connecting ? undefined : connect}
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
    marginBottom: spacing.lg,
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
  statusText: {
    ...typography.body,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  error: {
    ...typography.body,
    color: colors.violetLight,
  },
  actions: {
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
});

import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {getAuthService, getUserImageUrl} from '../../auth/authService';
import type {AuthService, PublicUser} from '../../auth/authService';
import {useSession} from '../../auth/SessionContext';
import {getAuthStore} from '../../auth/store';
import type {AuthStore, StoredServer} from '../../auth/store';
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

/** A tile on the picker: a saved user, a public user, or both. */
export interface PickerUser {
  id: string;
  name: string;
  imageTag?: string;
  accessToken?: string;
}

/**
 * Saved users first (most recently used first), then the public users that
 * aren't saved, by name. A saved user takes the server's current name and
 * image tag when the server lists it.
 */
export function mergeUsers(
  saved: StoredServer['users'],
  publicUsers: PublicUser[],
): PickerUser[] {
  const byId = new Map(publicUsers.map((user) => [user.id, user]));
  const savedUsers = Object.values(saved)
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .map((user): PickerUser => {
      const listed = byId.get(user.id);
      return {
        id: user.id,
        name: listed?.name ?? user.name,
        imageTag: listed?.primaryImageTag,
        accessToken: user.accessToken,
      };
    });
  const publicOnly = publicUsers
    .filter((user) => !saved[user.id])
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (user): PickerUser => ({
        id: user.id,
        name: user.name,
        imageTag: user.primaryImageTag,
      }),
    );
  return [...savedUsers, ...publicOnly];
}

/** Up to two initials, from the first two words of the name. */
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase() || '?';

const AVATAR_SIZE = px(180);
const TILE_WIDTH = px(220);
/** Space between the focus ring and the avatar, so a cyan avatar keeps its edge. */
const AVATAR_GAP = spacing.xxs;

const avatarColors = [
  {background: colors.violet, text: colors.text},
  {background: colors.cyan, text: colors.background},
  {background: colors.violetLight, text: colors.background},
  {background: colors.surfaceRaised, text: colors.text},
];

const avatarColor = (id: string) => {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000003;
  }
  return avatarColors[hash % avatarColors.length];
};

type UserTileProps = {
  user: PickerUser;
  server: StoredServer;
  busy: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: (user: PickerUser) => void;
};

const UserTile = memo(
  ({user, server, busy, hasTVPreferredFocus, onPress}: UserTileProps) => {
    const [focused, setFocused] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    const showImage =
      !imageFailed && Boolean(user.imageTag || user.accessToken);
    const color = avatarColor(user.id);
    const testID = `user-tile-${user.id}`;

    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={user.name}
        accessibilityState={{busy}}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={() => onPress(user)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.tile}>
        {/* The ring is a separate, unfilled view: a filled one shows its
            colour through the transparent border as a ring on every tile. */}
        <View
          testID={`${testID}-ring`}
          style={[styles.ring, focused && styles.ringFocused]}>
          <View
            style={[
              styles.avatar,
              !showImage && {backgroundColor: color.background},
            ]}>
            {showImage ? (
              <Image
                testID={`${testID}-image`}
                source={{
                  uri: getUserImageUrl(server, user.id, {
                    tag: user.imageTag,
                    accessToken: user.accessToken,
                    // The design size in physical pixels at 1080p.
                    maxHeight: AVATAR_SIZE * 2,
                  }),
                }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <Text
                testID={`${testID}-initials`}
                style={[styles.initials, {color: color.text}]}>
                {initials(user.name)}
              </Text>
            )}
            {busy ? (
              <View style={styles.busy} testID={`${testID}-busy`}>
                <ActivityIndicator size="large" color={colors.text} />
              </View>
            ) : null}
          </View>
        </View>
        <Text
          testID={`${testID}-name`}
          style={[styles.name, focused && styles.nameFocused]}
          numberOfLines={1}
          ellipsizeMode="tail">
          {user.name}
        </Text>
      </Pressable>
    );
  },
);

type UserPickerScreenProps = RootStackScreenProps<'UserPicker'> & {
  /** Injected in tests; the app uses the default service and store. */
  authService?: AuthService;
  authStore?: AuthStore;
};

/** Lists the saved and public users of a server so one can sign in. */
export const UserPickerScreen = ({
  route,
  navigation,
  authService,
  authStore,
}: UserPickerScreenProps) => {
  const {serverId} = route.params;
  const {notice, retry, signIn} = useSession();
  const [service] = useState(() => authService ?? getAuthService());
  const [store] = useState(() => authStore ?? getAuthStore());

  const [loading, setLoading] = useState(true);
  const [server, setServer] = useState<StoredServer>();
  const [users, setUsers] = useState<PickerUser[]>([]);
  const [usersFailed, setUsersFailed] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string>();
  const [error, setError] = useState<string>();
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
    setLoading(true);
    Promise.all([
      store.getServer(serverId),
      service.getPublicUsers(serverId).then(
        (list) => ({list, failed: false}),
        () => ({list: [] as PublicUser[], failed: true}),
      ),
    ])
      .then(([stored, {list, failed}]) => {
        if (cancelled) {
          return;
        }
        setServer(stored);
        setUsers(mergeUsers(stored?.users ?? {}, list));
        setUsersFailed(failed);
      })
      .catch(() => {
        if (!cancelled) {
          setUsersFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [service, store, serverId]);

  const onPressUser = useCallback(
    async (user: PickerUser) => {
      if (busy.current) {
        return;
      }
      setError(undefined);
      if (!user.accessToken) {
        navigation.navigate('QuickConnect', {serverId, userId: user.id});
        return;
      }
      busy.current = true;
      setBusyUserId(user.id);
      try {
        const session = await service.restoreSession(serverId, user.id);
        if (session) {
          signIn(session);
          return;
        }
        if (mounted.current) {
          // restoreSession cleared the rejected token.
          setUsers((current) =>
            current.map((entry) =>
              entry.id === user.id ? {...entry, accessToken: undefined} : entry,
            ),
          );
          navigation.navigate('QuickConnect', {serverId, userId: user.id});
        }
      } catch {
        if (mounted.current) {
          setError(`Can't reach ${server?.name ?? 'the server'}.`);
        }
      } finally {
        busy.current = false;
        if (mounted.current) {
          setBusyUserId(undefined);
        }
      }
    },
    [navigation, server, service, serverId, signIn],
  );

  const offline = notice?.kind === 'offline';

  return (
    <View style={styles.container} testID="user-picker">
      <Text style={styles.title} numberOfLines={1}>
        {server?.name ?? ''}
      </Text>
      {server ? (
        <Text style={styles.address} numberOfLines={1}>
          {server.address}
        </Text>
      ) : null}

      {notice ? (
        <View style={styles.notice} testID="user-picker-notice">
          <Text style={styles.noticeText}>{notice.message}</Text>
          {offline ? (
            <FocusableButton
              testID="user-picker-retry"
              label="Retry"
              hasTVPreferredFocus
              onPress={retry}
            />
          ) : null}
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator
          testID="user-picker-loading"
          style={styles.loading}
          size="large"
          color={colors.cyan}
        />
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.users}
            contentContainerStyle={styles.usersContent}>
            {users.map((user, index) =>
              server ? (
                <UserTile
                  key={user.id}
                  user={user}
                  server={server}
                  busy={busyUserId === user.id}
                  hasTVPreferredFocus={index === 0 && !offline}
                  onPress={onPressUser}
                />
              ) : null,
            )}
          </ScrollView>
          {usersFailed ? (
            <Text style={styles.note} testID="user-picker-users-error">
              Couldn't load the server's users.
            </Text>
          ) : null}
          {error ? (
            <Text style={styles.error} testID="user-picker-error">
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <FocusableButton
              testID="user-picker-add-user"
              label="Add user"
              hasTVPreferredFocus={users.length === 0 && !offline}
              onPress={() => navigation.navigate('Password', {serverId})}
            />
            <View style={styles.actionGap} />
            <FocusableButton
              testID="user-picker-change-server"
              label="Change server"
              onPress={() => navigation.navigate('AddServer')}
            />
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: layout.screenPadding,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.display,
    color: colors.text,
  },
  address: {
    ...typography.body,
    color: colors.textMuted,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginRight: spacing.md,
  },
  loading: {
    marginTop: spacing.xxl,
    alignSelf: 'flex-start',
  },
  users: {
    flexGrow: 0,
    marginTop: spacing.xl,
  },
  usersContent: {
    // Room for the focus ring and scale on the edge tiles.
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  tile: {
    width: TILE_WIDTH,
    marginRight: layout.cardGap,
    alignItems: 'center',
  },
  ring: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    padding: AVATAR_GAP,
    borderRadius: radius.pill,
    borderWidth: focus.borderWidth,
    borderColor: colors.transparent,
  },
  ringFocused: {
    borderColor: colors.focus,
    transform: [{scale: focus.scale}],
  },
  avatar: {
    flex: 1,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    ...typography.title,
  },
  busy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 22, 40, 0.6)',
  },
  name: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.sm,
    maxWidth: TILE_WIDTH,
  },
  nameFocused: {
    color: colors.text,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  error: {
    ...typography.body,
    color: colors.violetLight,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.xl,
  },
  actionGap: {
    width: spacing.md,
  },
});

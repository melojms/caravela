import React, {ReactNode, useMemo} from 'react';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {useNavigation} from '@amazon-devices/react-navigation__native';
import type {NativeStackNavigationProp} from '@amazon-devices/react-navigation__native-stack';
import {StyleSheet, Text, View} from 'react-native';

import {getUserImageUrl} from '../auth/authService';
import {useSession} from '../auth/SessionContext';
import {Toolbar} from '../components/Toolbar';
import {RootStackParamList} from '../navigation/types';
import {colors, layout, spacing, typography} from '../theme';

export type ScreenToolbar = 'home' | 'search';

type ScreenContainerProps = {
  title?: string;
  /** Shows the top toolbar with this entry highlighted. */
  toolbar?: ScreenToolbar;
  children: ReactNode;
  testID?: string;
};

// The toolbar avatar's size in physical pixels at 1080p.
const AVATAR_IMAGE_HEIGHT = 100;

/**
 * The top toolbar, wired like androidtv's MainToolbar: the avatar opens the
 * user picker, Home and Search go back to that screen if it's already on the
 * stack (so Back doesn't pass through a second copy), and Settings opens.
 */
const MainToolbar = ({active}: {active: ScreenToolbar}) => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {session, switchUser} = useSession();

  const user = useMemo(
    () => ({
      name: session?.user.Name ?? '',
      imageUri: session
        ? getUserImageUrl(session.server, session.user.Id, {
            tag: session.user.PrimaryImageTag ?? undefined,
            accessToken: session.accessToken,
            maxHeight: AVATAR_IMAGE_HEIGHT,
          })
        : undefined,
    }),
    [session],
  );

  return (
    <Toolbar
      active={active}
      user={user}
      onUserPress={switchUser}
      onHomePress={() => navigation.popTo('Home')}
      onSearchPress={() =>
        navigation.navigate('Search', undefined, {pop: true})
      }
      onSettingsPress={() =>
        navigation.navigate('Settings', undefined, {pop: true})
      }
    />
  );
};

/**
 * A full-screen page, with the toolbar on top when `toolbar` is set. The
 * content uses the toolbar's edge padding, so both line up. The focus guide
 * sends focus back to the last focused item in the content (or the first one
 * on the first visit).
 */
export const ScreenContainer = ({
  title,
  toolbar,
  children,
  testID,
}: ScreenContainerProps) => (
  <View style={styles.screen}>
    {toolbar ? <MainToolbar active={toolbar} /> : null}
    <TVFocusGuideView
      autoFocus
      style={[styles.content, !toolbar && styles.contentTop]}
      testID={testID}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </TVFocusGuideView>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingLeft: layout.screenPadding,
  },
  // The toolbar has its own top padding.
  contentTop: {
    paddingTop: spacing.xl,
  },
  title: {
    ...typography.display,
    color: colors.text,
    marginBottom: spacing.md,
  },
});

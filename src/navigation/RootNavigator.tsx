import {
  DarkTheme,
  NavigationContainer,
  NavigationState,
  Theme,
} from '@amazon-devices/react-navigation__native';
import {createNativeStackNavigator} from '@amazon-devices/react-navigation__native-stack';
import React from 'react';

import {SessionQueryClientProvider} from '../api/queryClient';
import type {AuthService} from '../auth/authService';
import {SessionProvider, useSession} from '../auth/SessionContext';
import type {AuthStore} from '../auth/store';
import {AboutScreen} from '../screens/AboutScreen';
import {DetailsScreen} from '../screens/DetailsScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {LibraryScreen} from '../screens/LibraryScreen';
import {PlayerScreen} from '../screens/PlayerScreen';
import {SearchScreen} from '../screens/SearchScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import {AddServerScreen} from '../screens/auth/AddServerScreen';
import {LaunchScreen} from '../screens/auth/LaunchScreen';
import {PasswordScreen} from '../screens/auth/PasswordScreen';
import {QuickConnectScreen} from '../screens/auth/QuickConnectScreen';
import {UserPickerScreen} from '../screens/auth/UserPickerScreen';
import {colors} from '../theme';
import {RootStackParamList} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.menu,
    primary: colors.violet,
    text: colors.text,
  },
};

/** Launch screen; shows the load error and Retry when there is one. */
const Launch = () => {
  const {error, retry} = useSession();
  return <LaunchScreen error={error} onRetry={retry} />;
};

const addServer = (
  <Stack.Screen key="AddServer" name="AddServer" component={AddServerScreen} />
);

/**
 * Root stack, gated on the session (React Navigation's conditional screens):
 * the launch screen while saved logins load, the auth routes when nobody is
 * signed in, and Home plus the pages it opens once signed in. Swapping the
 * screen set resets the stack. NavigationContainer pops on the remote Back
 * key, so Back from any page returns to the one that opened it; on Home (a
 * root screen) it doesn't handle it and Vega's BackHandler exits the app.
 */
const RootStack = () => {
  const {status, serverId} = useSession();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: colors.background},
      }}>
      {status === 'loading' || status === 'error' ? (
        <Stack.Screen name="Launch" component={Launch} />
      ) : status === 'signedIn' ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Search" component={SearchScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="About" component={AboutScreen} />
          <Stack.Screen name="Library" component={LibraryScreen} />
          <Stack.Screen name="Details" component={DetailsScreen} />
          {/* Full-screen video: cut straight to it rather than sliding in. */}
          <Stack.Screen
            name="Player"
            component={PlayerScreen}
            options={{animation: 'none'}}
          />
        </>
      ) : (
        // A new key (status or picked server) restarts the auth flow. The
        // stack starts at the first screen, so the order follows the status.
        <Stack.Group navigationKey={`${status}:${serverId ?? ''}`}>
          {status === 'needsServer' ? addServer : null}
          <Stack.Screen
            name="UserPicker"
            component={UserPickerScreen}
            initialParams={serverId ? {serverId} : undefined}
          />
          {status === 'needsServer' ? null : addServer}
          <Stack.Screen name="Password" component={PasswordScreen} />
          <Stack.Screen name="QuickConnect" component={QuickConnectScreen} />
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
};

type RootNavigatorProps = {
  /** Injected in tests; the app uses the default service and store. */
  authService?: AuthService;
  authStore?: AuthStore;
};

/**
 * Notices only show on the user picker, so leaving it hides the notice.
 * Checking the focused route (rather than clearing on any state change)
 * keeps the notice when the screen set swaps to the auth routes.
 */
const Navigation = () => {
  const {notice, clearNotice} = useSession();
  const onStateChange = (state?: NavigationState) => {
    const focused = state?.routes[state.index]?.name;
    if (notice && focused !== 'UserPicker') {
      clearNotice();
    }
  };
  return (
    <NavigationContainer theme={theme} onStateChange={onStateChange}>
      <RootStack />
    </NavigationContainer>
  );
};

export const RootNavigator = ({authService, authStore}: RootNavigatorProps) => (
  <SessionProvider authService={authService} authStore={authStore}>
    <SessionQueryClientProvider>
      <Navigation />
    </SessionQueryClientProvider>
  </SessionProvider>
);

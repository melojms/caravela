import {
  DarkTheme,
  NavigationContainer,
  NavigationState,
  StackActions,
  Theme,
  useNavigationContainerRef,
} from '@amazon-devices/react-navigation__native';
import {createNativeStackNavigator} from '@amazon-devices/react-navigation__native-stack';
import React, {useEffect, useRef, useState} from 'react';

import {SessionQueryClientProvider} from '../api/queryClient';
import type {AuthService} from '../auth/authService';
import {SessionProvider, useSession} from '../auth/SessionContext';
import type {SessionState} from '../auth/SessionContext';
import type {AuthStore} from '../auth/store';
import {AboutScreen} from '../screens/AboutScreen';
import {DetailsScreen} from '../screens/DetailsScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {LibraryScreen} from '../screens/LibraryScreen';
import {LicensesScreen, LicenseTextScreen} from '../screens/LicensesScreen';
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

/**
 * How long a pop takes to settle in Vega's screens library before the next
 * stack change. A timer, because on OS 1.2 a pop sends no transitionEnd
 * (pushes do).
 */
export const POP_SETTLE_MS = 500;

type ScreenSet = Pick<SessionState, 'status' | 'serverId'>;

/** Which screens the stack shows; a new key swaps the screen set. */
const screenSetKey = ({status, serverId}: ScreenSet) =>
  status === 'signedIn'
    ? 'signedIn'
    : status === 'loading' || status === 'error'
    ? 'launch'
    : `${status}:${serverId ?? ''}`;

const addServer = (
  <Stack.Screen key="AddServer" name="AddServer" component={AddServerScreen} />
);

type RootStackProps = ScreenSet & {
  /** Pops without animation while the stack unwinds for a swap. */
  unwinding: boolean;
};

/**
 * Root stack, gated on the session (React Navigation's conditional screens):
 * the launch screen while saved logins load, the auth routes when nobody is
 * signed in, and Home plus the pages it opens once signed in. Swapping the
 * screen set resets the stack. NavigationContainer pops on the remote Back
 * key, so Back from any page returns to the one that opened it; on Home (a
 * root screen) it doesn't handle it and Vega's BackHandler exits the app.
 */
const RootStack = ({status, serverId, unwinding}: RootStackProps) => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: colors.background},
        ...(unwinding ? {animation: 'none' as const} : {}),
      }}>
      {status === 'loading' || status === 'error' ? (
        <Stack.Screen name="Launch" component={Launch} />
      ) : status === 'signedIn' ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Search" component={SearchScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="About" component={AboutScreen} />
          <Stack.Screen name="Licenses" component={LicensesScreen} />
          <Stack.Screen name="LicenseText" component={LicenseTextScreen} />
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
  const {notice, clearNotice, status, serverId} = useSession();
  const navigation = useNavigationContainerRef<RootStackParamList>();
  const [shown, setShown] = useState<ScreenSet>({status, serverId});
  const unwinding = screenSetKey({status, serverId}) !== screenSetKey(shown);
  // Bumped when a pop has settled, to take the next unwinding step.
  const [settled, setSettled] = useState(0);
  // The timer of the pop that is settling.
  const pop = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /*
   * Vega's screens library (OS 1.2) crashes when a swap removes more than
   * the top screen, or removes one while a pop is still settling. So before
   * the screen set changes, the stack is popped down to one screen, one pop
   * at a time, each given POP_SETTLE_MS.
   */
  useEffect(() => {
    if (!unwinding || pop.current !== undefined) {
      return;
    }
    const routes = navigation.isReady()
      ? navigation.getRootState().routes.length
      : 0;
    if (routes <= 1) {
      setShown({status, serverId});
      return;
    }
    pop.current = setTimeout(() => {
      pop.current = undefined;
      setSettled((count) => count + 1);
    }, POP_SETTLE_MS);
    navigation.dispatch(StackActions.pop());
  }, [navigation, unwinding, status, serverId, settled]);

  useEffect(
    () => () => {
      clearTimeout(pop.current);
      pop.current = undefined;
    },
    [],
  );

  const onStateChange = (state?: NavigationState) => {
    const focused = state?.routes[state.index]?.name;
    if (notice && focused !== 'UserPicker') {
      clearNotice();
    }
  };
  return (
    <NavigationContainer
      ref={navigation}
      theme={theme}
      onStateChange={onStateChange}>
      <RootStack
        {...(unwinding ? shown : {status, serverId})}
        unwinding={unwinding}
      />
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

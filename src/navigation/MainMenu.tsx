import {createBottomTabNavigator} from '@amazon-devices/react-navigation__bottom-tabs';
import React from 'react';

import {HomeScreen} from '../screens/HomeScreen';
import {MoviesScreen} from '../screens/MoviesScreen';
import {SearchScreen} from '../screens/SearchScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import {ShowsScreen} from '../screens/ShowsScreen';
import {colors} from '../theme';
import {SideMenu} from './SideMenu';
import {MenuParamList} from './types';

const Tab = createBottomTabNavigator<MenuParamList>();

const renderSideMenu = (props: React.ComponentProps<typeof SideMenu>) => (
  <SideMenu {...props} />
);

/**
 * The menu sections. A tab navigator with its bar on the left gives a
 * persistent side menu without the drawer's gesture/reanimated dependencies.
 * backBehavior "firstRoute" makes Back from any section return to Home, and
 * Back on Home falls through to the system, which exits the app.
 */
export const MainMenu = () => (
  <Tab.Navigator
    initialRouteName="Home"
    backBehavior="firstRoute"
    tabBar={renderSideMenu}
    screenOptions={{
      headerShown: false,
      tabBarPosition: 'left',
      sceneStyle: {backgroundColor: colors.background},
      lazy: true,
    }}>
    <Tab.Screen name="Home" component={HomeScreen} />
    <Tab.Screen name="Movies" component={MoviesScreen} />
    <Tab.Screen name="Shows" component={ShowsScreen} />
    <Tab.Screen name="Search" component={SearchScreen} />
    <Tab.Screen name="Settings" component={SettingsScreen} />
  </Tab.Navigator>
);

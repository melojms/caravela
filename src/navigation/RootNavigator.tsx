import {
  DarkTheme,
  NavigationContainer,
  Theme,
} from '@amazon-devices/react-navigation__native';
import {createNativeStackNavigator} from '@amazon-devices/react-navigation__native-stack';
import React from 'react';

import {DetailsPlaceholder} from '../screens/DetailsPlaceholder';
import {colors} from '../theme';
import {MainMenu} from './MainMenu';
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

/**
 * Root stack: the menu sections live in "Main", and full-screen pages
 * (Details now, Player later) are pushed on top. NavigationContainer listens
 * for the remote Back key and pops the stack when it can.
 */
export const RootNavigator = () => (
  <NavigationContainer theme={theme}>
    <Stack.Navigator
      initialRouteName="Main"
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: colors.background},
      }}>
      <Stack.Screen name="Main" component={MainMenu} />
      <Stack.Screen name="DetailsPlaceholder" component={DetailsPlaceholder} />
    </Stack.Navigator>
  </NavigationContainer>
);

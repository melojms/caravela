import {
  enableFreeze,
  enableScreens,
} from '@amazon-devices/react-native-screens';
import React from 'react';

import {RootNavigator} from './navigation/RootNavigator';

enableScreens();
enableFreeze();

export const App = () => <RootNavigator />;

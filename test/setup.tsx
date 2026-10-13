/* eslint-env jest */
import React from 'react';

// The Vega Carousel renders through a native recycler that doesn't exist in
// Jest. Render every item in a plain View so rows can be queried.
jest.mock('@amazon-devices/vega-carousel', () => {
  const {View} = require('react-native');
  return {
    Carousel: ({dataAdapter, renderItem, testID}: any) => {
      const count = dataAdapter.getItemCount();
      const children = [];
      for (let index = 0; index < count; index++) {
        const item = dataAdapter.getItem(index);
        children.push(
          <View key={String(dataAdapter.getItemKey({item, index}))}>
            {renderItem({item, index})}
          </View>,
        );
      }
      return <View testID={testID}>{children}</View>;
    },
  };
});

// react-native-svg draws natively. Stand in plain Views that keep their props,
// so tests can find an icon or a scrim and read its fill or gradient stops.
jest.mock('@amazon-devices/react-native-svg', () => {
  const {View} = require('react-native');
  const element = ({children, ...props}: any) => (
    <View {...props}>{children}</View>
  );
  return {
    Svg: element,
    Path: element,
    Rect: element,
    Defs: element,
    LinearGradient: element,
    Stop: element,
  };
});

// The device's 12/24 h setting; 24 h unless a test says otherwise with
// jest.mocked(uses24HourClock).mockReturnValue(false).
jest.mock('@amazon-devices/react-native-localize', () => ({
  uses24HourClock: jest.fn(() => true),
}));

// The Vega Jest preset mocks BackHandler without a default export and has
// Dimensions.addEventListener return nothing. React Navigation needs both to
// hand back a subscription, so replace them with RN 0.83-shaped mocks.
// react-native's index resolves the .kepler variant of BackHandler.
jest.mock(
  '@amazon-devices/react-native-kepler/Libraries/Utilities/BackHandler.kepler',
  () => ({
    __esModule: true,
    default: {
      addEventListener: jest.fn(() => ({remove: jest.fn()})),
      exitApp: jest.fn(),
    },
  }),
);

jest.mock(
  '@amazon-devices/react-native-kepler/Libraries/Utilities/Dimensions',
  () => {
    const window = {fontScale: 1, height: 540, scale: 2, width: 960};
    return {
      __esModule: true,
      default: {
        get: () => window,
        set: jest.fn(),
        addEventListener: jest.fn(() => ({remove: jest.fn()})),
      },
    };
  },
);

import type {BottomTabBarProps} from '@amazon-devices/react-navigation__bottom-tabs';
import React from 'react';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {StyleSheet, Text, View} from 'react-native';

import {FocusableButton} from '../components/FocusableButton';
import {colors, layout, spacing, typography} from '../theme';
import {MENU_ENTRIES} from './menuEntries';

/**
 * Left-hand menu, rendered as the tab navigator's tab bar. The focus guide
 * remembers the last focused entry, so pressing Left from the content lands
 * back on it instead of the nearest entry by geometry.
 */
export const SideMenu = ({state, navigation}: BottomTabBarProps) => {
  const activeRoute = state.routes[state.index]?.name;

  return (
    <View style={styles.menu} testID="side-menu">
      <Text style={styles.brand}>Caravela</Text>
      <TVFocusGuideView autoFocus style={styles.entries}>
        {MENU_ENTRIES.map((entry) => (
          <View key={entry.route} style={styles.entry}>
            <FocusableButton
              testID={`menu-item-${entry.route}`}
              label={entry.label}
              active={entry.route === activeRoute}
              onPress={() => navigation.navigate(entry.route)}
            />
          </View>
        ))}
      </TVFocusGuideView>
    </View>
  );
};

const styles = StyleSheet.create({
  menu: {
    width: layout.menuWidth,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
    backgroundColor: colors.menu,
  },
  brand: {
    ...typography.title,
    color: colors.violetLight,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  entries: {
    flex: 1,
  },
  entry: {
    marginBottom: spacing.sm,
  },
});

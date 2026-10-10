import React, {ReactNode} from 'react';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {StyleSheet, Text} from 'react-native';

import {colors, layout, spacing, typography} from '../theme';

type ScreenContainerProps = {
  title?: string;
  children: ReactNode;
  testID?: string;
};

/**
 * Content area beside the side menu. The focus guide sends Right from the
 * menu to the last focused item here (or the first one on the first visit).
 */
export const ScreenContainer = ({
  title,
  children,
  testID,
}: ScreenContainerProps) => (
  <TVFocusGuideView autoFocus style={styles.container} testID={testID}>
    {title ? <Text style={styles.title}>{title}</Text> : null}
    {children}
  </TVFocusGuideView>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.xl,
    paddingLeft: layout.screenPadding,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.display,
    color: colors.text,
    marginBottom: spacing.md,
  },
});

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {FocusableButton} from '../components/FocusableButton';
import {colors, spacing, typography} from '../theme';
import {ScreenContainer} from './ScreenContainer';

type PlaceholderScreenProps = {
  title: string;
  message: string;
  testID: string;
};

/** Stand-in for sections that are built in later tasks. */
export const PlaceholderScreen = ({
  title,
  message,
  testID,
}: PlaceholderScreenProps) => (
  <ScreenContainer title={title} testID={testID}>
    <Text style={styles.message}>{message}</Text>
    <View style={styles.actions}>
      <FocusableButton label="Coming soon" testID={`${testID}-button`} />
    </View>
  </ScreenContainer>
);

const styles = StyleSheet.create({
  message: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
  actions: {
    alignItems: 'flex-start',
  },
});

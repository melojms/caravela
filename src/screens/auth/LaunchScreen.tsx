import React from 'react';
import {ActivityIndicator, Image, StyleSheet, Text, View} from 'react-native';

import {FocusableButton} from '../../components/FocusableButton';
import {colors, px, spacing, typography} from '../../theme';

const icon = require('../../assets/caravela-icon.png');

type LaunchScreenProps = {
  /** Replaces the spinner with this message and a Retry button. */
  error?: string;
  onRetry?: () => void;
};

/** Shown while the saved logins load and the token is checked. */
export const LaunchScreen = ({error, onRetry}: LaunchScreenProps) => (
  <View style={styles.container} testID="launch-screen">
    <Image source={icon} style={styles.icon} accessibilityIgnoresInvertColors />
    <Text style={styles.name}>Caravela</Text>
    {error ? (
      <>
        <Text style={styles.error}>{error}</Text>
        <FocusableButton
          testID="launch-retry"
          label="Retry"
          hasTVPreferredFocus
          onPress={onRetry}
        />
      </>
    ) : (
      <ActivityIndicator size="large" color={colors.cyan} />
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  icon: {
    width: px(200),
    height: px(200),
    marginBottom: spacing.md,
  },
  name: {
    ...typography.display,
    color: colors.text,
    marginBottom: spacing.xl,
  },
  error: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
});

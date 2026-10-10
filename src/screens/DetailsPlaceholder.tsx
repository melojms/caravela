import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {FocusableButton} from '../components/FocusableButton';
import {RootStackScreenProps} from '../navigation/types';
import {colors, layout, spacing, typography} from '../theme';

/** Pushed on the root stack from any card. Replaced by real Details in task 7. */
export const DetailsPlaceholder = ({
  route,
  navigation,
}: RootStackScreenProps<'DetailsPlaceholder'>) => (
  <View style={styles.container} testID="details-screen">
    <Text style={styles.title}>{route.params.title}</Text>
    <Text style={styles.meta}>Item {route.params.itemId}</Text>
    <Text style={styles.meta}>Details arrive in a later task.</Text>
    <View style={styles.actions}>
      <FocusableButton
        testID="details-back"
        label="Back"
        hasTVPreferredFocus
        onPress={() => navigation.goBack()}
      />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: layout.screenPadding,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  title: {
    ...typography.display,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  meta: {
    ...typography.body,
    color: colors.textMuted,
  },
  actions: {
    marginTop: spacing.xl,
    alignItems: 'flex-start',
  },
});

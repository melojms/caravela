import {getDisplayVersion} from '@jellyfin/sdk/lib/utils/versioning';
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {
  getAppVersion,
  LICENSE_NAME,
  PRIVACY_URL,
  SOURCE_URL,
  useServerInfo,
} from '../about/appInfo';
import {FocusableButton} from '../components/FocusableButton';
import type {RootStackScreenProps} from '../navigation/types';
import {colors, spacing, typography} from '../theme';
import {ScreenContainer} from './ScreenContainer';

const versionText = () => {
  const {version, build} = getAppVersion();
  return build ? `Version ${version} (build ${build})` : `Version ${version}`;
};

/**
 * The app and server versions, the disclaimer, the licence, source and
 * privacy policy (as text: links can't be opened on a TV), and the way to the
 * third-party licences, the only focusable item.
 */
export const AboutScreen = ({navigation}: RootStackScreenProps<'About'>) => {
  const server = useServerInfo();
  const serverVersion = getDisplayVersion(server?.version);

  return (
    <ScreenContainer title="About" testID="about-screen">
      <View style={styles.section}>
        <Text style={styles.title}>Caravela</Text>
        <Text style={styles.body} testID="about-version">
          {versionText()}
        </Text>
      </View>

      {server?.name ? (
        <View style={styles.section}>
          <Text style={styles.label}>Server</Text>
          <Text style={styles.body} numberOfLines={1} testID="about-server">
            {serverVersion
              ? `${server.name} · Jellyfin ${serverVersion}`
              : server.name}
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.body}>
          Unofficial client, not affiliated with the Jellyfin project.
        </Text>
        <Text style={styles.body}>{`Licence: ${LICENSE_NAME}`}</Text>
        <Text style={styles.body}>{`Source: ${SOURCE_URL}`}</Text>
        <Text style={styles.body}>{`Privacy policy: ${PRIVACY_URL}`}</Text>
      </View>

      <View style={styles.row}>
        <FocusableButton
          testID="about-licenses"
          label="Third-party licences"
          hasTVPreferredFocus
          onPress={() => navigation.navigate('Licenses')}
        />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  label: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

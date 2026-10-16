import React, {memo, useCallback, useMemo, useState} from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

import {LICENSES} from '../about/thirdPartyLicenses';
import type {LicenseEntry} from '../about/types';
import type {RootStackScreenProps} from '../navigation/types';
import {colors, focus, layout, px, radius, spacing, typography} from '../theme';
import {ScreenContainer} from './ScreenContainer';

/** About the most a licence chunk holds: well under a screen of text. */
export const LICENSE_CHUNK_LIMIT = 600;

/** Amazon's packages have their own licence, with no SPDX ID. */
const licenseLabel = (license: string) =>
  license === 'See license in LICENSE' ? 'See licence text' : license;

/**
 * Splits a licence text into chunks of at most `limit` characters, so a TV
 * remote can scroll it a chunk at a time. Paragraphs (split on blank lines)
 * are merged while they fit, keeping a blank line between them; an oversized
 * paragraph is split on its line breaks. A single line longer than the limit
 * stays whole. Line breaks and indentation are kept, blank lines at the
 * edges dropped, and no chunk is empty.
 */
export const chunkLicenseText = (
  text: string,
  limit = LICENSE_CHUNK_LIMIT,
): string[] => {
  const paragraphs: string[][] = [[]];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') {
      paragraphs.push([]);
    } else {
      paragraphs[paragraphs.length - 1].push(line);
    }
  }

  const chunks: string[] = [];
  let current = '';
  const add = (piece: string, separator: string) => {
    if (current && current.length + separator.length + piece.length > limit) {
      chunks.push(current);
      current = '';
    }
    current = current ? current + separator + piece : piece;
  };
  for (const lines of paragraphs) {
    if (!lines.length) {
      continue;
    }
    const paragraph = lines.join('\n');
    if (paragraph.length <= limit) {
      add(paragraph, '\n\n');
    } else {
      add(lines[0], '\n\n');
      lines.slice(1).forEach((line) => add(line, '\n'));
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
};

type LicenseRowProps = {
  entry: LicenseEntry;
  index: number;
  onPress: (entry: LicenseEntry) => void;
};

/** One package: "<name> <version>" and its licence ID, muted. */
const LicenseRow = memo(({entry, index, onPress}: LicenseRowProps) => {
  const [focused, setFocused] = useState(false);
  const label = `${entry.name} ${entry.version}`;
  return (
    <Pressable
      testID={`licenses-row-${index}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      hasTVPreferredFocus={index === 0}
      onPress={() => onPress(entry)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.row, focused && styles.rowFocused]}>
      <Text
        style={[styles.rowName, focused && styles.rowTextFocused]}
        numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.rowLicense, focused && styles.rowTextFocused]}
        numberOfLines={1}>
        {licenseLabel(entry.license)}
      </Text>
    </Pressable>
  );
});

/**
 * The third-party packages shipped in the app, one focusable row each.
 * Vega's ScrollView scrolls the focused row into view.
 */
export const LicensesScreen = ({
  navigation,
}: RootStackScreenProps<'Licenses'>) => {
  const open = useCallback(
    (entry: LicenseEntry) =>
      navigation.navigate('LicenseText', {
        name: entry.name,
        version: entry.version,
      }),
    [navigation],
  );

  return (
    <ScreenContainer title="Third-party licences" testID="licenses-screen">
      <Text style={styles.intro}>
        Caravela includes these packages. Select one to read its licence.
      </Text>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>
        {LICENSES.map((entry, index) => (
          <LicenseRow
            key={`${entry.name}@${entry.version}`}
            entry={entry}
            index={index}
            onPress={open}
          />
        ))}
      </ScrollView>
    </ScreenContainer>
  );
};

type ChunkProps = {text: string; index: number};

/**
 * A piece of licence text. It's focusable only so Up and Down can scroll
 * the text; a thin bar marks the focused piece.
 */
const Chunk = memo(({text, index}: ChunkProps) => {
  const [focused, setFocused] = useState(false);
  const testID = `license-text-chunk-${index}`;
  return (
    <Pressable
      testID={testID}
      focusable
      hasTVPreferredFocus={index === 0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.chunk, focused && styles.chunkFocused]}>
      <Text testID={`${testID}-text`} style={styles.chunkText}>
        {text}
      </Text>
    </Pressable>
  );
});

const renderChunk = ({item, index}: ListRenderItemInfo<string>) => (
  <Chunk text={item} index={index} />
);

const chunkKey = (_chunk: string, index: number) => String(index);

/**
 * One package's licence ID, URL (as text: links can't be opened on a TV) and
 * full text. The text is a virtualised list of focusable chunks, so the
 * 300 KB one doesn't render at once and Up/Down scroll it.
 */
export const LicenseTextScreen = ({
  route,
}: RootStackScreenProps<'LicenseText'>) => {
  const {name, version} = route.params;
  const entry = LICENSES.find(
    (license) => license.name === name && license.version === version,
  );
  const chunks = useMemo(
    () => (entry ? chunkLicenseText(entry.text) : []),
    [entry],
  );

  return (
    <ScreenContainer title={`${name} ${version}`} testID="license-text-screen">
      {entry ? (
        <>
          <Text style={styles.meta} testID="license-text-license">
            {`Licence: ${licenseLabel(entry.license)}`}
          </Text>
          {entry.url ? (
            <Text
              style={styles.meta}
              numberOfLines={1}
              testID="license-text-url">
              {entry.url}
            </Text>
          ) : null}
          <FlatList
            data={chunks}
            renderItem={renderChunk}
            keyExtractor={chunkKey}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={5}
            showsVerticalScrollIndicator={false}
            style={styles.text}
            contentContainerStyle={styles.textContent}
          />
        </>
      ) : (
        <Text style={styles.meta} testID="license-text-not-found">
          Licence not found
        </Text>
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  intro: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  // Room for the focus ring at the ends, and the screen's padding on the right.
  list: {
    paddingVertical: spacing.xs,
    paddingRight: layout.screenPadding,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: px(64),
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    // Always drawn, so the focus ring doesn't shift the row.
    borderWidth: focus.borderWidth,
    borderColor: colors.transparent,
    backgroundColor: colors.surface,
  },
  rowFocused: {
    borderColor: colors.focus,
    backgroundColor: colors.violet,
  },
  rowName: {
    ...typography.label,
    color: colors.text,
    flex: 1,
    marginRight: spacing.md,
  },
  rowLicense: {
    ...typography.label,
    color: colors.textMuted,
  },
  rowTextFocused: {
    color: colors.text,
  },
  meta: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  text: {
    flex: 1,
    marginTop: spacing.sm,
  },
  textContent: {
    paddingRight: layout.screenPadding,
    paddingBottom: spacing.xl,
  },
  chunk: {
    paddingLeft: spacing.sm,
    paddingVertical: spacing.xs,
    borderLeftWidth: px(4),
    borderLeftColor: colors.transparent,
  },
  chunkFocused: {
    borderLeftColor: colors.violet,
  },
  chunkText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

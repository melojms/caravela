import React, {memo} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

import {colors, px, radius, spacing, typography} from '../theme';
import {StarIcon, TomatoIcon} from './detailsIcons';
import {DetailsInfoItem, InfoRowEntry} from './types';

export type DetailsHeaderProps = {
  title: string;
  posterUri?: string;
  /** Background shown while there is no poster (or it is still loading). */
  placeholderColor?: string;
  infoRow: InfoRowEntry[];
  /** Joined with " / ", like androidtv's genre row. */
  genres?: string[];
  overview?: string;
  /** Label/value pairs under the overview; androidtv shows up to three. */
  infoItems: DetailsInfoItem[];
  testID?: string;
};

/** androidtv's critic rating turns fresh at 60%. */
const CRITIC_FRESH = 60;
const MAX_INFO_ITEMS = 3;
// androidtv's info row icons: 18 dp.
const INFO_ICON_SIZE = px(36);

const InfoRowItem = ({
  entry,
  testID,
}: {
  entry: InfoRowEntry;
  testID: string;
}) => {
  switch (entry.kind) {
    case 'communityRating': {
      const text = entry.value.toFixed(1);
      return (
        <View
          testID={testID}
          accessibilityLabel={`Community rating ${text}`}
          style={styles.infoItem}>
          <StarIcon size={INFO_ICON_SIZE} testID={`${testID}-star`} />
          <Text style={styles.infoText}>{text}</Text>
        </View>
      );
    }
    case 'criticRating': {
      // Compare the shown (rounded) value, so 59.6 doesn't read "60%" rotten.
      const percent = Math.round(entry.value);
      const fresh = percent >= CRITIC_FRESH;
      const text = `${percent}%`;
      return (
        <View
          testID={testID}
          accessibilityLabel={`Critic rating ${text}`}
          style={styles.infoItem}>
          <TomatoIcon
            fresh={fresh}
            size={INFO_ICON_SIZE}
            testID={`${testID}-${fresh ? 'fresh' : 'rotten'}`}
          />
          <Text style={styles.infoText}>{text}</Text>
        </View>
      );
    }
    case 'badge':
      return (
        <View testID={testID} style={styles.badge}>
          <Text style={styles.badgeText}>{entry.text}</Text>
        </View>
      );
    case 'text':
      return (
        <Text testID={testID} style={styles.infoText}>
          {entry.text}
        </Text>
      );
  }
};

/**
 * The top of the details screen, after androidtv's DetailRowView: the poster,
 * then the title, info row, genres, overview and up to three label/value pairs.
 * Transparent, so it sits over the blurred Backdrop; text has a shadow to stay
 * readable over bright artwork. Presentational: the caller passes the data.
 */
export const DetailsHeader = memo(
  ({
    title,
    posterUri,
    placeholderColor = colors.surfaceRaised,
    infoRow,
    genres,
    overview,
    infoItems,
    testID = 'details-header',
  }: DetailsHeaderProps) => {
    const genreText = genres?.filter(Boolean).join(' / ');
    const items = infoItems.slice(0, MAX_INFO_ITEMS);

    return (
      <View testID={testID} style={styles.header}>
        <View
          testID={`${testID}-poster-frame`}
          style={[styles.poster, {backgroundColor: placeholderColor}]}>
          {posterUri ? (
            <Image
              testID={`${testID}-poster`}
              source={{uri: posterUri}}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <Text
              testID={`${testID}-poster-placeholder`}
              style={styles.placeholderText}
              numberOfLines={3}>
              {title}
            </Text>
          )}
        </View>

        <View testID={`${testID}-main`} style={styles.main}>
          <Text
            testID={`${testID}-title`}
            style={[styles.title, styles.shadow]}
            numberOfLines={2}>
            {title}
          </Text>
          {infoRow.length > 0 ? (
            <View testID={`${testID}-info-row`} style={styles.infoRow}>
              {infoRow.map((entry, index) => (
                <InfoRowItem
                  // Entries have no id and the row is rebuilt as a whole.
                  key={index}
                  entry={entry}
                  testID={`${testID}-info-${index}`}
                />
              ))}
            </View>
          ) : null}
          {genreText ? (
            <Text
              testID={`${testID}-genres`}
              style={[styles.genres, styles.shadow]}
              numberOfLines={1}>
              {genreText}
            </Text>
          ) : null}
          {overview ? (
            <Text
              testID={`${testID}-overview`}
              style={[styles.overview, styles.shadow]}
              numberOfLines={4}>
              {overview}
            </Text>
          ) : null}
          {items.length > 0 ? (
            <View testID={`${testID}-info-items`} style={styles.infoItems}>
              {items.map((item, index) => (
                <View
                  key={index}
                  testID={`${testID}-info-item-${index}`}
                  style={styles.infoPair}>
                  <Text
                    style={[styles.infoLabel, styles.shadow]}
                    numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text
                    style={[styles.infoValue, styles.shadow]}
                    numberOfLines={2}>
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    );
  },
);

const textShadow = {
  textShadowColor: 'rgba(0, 0, 0, 0.8)',
  textShadowOffset: {width: 0, height: px(2)},
  textShadowRadius: px(8),
};

// Sizes from androidtv's view_row_details / InfoRowItem, in dp (1 androidtv
// dp = px(2)).
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xl,
    backgroundColor: colors.transparent,
  },
  // 2:3, like the poster cards.
  poster: {
    width: px(300),
    height: px(450),
    borderRadius: radius.md,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    ...typography.heading,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  // Gaps instead of margins, so a missing section leaves no hole.
  main: {
    flex: 1,
    gap: spacing.sm,
  },
  // Keeps text readable over a bright backdrop.
  shadow: textShadow,
  title: {
    ...typography.title,
    color: colors.text,
  },
  // 8 dp between entries.
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: px(16),
    minHeight: px(40),
  },
  // 3 dp between the icon and its text.
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(6),
  },
  // 16 sp, medium weight.
  infoText: {
    fontSize: px(32),
    lineHeight: px(40),
    fontWeight: '500',
    color: colors.text,
    ...textShadow,
  },
  // InfoRowColors.Default: translucent white, black text, 3 dp corners.
  badge: {
    paddingHorizontal: px(10),
    borderRadius: px(6),
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  // 10 sp, semi-bold.
  badgeText: {
    fontSize: px(20),
    lineHeight: px(32),
    fontWeight: '600',
    color: '#000000',
  },
  genres: {
    ...typography.body,
    color: colors.text,
  },
  overview: {
    ...typography.body,
    color: colors.text,
  },
  infoItems: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.xs,
  },
  infoPair: {
    flexShrink: 1,
  },
  // 14 sp, all caps; the value at 60%.
  infoLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'uppercase',
  },
  infoValue: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

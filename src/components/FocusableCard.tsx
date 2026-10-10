import React, {memo, ReactNode, useCallback, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, focus, layout, radius, spacing, typography} from '../theme';

export type CardVariant = 'poster' | 'landscape';

export type FocusableCardProps = {
  title: string;
  subtitle?: string;
  imageUri?: string;
  /** Background shown while there is no image (or it is still loading). */
  placeholderColor?: string;
  variant?: CardVariant;
  /** Slot rendered along the bottom edge of the image, e.g. <CardProgressBar />. */
  progressBar?: ReactNode;
  /** Slot rendered in the top-right corner of the image, e.g. <PlayedBadge />. */
  badge?: ReactNode;
  onPress?: () => void;
  onFocus?: () => void;
  hasTVPreferredFocus?: boolean;
  testID?: string;
};

export const cardSize = (variant: CardVariant) =>
  variant === 'poster' ? layout.posterCard : layout.landscapeCard;

/** Total height a card occupies, image plus the title/subtitle block. */
export const cardOuterHeight = (variant: CardVariant) =>
  cardSize(variant).height + layout.cardTextHeight;

export const FocusableCard = memo(
  ({
    title,
    subtitle,
    imageUri,
    placeholderColor = colors.surfaceRaised,
    variant = 'poster',
    progressBar,
    badge,
    onPress,
    onFocus,
    hasTVPreferredFocus,
    testID,
  }: FocusableCardProps) => {
    const [focused, setFocused] = useState(false);
    const size = cardSize(variant);

    const handleFocus = useCallback(() => {
      setFocused(true);
      onFocus?.();
    }, [onFocus]);
    const handleBlur = useCallback(() => setFocused(false), []);

    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{width: size.width}}>
        <View
          testID={testID ? `${testID}-frame` : undefined}
          style={[
            styles.frame,
            size,
            {backgroundColor: placeholderColor},
            focused && styles.frameFocused,
          ]}>
          {imageUri ? (
            <Image
              source={{uri: imageUri}}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.placeholderText} numberOfLines={3}>
              {title}
            </Text>
          )}
          {badge ? <View style={styles.badgeSlot}>{badge}</View> : null}
          {progressBar ? (
            <View style={styles.progressSlot}>{progressBar}</View>
          ) : null}
        </View>
        <Text
          style={[styles.title, focused && styles.titleFocused]}
          numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </Pressable>
    );
  },
);

export const CardProgressBar = ({value}: {value: number}) => {
  const clamped = Math.min(Math.max(value, 0), 1);
  return (
    <View style={styles.progressTrack} testID="card-progress">
      <View style={[styles.progressFill, {width: `${clamped * 100}%`}]} />
    </View>
  );
};

export const PlayedBadge = () => (
  <View style={styles.playedBadge} testID="card-played">
    <Text style={styles.playedText}>✓</Text>
  </View>
);

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    borderWidth: focus.borderWidth,
    borderColor: colors.transparent,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameFocused: {
    borderColor: colors.focus,
    transform: [{scale: focus.scale}],
  },
  placeholderText: {
    ...typography.heading,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  badgeSlot: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
  progressSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  progressTrack: {
    height: layout.progressHeight,
    backgroundColor: 'rgba(10, 22, 40, 0.7)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.violetLight,
  },
  playedBadge: {
    width: spacing.xl,
    height: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playedText: {
    ...typography.label,
    color: colors.background,
  },
  title: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  titleFocused: {
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

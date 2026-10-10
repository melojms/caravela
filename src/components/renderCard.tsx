import React from 'react';

import {
  CardProgressBar,
  CardVariant,
  FocusableCard,
  PlayedBadge,
} from './FocusableCard';
import {CardItem} from './types';

type RenderCardOptions = {
  item: CardItem;
  variant: CardVariant;
  onPress?: (item: CardItem) => void;
  onFocus?: (item: CardItem) => void;
  hasTVPreferredFocus?: boolean;
  testID?: string;
};

/** Maps a CardItem onto a FocusableCard, filling the progress and badge slots. */
export const renderCard = ({
  item,
  variant,
  onPress,
  onFocus,
  hasTVPreferredFocus,
  testID,
}: RenderCardOptions) => (
  <FocusableCard
    testID={testID}
    title={item.title}
    subtitle={item.subtitle}
    imageUri={item.imageUri}
    placeholderColor={item.placeholderColor}
    variant={variant}
    hasTVPreferredFocus={hasTVPreferredFocus}
    progressBar={
      item.progress ? <CardProgressBar value={item.progress} /> : undefined
    }
    badge={item.played ? <PlayedBadge /> : undefined}
    onPress={onPress ? () => onPress(item) : undefined}
    onFocus={onFocus ? () => onFocus(item) : undefined}
  />
);

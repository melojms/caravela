import {uses24HourClock} from '@amazon-devices/react-native-localize';
import React, {memo} from 'react';
import {StyleSheet, Text} from 'react-native';

import {colors, px} from '../theme';
import {useMinuteClock} from './useMinuteClock';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * androidtv's toolbar clock: `HH:mm` on a 24 h device, `h:mm` (no AM/PM) on
 * a 12 h one.
 */
export const formatClock = (date: Date, use24Hour: boolean): string => {
  const hours = date.getHours();
  const minutes = pad(date.getMinutes());
  if (use24Hour) {
    return `${pad(hours)}:${minutes}`;
  }
  return `${hours % 12 || 12}:${minutes}`;
};

export type ToolbarClockProps = {
  testID?: string;
};

/** The current time, updated on each minute boundary. Not focusable. */
export const ToolbarClock = memo(({testID}: ToolbarClockProps) => {
  // The setting is read on every tick, so a change shows within a minute.
  const time = formatClock(useMinuteClock(), uses24HourClock());

  return (
    <Text testID={testID} style={styles.clock} numberOfLines={1}>
      {time}
    </Text>
  );
});

const styles = StyleSheet.create({
  // androidtv: 20 sp, white.
  clock: {
    fontSize: px(40),
    lineHeight: px(48),
    color: colors.text,
  },
});

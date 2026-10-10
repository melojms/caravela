import {uses24HourClock} from '@amazon-devices/react-native-localize';
import React, {memo, useEffect, useState} from 'react';
import {StyleSheet, Text} from 'react-native';

import {colors, px} from '../theme';

const MINUTE_MS = 60_000;

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

// Read on every tick, so a change to the device setting shows within a minute.
const now = () => formatClock(new Date(), uses24HourClock());

export type ToolbarClockProps = {
  testID?: string;
};

/** The current time, updated on each minute boundary. Not focusable. */
export const ToolbarClock = memo(({testID}: ToolbarClockProps) => {
  const [time, setTime] = useState(now);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // Wait until the next whole minute rather than polling every second.
      timer = setTimeout(() => {
        setTime(now());
        schedule();
      }, MINUTE_MS - (Date.now() % MINUTE_MS));
    };
    setTime(now());
    schedule();
    return () => clearTimeout(timer);
  }, []);

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

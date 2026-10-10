import 'react-native';
import {act, render} from '@testing-library/react-native';
import {uses24HourClock} from '@amazon-devices/react-native-localize';
import * as React from 'react';

import {ToolbarClock, formatClock} from '../src/components/ToolbarClock';

// test/setup.tsx mocks the device setting.
const mockUses24HourClock = jest.mocked(uses24HourClock);

// Local time, so the expectations don't depend on the machine's timezone.
const at = (h: number, m: number, s = 0, ms = 0) =>
  new Date(2026, 9, 10, h, m, s, ms);

describe('formatClock', () => {
  it.each([
    [at(0, 0), '00:00', '12:00'],
    [at(9, 5), '09:05', '9:05'],
    [at(12, 30), '12:30', '12:30'],
    [at(23, 59), '23:59', '11:59'],
  ])('formats %s', (date, h24, h12) => {
    expect(formatClock(date, true)).toBe(h24);
    expect(formatClock(date, false)).toBe(h12);
  });
});

describe('ToolbarClock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUses24HourClock.mockReturnValue(true);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the time and ticks at the next minute boundary', () => {
    jest.setSystemTime(at(14, 7, 45));
    const screen = render(<ToolbarClock testID="clock" />);
    expect(screen.getByTestId('clock')).toHaveTextContent('14:07');

    // Nothing changes before the minute ends...
    act(() => jest.advanceTimersByTime(14_999));
    expect(screen.getByTestId('clock')).toHaveTextContent('14:07');
    // ...and the next tick lands exactly on it.
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByTestId('clock')).toHaveTextContent('14:08');
    act(() => jest.advanceTimersByTime(60_000));
    expect(screen.getByTestId('clock')).toHaveTextContent('14:09');
  });

  it('keeps a single pending timer instead of polling', () => {
    jest.setSystemTime(at(14, 7, 45));
    render(<ToolbarClock />);
    expect(jest.getTimerCount()).toBe(1);
    act(() => jest.advanceTimersByTime(15_000));
    expect(jest.getTimerCount()).toBe(1);
  });

  it('rolls over at midnight', () => {
    jest.setSystemTime(at(23, 59, 30));
    const screen = render(<ToolbarClock testID="clock" />);
    expect(screen.getByTestId('clock')).toHaveTextContent('23:59');
    act(() => jest.advanceTimersByTime(30_000));
    expect(screen.getByTestId('clock')).toHaveTextContent('00:00');
  });

  it('uses a 12 h clock when the device does', () => {
    mockUses24HourClock.mockReturnValue(false);
    jest.setSystemTime(at(15, 4));
    const screen = render(<ToolbarClock testID="clock" />);
    expect(screen.getByTestId('clock')).toHaveTextContent('3:04');
  });

  it('follows a device setting change on the next tick', () => {
    jest.setSystemTime(at(15, 4, 50));
    const screen = render(<ToolbarClock testID="clock" />);
    expect(screen.getByTestId('clock')).toHaveTextContent('15:04');
    mockUses24HourClock.mockReturnValue(false);
    act(() => jest.advanceTimersByTime(10_000));
    expect(screen.getByTestId('clock')).toHaveTextContent('3:05');
  });

  it('clears its timer on unmount', () => {
    jest.setSystemTime(at(14, 7, 45));
    const screen = render(<ToolbarClock />);
    screen.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});

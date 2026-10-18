import {NavigationContext} from '@amazon-devices/react-navigation__native';
import {act, renderHook} from '@testing-library/react-native';
import React from 'react';
import {AppState, AppStateStatus} from 'react-native';

import {useMinuteClock} from '../src/components/useMinuteClock';

// Local time, so the expectations don't depend on the machine's timezone.
const at = (h: number, m: number, s = 0) => new Date(2026, 9, 10, h, m, s);

type Listener = (state: AppStateStatus) => void;
let appListeners: Set<Listener>;
const changeTo = (state: AppStateStatus) =>
  act(() => appListeners.forEach((listener) => listener(state)));

/** A screen's navigation, with its focus and blur events. */
const fakeNavigation = (focused: boolean) => {
  const listeners = new Map<string, Set<() => void>>();
  const navigation = {
    isFocused: jest.fn(() => focused),
    addListener: jest.fn((type: string, listener: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
      return () => set.delete(listener);
    }),
    emit: (type: 'focus' | 'blur') => {
      focused = type === 'focus';
      act(() => listeners.get(type)?.forEach((listener) => listener()));
    },
  };
  return navigation;
};

const minute = (date: Date) => [date.getHours(), date.getMinutes()];

beforeEach(() => {
  jest.useFakeTimers();
  appListeners = new Set();
  jest.mocked(AppState.addEventListener).mockImplementation((_, listener) => {
    appListeners.add(listener as Listener);
    return {remove: () => appListeners.delete(listener as Listener)} as never;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useMinuteClock', () => {
  it('ticks on each minute boundary', () => {
    jest.setSystemTime(at(13, 45, 50));
    const {result} = renderHook(() => useMinuteClock());
    expect(minute(result.current)).toEqual([13, 45]);

    act(() => jest.advanceTimersByTime(10_000));
    expect(minute(result.current)).toEqual([13, 46]);
    act(() => jest.advanceTimersByTime(60_000));
    expect(minute(result.current)).toEqual([13, 47]);
  });

  it('catches up at once on `active` (timers stop in the background)', () => {
    jest.setSystemTime(at(13, 45, 10));
    const {result} = renderHook(() => useMinuteClock());
    changeTo('background');
    // JS was suspended: the clock moved on, no timer fired.
    jest.setSystemTime(at(13, 49, 30));
    changeTo('active');
    expect(minute(result.current)).toEqual([13, 49]);
  });

  it("doesn't tick while its screen isn't focused, and catches up on focus", () => {
    jest.setSystemTime(at(13, 45, 10));
    const navigation = fakeNavigation(true);
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <NavigationContext.Provider value={navigation as never}>
        {children}
      </NavigationContext.Provider>
    );
    const {result} = renderHook(() => useMinuteClock(), {wrapper});

    navigation.emit('blur');
    expect(jest.getTimerCount()).toBe(0);
    jest.setSystemTime(at(13, 52, 0));
    navigation.emit('focus');
    expect(minute(result.current)).toEqual([13, 52]);
    expect(jest.getTimerCount()).toBe(1);
  });

  it('stops on unmount', () => {
    const {unmount} = renderHook(() => useMinuteClock());
    unmount();
    expect(jest.getTimerCount()).toBe(0);
    expect(appListeners.size).toBe(0);
  });
});

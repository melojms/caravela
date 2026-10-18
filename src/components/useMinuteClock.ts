import {NavigationContext} from '@amazon-devices/react-navigation__native';
import {useContext, useEffect, useState} from 'react';
import {AppState} from 'react-native';

const MINUTE_MS = 60_000;

/**
 * The current time, updated on each minute boundary, and at once when the
 * app comes back to the foreground (JS timers stop in the background). Inside
 * a screen it doesn't tick while the screen isn't focused (e.g. under the
 * player) and catches up when it is again.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!navigation) {
      return;
    }
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  useEffect(() => {
    if (!focused) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      setNow(new Date());
      // Wait until the next whole minute rather than polling every second.
      timer = setTimeout(refresh, MINUTE_MS - (Date.now() % MINUTE_MS));
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [focused]);

  return now;
}

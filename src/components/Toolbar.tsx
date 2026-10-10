import {Path, Svg} from '@amazon-devices/react-native-svg';
import React, {
  ReactNode,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, focus, px, radius} from '../theme';
import {ToolbarClock} from './ToolbarClock';

export type ToolbarProps = {
  active: 'home' | 'search' | undefined;
  user: {name: string; imageUri?: string};
  onUserPress: () => void;
  onHomePress: () => void;
  onSearchPress: () => void;
  onSettingsPress: () => void;
  /** True when focus enters the toolbar, false when it leaves. */
  onFocusChange?: (focused: boolean) => void;
  testID?: string;
};

// Sizes from androidtv's Toolbar / Button / IconButton, in dp (same scale as
// ours, so 1 androidtv dp = px(2)).
const ICON_SIZE = px(48); // 24 dp
const ICON_PADDING = px(20); // 10 dp
/** Round buttons: the icon, its padding and our focus ring. */
const ROUND_SIZE = ICON_SIZE + 2 * ICON_PADDING + 2 * focus.borderWidth;

// androidtv's ic_settings, 24x24 viewport.
const SETTINGS_PATH =
  'm10.4,4c-0.1943,0 -0.3653,0.1495 -0.3995,0.3438l-0.2969,2.1138c-0.48,0.2057 -0.9368,0.4679 -1.3482,0.7879l-1.9888,-0.7991c-0.1829,-0.0686 -0.3882,-0.0018 -0.4911,0.1696l-1.6004,2.7679c-0.1029,0.1714 -0.0571,0.3877 0.0915,0.5134l1.692,1.3259c-0.0343,0.2514 -0.058,0.5139 -0.058,0.7768s0.0237,0.5251 0.058,0.7879l-1.692,1.3259c-0.1486,0.1257 -0.1944,0.3442 -0.0915,0.5156l1.6004,2.7656c0.1029,0.1714 0.3082,0.2382 0.4911,0.1696l1.9888,-0.7991c0.4114,0.32 0.8568,0.5822 1.3482,0.7879l0.2969,2.1161c0.0343,0.1829 0.2053,0.3304 0.3995,0.3304h3.2009c0.1943,0 0.3653,-0.1495 0.3995,-0.3438l0.2969,-2.1138c0.48,-0.2057 0.9368,-0.4679 1.3482,-0.7879l1.9888,0.7991c0.1829,0.0686 0.3882,0.0018 0.4911,-0.1696l1.6004,-2.7679c0.1029,-0.1714 0.0571,-0.3877 -0.0915,-0.5134l-1.692,-1.3259c0.0343,-0.2514 0.058,-0.5139 0.058,-0.7768s-0.0237,-0.5251 -0.058,-0.7879l1.692,-1.3259c0.1486,-0.1257 0.1944,-0.3442 0.0915,-0.5156l-1.6004,-2.7656c-0.1029,-0.1714 -0.3082,-0.2382 -0.4911,-0.1696l-1.9888,0.7991c-0.4114,-0.32 -0.8568,-0.5822 -1.3482,-0.7879l-0.2969,-2.1161c-0.0343,-0.1829 -0.2053,-0.3304 -0.3995,-0.3304zM12.0004,9.7143c1.2571,0 2.2857,1.0286 2.2857,2.2857s-1.0286,2.2857 -2.2857,2.2857c-1.2571,0 -2.2857,-1.0286 -2.2857,-2.2857s1.0286,-2.2857 2.2857,-2.2857z';

type ToolbarButtonProps = {
  label: string;
  onPress: () => void;
  onFocus: () => void;
  onBlur: () => void;
  active?: boolean;
  round?: boolean;
  /** Drops the round button's padding so an image fills it up to the ring. */
  bleed?: boolean;
  testID?: string;
  children: (highlighted: boolean) => ReactNode;
};

/**
 * A pill-shaped toolbar button. Same states as FocusableButton (active:
 * violet outline; focused: focus ring, violet fill, scale), but transparent at
 * rest like androidtv's toolbar, and it reports blur so the toolbar can tell
 * when focus leaves it.
 */
const ToolbarButton = memo(
  ({
    label,
    onPress,
    onFocus,
    onBlur,
    active = false,
    round = false,
    bleed = false,
    testID,
    children,
  }: ToolbarButtonProps) => {
    const [focused, setFocused] = useState(false);

    const handleFocus = useCallback(() => {
      setFocused(true);
      onFocus();
    }, [onFocus]);
    const handleBlur = useCallback(() => {
      setFocused(false);
      onBlur();
    }, [onBlur]);

    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{selected: active}}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.button,
          round ? styles.round : styles.text,
          bleed && styles.bleed,
          active && !focused && styles.active,
          focused && styles.focused,
        ]}>
        {children(focused || active)}
      </Pressable>
    );
  },
);

/**
 * Up to two initials, from the first two words of the name. Same rule as the
 * user picker's `initials`; kept here so a component doesn't import a screen.
 */
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase() || '?';

type AvatarProps = {name: string; imageUri?: string};

/** The user's picture, or their initials with no picture or on a load error. */
const useAvatarImage = (imageUri?: string) => {
  const [failedUri, setFailedUri] = useState<string>();
  const showImage = Boolean(imageUri) && failedUri !== imageUri;
  const onError = useCallback(() => setFailedUri(imageUri), [imageUri]);
  return {showImage, onError};
};

const Avatar = ({
  name,
  imageUri,
  showImage,
  onError,
  testID,
}: AvatarProps & {
  showImage: boolean;
  onError: () => void;
  testID?: string;
}) =>
  showImage ? (
    <Image
      testID={`${testID}-image`}
      source={{uri: imageUri}}
      style={styles.avatarImage}
      resizeMode="cover"
      onError={onError}
    />
  ) : (
    <View style={styles.avatarInitials}>
      <Text testID={`${testID}-initials`} style={styles.initialsText}>
        {initials(name)}
      </Text>
    </View>
  );

/**
 * The top bar on Home and Search, after androidtv's MainToolbar: the user on
 * the left, Home and Search centred, Settings and the clock on the right.
 * Presentational: the caller decides what each button does.
 */
export const Toolbar = memo(
  ({
    active,
    user,
    onUserPress,
    onHomePress,
    onSearchPress,
    onSettingsPress,
    onFocusChange,
    testID = 'toolbar',
  }: ToolbarProps) => {
    const {showImage, onError} = useAvatarImage(user.imageUri);

    // Moving between toolbar buttons blurs one before focusing the next.
    // Report "left" only if no button takes focus by the next tick.
    const focusedRef = useRef(false);
    const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const onFocusChangeRef = useRef(onFocusChange);
    onFocusChangeRef.current = onFocusChange;

    const cancelBlur = () => {
      if (blurTimer.current !== undefined) {
        clearTimeout(blurTimer.current);
        blurTimer.current = undefined;
      }
    };

    const handleFocus = useCallback(() => {
      cancelBlur();
      if (!focusedRef.current) {
        focusedRef.current = true;
        onFocusChangeRef.current?.(true);
      }
    }, []);
    const handleBlur = useCallback(() => {
      cancelBlur();
      blurTimer.current = setTimeout(() => {
        if (focusedRef.current) {
          focusedRef.current = false;
          onFocusChangeRef.current?.(false);
        }
      }, 0);
    }, []);
    useEffect(() => cancelBlur, []);

    const focusProps = {onFocus: handleFocus, onBlur: handleBlur};

    return (
      <View testID={testID} style={styles.toolbar}>
        <View testID={`${testID}-start`} style={[styles.side, styles.start]}>
          <ToolbarButton
            testID={`${testID}-user`}
            label="Switch user"
            onPress={onUserPress}
            round
            bleed={showImage}
            {...focusProps}>
            {() => (
              <Avatar
                name={user.name}
                imageUri={user.imageUri}
                showImage={showImage}
                onError={onError}
                testID={`${testID}-user`}
              />
            )}
          </ToolbarButton>
        </View>

        <View testID={`${testID}-center`} style={styles.group}>
          <ToolbarButton
            testID={`${testID}-home`}
            label="Home"
            onPress={onHomePress}
            active={active === 'home'}
            {...focusProps}>
            {(highlighted) => (
              <Text
                style={[styles.label, highlighted && styles.highlight]}
                numberOfLines={1}>
                Home
              </Text>
            )}
          </ToolbarButton>
          <ToolbarButton
            testID={`${testID}-search`}
            label="Search"
            onPress={onSearchPress}
            active={active === 'search'}
            {...focusProps}>
            {(highlighted) => (
              <Text
                style={[styles.label, highlighted && styles.highlight]}
                numberOfLines={1}>
                Search
              </Text>
            )}
          </ToolbarButton>
        </View>

        <View testID={`${testID}-end`} style={[styles.side, styles.end]}>
          <ToolbarButton
            testID={`${testID}-settings`}
            label="Settings"
            onPress={onSettingsPress}
            round
            {...focusProps}>
            {(highlighted) => (
              <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24">
                <Path
                  d={SETTINGS_PATH}
                  fill={highlighted ? colors.text : colors.textMuted}
                />
              </Svg>
            )}
          </ToolbarButton>
          <ToolbarClock testID={`${testID}-clock`} />
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  // androidtv: 95 dp tall including its 48 x 27 dp overscan padding.
  toolbar: {
    width: '100%',
    height: px(190),
    paddingHorizontal: px(96),
    paddingVertical: px(54),
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.transparent,
  },
  // Equal-width sides keep the centre group centred, like androidtv's
  // ToolbarLayout.
  side: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(16),
  },
  start: {
    justifyContent: 'flex-start',
  },
  end: {
    justifyContent: 'flex-end',
  },
  // androidtv's ToolbarButtons: 8 dp apart.
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(16),
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    // Always drawn, so the active outline and focus ring don't shift layout.
    borderWidth: focus.borderWidth,
    borderColor: colors.transparent,
    backgroundColor: colors.transparent,
    overflow: 'hidden',
  },
  // androidtv's Button: min 58 x 40 dp, 16 x 10 dp padding.
  text: {
    minWidth: px(116),
    minHeight: px(80),
    paddingHorizontal: px(32) - focus.borderWidth,
    paddingVertical: px(20) - focus.borderWidth,
  },
  // androidtv's IconButton: 24 dp icon, 10 dp padding.
  round: {
    width: ROUND_SIZE,
    height: ROUND_SIZE,
    padding: ICON_PADDING,
  },
  bleed: {
    padding: 0,
  },
  active: {
    borderColor: colors.violet,
    backgroundColor: colors.surfaceRaised,
  },
  focused: {
    borderColor: colors.focus,
    backgroundColor: colors.violet,
    transform: [{scale: focus.scale}],
  },
  // androidtv's button text: 14 sp, bold in the toolbar.
  label: {
    fontSize: px(28),
    lineHeight: px(36),
    fontWeight: '700',
    color: colors.textMuted,
  },
  highlight: {
    color: colors.text,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.pill,
  },
  avatarInitials: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: px(28),
    lineHeight: px(36),
    fontWeight: '700',
    color: colors.text,
  },
});

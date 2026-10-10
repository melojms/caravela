import React, {memo, useEffect, useRef, useState} from 'react';
import {Animated, Image, StyleSheet, View} from 'react-native';

import {colors} from '../theme';

export type BackdropProps = {
  /** Image to show behind the screen. Without one, only the app background shows. */
  uri?: string;
  testID?: string;
};

/** Cross-fade between two backdrops, in ms. */
export const BACKDROP_FADE_MS = 300;

/** Blur radius in dp; androidtv blurs its backdrop by 10 dp. */
export const BACKDROP_BLUR = 10;

/** androidtv's `background_filter` (#94101010) tint, so white text stays readable. */
export const BACKDROP_DIM = 'rgba(16, 16, 16, 0.58)';

type Layers = {previous?: string; current?: string};

/**
 * Full-screen background behind Home's content: a blurred, dimmed image that
 * fades in over the previous one. It never takes focus or touches.
 */
export const Backdrop = memo(({uri, testID = 'backdrop'}: BackdropProps) => {
  const [layers, setLayers] = useState<Layers>({current: uri});
  const fade = useRef(new Animated.Value(1)).current;
  const shown = useRef(uri);

  useEffect(() => {
    if (uri === shown.current) {
      return;
    }
    const previous = shown.current;
    shown.current = uri;
    setLayers({previous, current: uri});
    fade.setValue(0);
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: BACKDROP_FADE_MS,
      useNativeDriver: true,
    });
    animation.start(({finished}) => {
      if (finished) {
        setLayers((now) => ({current: now.current}));
      }
    });
    return () => animation.stop();
  }, [uri, fade]);

  // The new image fades in on top. When there is no new image, the old one
  // fades out instead, revealing the app background.
  const previousOpacity = layers.current
    ? 1
    : fade.interpolate({inputRange: [0, 1], outputRange: [1, 0]});

  return (
    <View
      testID={testID}
      pointerEvents="none"
      focusable={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.root}>
      {layers.previous ? (
        <BackdropImage
          uri={layers.previous}
          opacity={previousOpacity}
          testID={`${testID}-previous`}
        />
      ) : null}
      {layers.current ? (
        <BackdropImage
          uri={layers.current}
          opacity={fade}
          testID={`${testID}-image`}
        />
      ) : null}
    </View>
  );
});

const BackdropImage = ({
  uri,
  opacity,
  testID,
}: {
  uri: string;
  opacity: Animated.Value | Animated.AnimatedInterpolation<number> | number;
  testID: string;
}) => (
  <Animated.View style={[StyleSheet.absoluteFill, {opacity}]}>
    <Image
      testID={testID}
      source={{uri}}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
      blurRadius={BACKDROP_BLUR}
    />
    <View style={styles.dim} />
  </Animated.View>
);

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKDROP_DIM,
  },
});

import React, {memo} from 'react';
import {StyleSheet, Text, TextStyle, View} from 'react-native';

import type {SubtitleCue, SubtitleSpan} from '../playback/subtitles';
import {colors, px} from '../theme';

/** How subtitles look; task 14's settings will edit these. */
export type SubtitleStyle = {
  textColor: string;
  /** Box behind each line; `transparent` for none. */
  backgroundColor: string;
  /** Outline around the glyphs; `transparent` for none. */
  outlineColor: string;
  /** Font size in dp. */
  textSize: number;
  /** Gap below the lowest line, as a fraction of the view's height. */
  bottomOffset: number;
};

/**
 * androidtv's defaults: white text, no background, black outline, 24 dp text
 * (48 px on the 1080p design) and 8% from the bottom.
 */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  textColor: '#ffffff',
  backgroundColor: colors.transparent,
  outlineColor: '#000000',
  textSize: px(48),
  bottomOffset: 0.08,
};

/**
 * Vega's RN has no text stroke, and a centred `textShadow` only draws a faint
 * glow. So the outline is androidtv's stroke built from copies of the line in
 * the outline colour, drawn behind it and nudged this far (as a fraction of
 * the text size) in each of these 8 directions.
 */
const OUTLINE_WIDTH_RATIO = 0.05;
const OUTLINE_DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

const isTransparent = (color: string) =>
  color === colors.transparent || /^#[0-9a-f]{6}00$/i.test(color);

export type SubtitleViewProps = {
  /** The cues showing now (`activeCues`), in start order. */
  cues: readonly SubtitleCue[];
  style?: SubtitleStyle;
  testID?: string;
};

const spanStyle = (span: SubtitleSpan): TextStyle | undefined =>
  span.italic || span.bold || span.underline
    ? {
        fontStyle: span.italic ? 'italic' : undefined,
        fontWeight: span.bold ? '700' : undefined,
        textDecorationLine: span.underline ? 'underline' : undefined,
      }
    : undefined;

/**
 * App-drawn subtitles over the video: centred lines sitting
 * `style.bottomOffset` up from the bottom, wrapping within a max width. It
 * never takes focus or touches, and renders nothing without cues.
 */
export const SubtitleView = memo(
  ({
    cues,
    style = DEFAULT_SUBTITLE_STYLE,
    testID = 'subtitle-view',
  }: SubtitleViewProps) => {
    if (cues.length === 0) {
      return null;
    }

    const textStyle: TextStyle = {
      color: style.textColor,
      fontSize: style.textSize,
      lineHeight: Math.round(style.textSize * 1.25),
    };
    const outlineWidth = style.textSize * OUTLINE_WIDTH_RATIO;
    const outline = isTransparent(style.outlineColor)
      ? []
      : OUTLINE_DIRECTIONS.map(
          ([dx, dy]): TextStyle => ({
            color: style.outlineColor,
            left: dx * outlineWidth,
            right: -dx * outlineWidth,
            top: dy * outlineWidth,
            bottom: -dy * outlineWidth,
          }),
        );

    return (
      <View
        testID={testID}
        pointerEvents="none"
        focusable={false}
        style={styles.root}>
        <View style={[styles.lines, {bottom: `${style.bottomOffset * 100}%`}]}>
          {cues.map((cue, cueIndex) =>
            cue.lines.map((line, lineIndex) => {
              const lineTestID = `${testID}-line-${cueIndex}-${lineIndex}`;
              const spans = line.map((span, spanIndex) => (
                <Text key={spanIndex} style={spanStyle(span)}>
                  {span.text}
                </Text>
              ));
              // The copies fill the box the line sizes, so they wrap alike.
              return (
                <View
                  key={`${cueIndex}-${cue.startMs}-${lineIndex}`}
                  testID={`${lineTestID}-box`}
                  style={[
                    styles.line,
                    {backgroundColor: style.backgroundColor},
                  ]}>
                  {outline.map((offset, outlineIndex) => (
                    <Text
                      key={outlineIndex}
                      testID={`${lineTestID}-outline-${outlineIndex}`}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={[styles.text, textStyle, styles.outline, offset]}>
                      {spans}
                    </Text>
                  ))}
                  <Text testID={lineTestID} style={[styles.text, textStyle]}>
                    {spans}
                  </Text>
                </View>
              );
            }),
          )}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  lines: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  line: {
    maxWidth: '80%',
  },
  text: {
    textAlign: 'center',
    fontWeight: '400',
    paddingHorizontal: px(8),
  },
  outline: {
    position: 'absolute',
  },
});

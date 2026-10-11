import 'react-native';
import {render} from '@testing-library/react-native';
import * as React from 'react';
import type {ReactTestInstance} from 'react-test-renderer';

import {
  DEFAULT_SUBTITLE_STYLE,
  SubtitleStyle,
  SubtitleView,
} from '../../src/components/SubtitleView';
import type {SubtitleCue} from '../../src/playback/subtitles';
import {px} from '../../src/theme';

// The Vega Jest preset's StyleSheet.flatten mock returns arrays untouched.
const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const CUES: SubtitleCue[] = [
  {
    startMs: 1000,
    endMs: 3000,
    lines: [
      [{text: 'Hello '}, {text: 'there', italic: true}],
      [{text: 'second line'}],
    ],
  },
  {
    startMs: 2000,
    endMs: 4000,
    lines: [
      [
        {text: 'bold', bold: true},
        {text: ' '},
        {text: 'under', underline: true},
      ],
    ],
  },
];

describe('SubtitleView', () => {
  it('renders nothing without cues', () => {
    const screen = render(<SubtitleView cues={[]} />);
    expect(screen.queryByTestId('subtitle-view')).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });

  it('renders each line of each cue, in order', () => {
    const screen = render(<SubtitleView cues={CUES} />);
    expect(screen.getByTestId('subtitle-view-line-0-0')).toHaveTextContent(
      'Hello there',
    );
    expect(screen.getByTestId('subtitle-view-line-0-1')).toHaveTextContent(
      'second line',
    );
    expect(screen.getByTestId('subtitle-view-line-1-0')).toHaveTextContent(
      'bold under',
    );
  });

  it('never takes focus or touches', () => {
    const view = render(<SubtitleView cues={CUES} />).getByTestId(
      'subtitle-view',
    );
    expect(view.props.pointerEvents).toBe('none');
    expect(view.props.focusable).toBe(false);
  });

  it('styles italic, bold and underlined spans', () => {
    const screen = render(<SubtitleView cues={CUES} />);
    expect(flatStyle(screen.getByText('there').props.style)).toMatchObject({
      fontStyle: 'italic',
    });
    expect(flatStyle(screen.getByText('bold').props.style)).toMatchObject({
      fontWeight: '700',
    });
    expect(flatStyle(screen.getByText('under').props.style)).toMatchObject({
      textDecorationLine: 'underline',
    });
    const plain = flatStyle(screen.getByText('Hello').props.style);
    expect(plain.fontStyle).toBeUndefined();
    expect(plain.fontWeight).toBeUndefined();
    expect(plain.textDecorationLine).toBeUndefined();
  });

  it("uses androidtv's defaults", () => {
    expect(DEFAULT_SUBTITLE_STYLE).toEqual({
      textColor: '#ffffff',
      backgroundColor: 'transparent',
      outlineColor: '#000000',
      textSize: px(48),
      bottomOffset: 0.08,
    });

    const screen = render(<SubtitleView cues={CUES} />);
    const line = flatStyle(
      screen.getByTestId('subtitle-view-line-0-0').props.style,
    );
    expect(line).toMatchObject({
      color: '#ffffff',
      backgroundColor: 'transparent',
      fontSize: px(48),
      textAlign: 'center',
      textShadowColor: '#000000',
      textShadowOffset: {width: 0, height: 0},
    });
    expect(line.textShadowRadius).toBeGreaterThan(0);
    expect(line.maxWidth).toBe('80%');
    const box = screen.getByTestId('subtitle-view')
      .children[0] as ReactTestInstance;
    expect(flatStyle(box.props.style)).toMatchObject({bottom: '8%'});
  });

  it('applies a custom style', () => {
    const custom: SubtitleStyle = {
      textColor: '#eedc00',
      backgroundColor: '#000000',
      outlineColor: 'transparent',
      textSize: px(64),
      bottomOffset: 0.2,
    };
    const screen = render(<SubtitleView cues={CUES} style={custom} />);
    const line = flatStyle(
      screen.getByTestId('subtitle-view-line-1-0').props.style,
    );
    expect(line).toMatchObject({
      color: '#eedc00',
      backgroundColor: '#000000',
      fontSize: px(64),
    });
    // No outline when its colour is transparent.
    expect(line.textShadowColor).toBeUndefined();
    expect(line.textShadowRadius).toBeUndefined();
    const box = screen.getByTestId('subtitle-view')
      .children[0] as ReactTestInstance;
    expect(flatStyle(box.props.style)).toMatchObject({bottom: '20%'});
  });

  it('treats a zero-alpha hex outline as no outline', () => {
    const screen = render(
      <SubtitleView
        cues={CUES}
        style={{...DEFAULT_SUBTITLE_STYLE, outlineColor: '#00000000'}}
      />,
    );
    const line = flatStyle(
      screen.getByTestId('subtitle-view-line-0-0').props.style,
    );
    expect(line.textShadowColor).toBeUndefined();
  });
});

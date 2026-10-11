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

const omit = (style: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(
    Object.entries(style).filter(([key]) => !keys.includes(key)),
  );

/** The outline copies behind line `id` ("cue-line"). */
const outlines = (
  screen: ReturnType<typeof render>,
  id: string,
): ReactTestInstance[] =>
  screen.queryAllByTestId(new RegExp(`^subtitle-view-line-${id}-outline-`), {
    includeHiddenElements: true,
  });

/** The box holding line `id` and its copies. */
const lineBox = (screen: ReturnType<typeof render>, id: string) =>
  screen.getByTestId(`subtitle-view-line-${id}-box`);

/** The test IDs of the texts in line `id`'s box, in drawing order. */
const boxContents = (screen: ReturnType<typeof render>, id: string) =>
  lineBox(screen, id)
    .findAll((node) => typeof node.type === 'string' && !!node.props.testID)
    .map((node) => node.props.testID as string)
    .filter((testID) => !testID.endsWith('-box'));

/** A line's spans as text and style, to compare a copy with its line. */
const spansOf = (text: ReactTestInstance) =>
  (text.children as ReactTestInstance[]).map((span) => [
    span.props.children,
    flatStyle(span.props.style),
  ]);

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
    const line = screen.getByTestId('subtitle-view-line-0-0');
    expect(flatStyle(line.props.style)).toMatchObject({
      color: '#ffffff',
      fontSize: px(48),
      textAlign: 'center',
    });
    // No shadow: it only drew a faint glow on Vega.
    expect(flatStyle(line.props.style).textShadowColor).toBeUndefined();
    expect(flatStyle(lineBox(screen, '0-0').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      maxWidth: '80%',
    });
    const box = screen.getByTestId('subtitle-view')
      .children[0] as ReactTestInstance;
    expect(flatStyle(box.props.style)).toMatchObject({bottom: '8%'});
  });

  it('outlines each line with 8 copies in the outline colour behind it', () => {
    const screen = render(<SubtitleView cues={CUES} />);
    const line = screen.getByTestId('subtitle-view-line-0-0');
    const copies = outlines(screen, '0-0');
    expect(copies).toHaveLength(8);

    // Behind the line (drawn first), in the same box.
    expect(boxContents(screen, '0-0')).toEqual([
      ...copies.map((copy) => copy.props.testID),
      line.props.testID,
    ]);

    // Nudged one outline width in each of the 8 directions.
    const width = px(48) * 0.05;
    const offsets = copies.map((copy) => {
      const style = flatStyle(copy.props.style);
      expect(style).toMatchObject({
        position: 'absolute',
        color: '#000000',
        right: -(style.left as number),
        bottom: -(style.top as number),
      });
      return [
        Math.round((style.left as number) / width),
        Math.round((style.top as number) / width),
      ];
    });
    expect(offsets).toEqual(
      expect.arrayContaining([
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ]),
    );
    expect(new Set(offsets.map(String)).size).toBe(8);
    expect(flatStyle(copies[0].props.style).left).toBeCloseTo(-width);
  });

  it('lays out the copies exactly like the line, so they line up', () => {
    const screen = render(<SubtitleView cues={CUES} />);
    for (const id of ['0-0', '0-1', '1-0']) {
      const line = screen.getByTestId(`subtitle-view-line-${id}`);
      const lineStyle = omit(flatStyle(line.props.style), ['color']);
      for (const copy of outlines(screen, id)) {
        const copyStyle = omit(flatStyle(copy.props.style), [
          'color',
          'position',
          'left',
          'right',
          'top',
          'bottom',
        ]);
        // Same font, size, line height, alignment and padding: same wrapping.
        expect(copyStyle).toEqual(lineStyle);
        expect(spansOf(copy)).toEqual(spansOf(line));
      }
    }
  });

  it('hides the copies from the screen reader', () => {
    const screen = render(<SubtitleView cues={CUES} />);
    for (const copy of outlines(screen, '0-0')) {
      expect(copy.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(copy.props.accessibilityElementsHidden).toBe(true);
    }
    expect(screen.getAllByText('there')).toHaveLength(1);
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
    const line = screen.getByTestId('subtitle-view-line-1-0');
    expect(flatStyle(line.props.style)).toMatchObject({
      color: '#eedc00',
      fontSize: px(64),
    });
    expect(flatStyle(lineBox(screen, '1-0').props.style)).toMatchObject({
      backgroundColor: '#000000',
    });
    // No outline when its colour is transparent.
    expect(outlines(screen, '1-0')).toHaveLength(0);
    expect(boxContents(screen, '1-0')).toEqual([line.props.testID]);
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
    expect(outlines(screen, '0-0')).toHaveLength(0);
  });
});

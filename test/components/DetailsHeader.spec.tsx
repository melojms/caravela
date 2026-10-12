import 'react-native';
import {render} from '@testing-library/react-native';
import * as React from 'react';

import {
  DetailsHeader,
  DetailsHeaderProps,
} from '../../src/components/DetailsHeader';
import {STAR_COLOR} from '../../src/components/detailsIcons';
import {px} from '../../src/theme';

// The Vega Jest preset's StyleSheet.flatten mock returns arrays untouched.
const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const setup = (props: Partial<DetailsHeaderProps> = {}) =>
  render(
    <DetailsHeader
      title="Arrival"
      posterUri="https://example.test/poster.jpg"
      infoRow={[
        {kind: 'text', text: '2016'},
        {kind: 'communityRating', value: 7.94},
        {kind: 'criticRating', value: 94},
        {kind: 'badge', text: '1080p'},
      ]}
      genres={['Drama', 'Science Fiction']}
      overview="A linguist works with the military to talk to aliens."
      infoItems={[
        {label: 'Directed by', value: 'Denis Villeneuve'},
        {label: 'Written by', value: 'Eric Heisserer'},
        {label: 'Runtime', value: '1h 56m'},
      ]}
      {...props}
    />,
  );

describe('DetailsHeader', () => {
  it('renders the title, genres joined with slashes and the overview', () => {
    const screen = setup();
    expect(screen.getByTestId('details-header-title')).toHaveTextContent(
      'Arrival',
    );
    expect(screen.getByTestId('details-header-genres')).toHaveTextContent(
      'Drama / Science Fiction',
    );
    expect(screen.getByTestId('details-header-overview')).toHaveTextContent(
      'A linguist works with the military to talk to aliens.',
    );
  });

  it('renders every info row kind in order', () => {
    const screen = setup();
    expect(screen.getByTestId('details-header-info-0')).toHaveTextContent(
      '2016',
    );

    const community = screen.getByTestId('details-header-info-1');
    expect(community).toHaveTextContent('7.9');
    expect(community.props.accessibilityLabel).toBe('Community rating 7.9');
    expect(
      screen.getByTestId('details-header-info-1-star').findByProps({
        fill: STAR_COLOR,
      }),
    ).toBeTruthy();

    const critic = screen.getByTestId('details-header-info-2');
    expect(critic).toHaveTextContent('94%');
    expect(critic).toContainElement(
      screen.getByTestId('details-header-info-2-fresh'),
    );

    expect(screen.getByTestId('details-header-info-3')).toHaveTextContent(
      '1080p',
    );
  });

  it.each([
    [60, 'fresh', '60%'],
    [59.6, 'fresh', '60%'],
    [59.4, 'rotten', '59%'],
    [0, 'rotten', '0%'],
  ] as const)('shows a critic rating of %s as %s', (value, icon, text) => {
    const screen = setup({infoRow: [{kind: 'criticRating', value}]});
    expect(screen.getByTestId('details-header-info-0')).toHaveTextContent(text);
    expect(screen.getByTestId(`details-header-info-0-${icon}`)).toBeTruthy();
  });

  it('shows the community rating with one decimal', () => {
    const screen = setup({infoRow: [{kind: 'communityRating', value: 8}]});
    expect(screen.getByTestId('details-header-info-0')).toHaveTextContent(
      '8.0',
    );
  });

  it('renders the label/value pairs, at most three', () => {
    const screen = setup({
      infoItems: [
        {label: 'Directed by', value: 'Denis Villeneuve'},
        {label: 'Written by', value: 'Eric Heisserer'},
        {label: 'Runtime', value: '1h 56m'},
        {label: 'Studio', value: 'Lava Bear'},
      ],
    });
    const first = screen.getByTestId('details-header-info-item-0');
    expect(first).toHaveTextContent('Directed by', {exact: false});
    expect(first).toHaveTextContent('Denis Villeneuve', {exact: false});
    expect(screen.getByTestId('details-header-info-item-2')).toHaveTextContent(
      '1h 56m',
      {exact: false},
    );
    expect(screen.queryByText('Lava Bear')).toBeNull();
  });

  it('shows the poster when there is one', () => {
    const screen = setup();
    expect(screen.getByTestId('details-header-poster').props.source).toEqual({
      uri: 'https://example.test/poster.jpg',
    });
    expect(
      screen.queryByTestId('details-header-poster-placeholder'),
    ).toBeNull();
  });

  it('shows the placeholder colour and the title with no poster', () => {
    const screen = setup({posterUri: undefined, placeholderColor: '#123456'});
    expect(screen.queryByTestId('details-header-poster')).toBeNull();
    expect(
      screen.getByTestId('details-header-poster-placeholder'),
    ).toHaveTextContent('Arrival');
    expect(
      flatStyle(screen.getByTestId('details-header-poster-frame').props.style)
        .backgroundColor,
    ).toBe('#123456');
  });

  it('leaves out empty sections instead of rendering blanks', () => {
    const screen = setup({
      infoRow: [],
      genres: [],
      overview: undefined,
      infoItems: [],
    });
    expect(screen.getByTestId('details-header-title')).toHaveTextContent(
      'Arrival',
    );
    expect(screen.queryByTestId('details-header-info-row')).toBeNull();
    expect(screen.queryByTestId('details-header-genres')).toBeNull();
    expect(screen.queryByTestId('details-header-overview')).toBeNull();
    expect(screen.queryByTestId('details-header-info-items')).toBeNull();
  });

  it('leaves out an empty overview string and blank genres', () => {
    const screen = setup({overview: '', genres: ['']});
    expect(screen.queryByTestId('details-header-overview')).toBeNull();
    expect(screen.queryByTestId('details-header-genres')).toBeNull();
  });

  it('shows the subtitle above the title on one line', () => {
    const screen = setup({title: 'Pilot (2)', subtitle: 'Lost S1 E2'});
    const subtitle = screen.getByTestId('details-header-subtitle');
    expect(subtitle).toHaveTextContent('Lost S1 E2');
    expect(subtitle.props.numberOfLines).toBe(1);
    expect(subtitle.props.ellipsizeMode).toBe('tail');

    // Queries return matches in tree order.
    const texts = screen.getAllByTestId(/^details-header-(subtitle|title)$/);
    expect(texts.map((node) => node.props.testID)).toEqual([
      'details-header-subtitle',
      'details-header-title',
    ]);
  });

  it.each([undefined, ''])('leaves out a subtitle of %p', (subtitle) => {
    const screen = setup({subtitle});
    expect(screen.queryByTestId('details-header-subtitle')).toBeNull();
  });

  it('keeps the 2:3 poster size by default', () => {
    const screen = setup();
    const style = flatStyle(
      screen.getByTestId('details-header-poster-frame').props.style,
    );
    expect(style.width).toBe(px(300));
    expect(style.height).toBe(px(450));
  });

  it.each([
    ['poster', 450],
    ['wide', 169],
    ['square', 300],
  ] as const)('sizes a %s frame at the poster width', (posterShape, height) => {
    const screen = setup({posterShape});
    const style = flatStyle(
      screen.getByTestId('details-header-poster-frame').props.style,
    );
    expect(style.width).toBe(px(300));
    expect(style.height).toBe(px(height));
  });

  it.each(['poster', 'wide', 'square'] as const)(
    'uses the placeholder in a %s frame with no poster',
    (posterShape) => {
      const screen = setup({
        posterShape,
        posterUri: undefined,
        placeholderColor: '#123456',
      });
      expect(screen.queryByTestId('details-header-poster')).toBeNull();
      expect(
        screen.getByTestId('details-header-poster-placeholder'),
      ).toHaveTextContent('Arrival');
      expect(
        flatStyle(screen.getByTestId('details-header-poster-frame').props.style)
          .backgroundColor,
      ).toBe('#123456');
    },
  );

  it('shows the poster image in a wide frame', () => {
    const screen = setup({posterShape: 'wide'});
    expect(screen.getByTestId('details-header-poster').props.source).toEqual({
      uri: 'https://example.test/poster.jpg',
    });
  });

  it('uses the given testID', () => {
    const screen = setup({testID: 'hdr'});
    expect(screen.getByTestId('hdr-title')).toHaveTextContent('Arrival');
  });
});

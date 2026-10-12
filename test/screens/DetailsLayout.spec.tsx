import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {render, screen} from '@testing-library/react-native';
import React from 'react';
import {Text} from 'react-native';

import {createJellyfin} from '../../src/api/client';
import {useSession} from '../../src/auth/SessionContext';
import {DetailsAction} from '../../src/components/types';
import {
  DetailsLayout,
  DetailsLayoutProps,
  primaryImageUri,
} from '../../src/screens/details/DetailsLayout';
import {sessionFor} from '../auth/fakes';

jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

const api = createJellyfin('device-1').createApi(
  'https://jf.example.com',
  'token-1',
);

const action = (key: string): DetailsAction => ({
  key,
  label: key.toUpperCase(),
  icon: 'play',
  onPress: jest.fn(),
});

const header: DetailsLayoutProps['header'] = {
  title: 'The Title',
  infoRow: [],
  overview: 'An overview.',
  infoItems: [],
};

const layout = (props: Partial<DetailsLayoutProps> = {}) => (
  <DetailsLayout
    testID="details-test"
    header={header}
    actions={[action('resume'), action('play')]}
    {...props}>
    {props.children ?? <Text testID="layout-child">A row</Text>}
  </DetailsLayout>
);

const preferred = (key: string) =>
  screen.getByTestId(`details-actions-${key}`).props.hasTVPreferredFocus;

beforeEach(() => {
  const session = sessionFor();
  session.api = api;
  (useSession as jest.Mock).mockReturnValue({session});
});

describe('DetailsLayout', () => {
  it('renders the header, the actions and the rows below them', () => {
    render(layout());

    expect(screen.getByTestId('details-test')).toBeTruthy();
    expect(screen.getByTestId('details-header-title')).toHaveTextContent(
      'The Title',
    );
    expect(screen.getByText('An overview.')).toBeTruthy();
    expect(screen.getByTestId('details-actions-resume')).toBeTruthy();
    expect(screen.getByTestId('details-actions-play')).toBeTruthy();

    // Header, then the buttons, then the rows, in the scroll content.
    const json = JSON.stringify(screen.toJSON());
    const headerAt = json.indexOf('"details-header"');
    const actionsAt = json.indexOf('"details-actions"');
    const rowAt = json.indexOf('"layout-child"');
    expect(headerAt).toBeGreaterThan(-1);
    expect(actionsAt).toBeGreaterThan(headerAt);
    expect(rowAt).toBeGreaterThan(actionsAt);
  });

  it('shows the backdrop', () => {
    render(layout({backdropUri: 'https://jf.example.com/backdrop'}));

    expect(
      screen.getByTestId('backdrop-image', {includeHiddenElements: true}).props
        .source.uri,
    ).toBe('https://jf.example.com/backdrop');
  });

  it('focuses the first action on open', () => {
    render(layout());

    expect(preferred('resume')).toBe(true);
    expect(preferred('play')).toBe(false);
  });

  it("doesn't focus the new first action when the first one goes away", () => {
    render(layout());
    screen.rerender(layout({actions: [action('play')]}));

    expect(screen.queryByTestId('details-actions-resume')).toBeNull();
    expect(preferred('play')).toBe(false);
  });

  it('keeps focusing the first action when the same one stays first', () => {
    render(layout());
    screen.rerender(layout({actions: [action('resume')]}));

    expect(preferred('resume')).toBe(true);
  });

  it('renders no action row without actions, but still the rows', () => {
    render(layout({actions: []}));

    expect(screen.queryByTestId('details-actions')).toBeNull();
    expect(screen.getByTestId('details-header-title')).toHaveTextContent(
      'The Title',
    );
    expect(screen.getByTestId('layout-child')).toBeTruthy();
  });

  it("doesn't focus actions that appear after opening with none", () => {
    render(layout({actions: []}));
    screen.rerender(layout({actions: [action('play')]}));

    expect(preferred('play')).toBe(false);
  });
});

describe('primaryImageUri', () => {
  it('builds the Primary image URL with its tag and size', () => {
    const item: BaseItemDto = {Id: 'm1', ImageTags: {Primary: 'tag-1'}};

    expect(primaryImageUri(item, api, {maxHeight: 300})).toMatch(
      /\/Items\/m1\/Images\/Primary\?.*tag=tag-1/,
    );
    expect(primaryImageUri(item, api, {maxHeight: 300})).toMatch(
      /maxHeight=300/,
    );
  });

  it('is undefined without a Primary tag or an id', () => {
    expect(primaryImageUri({Id: 'm1'}, api, {})).toBeUndefined();
    expect(
      primaryImageUri({ImageTags: {Primary: 'tag-1'}}, api, {}),
    ).toBeUndefined();
  });
});

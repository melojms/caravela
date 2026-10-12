import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {fireEvent, render, screen} from '@testing-library/react-native';
import React from 'react';

import {createJellyfin} from '../../src/api/client';
import {useToggleFavorite} from '../../src/api/details';
import {useSession} from '../../src/auth/SessionContext';
import {GenericDetails} from '../../src/screens/details/GenericDetails';
import {sessionFor} from '../auth/fakes';

jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

jest.mock('../../src/api/details', () => ({
  useToggleFavorite: jest.fn(),
}));

const api = createJellyfin('device-1').createApi(
  'https://jf.example.com',
  'token-1',
);

const boxSet = (extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: 'b1',
  Name: 'The Collection',
  Type: BaseItemKind.BoxSet,
  Overview: 'Some films.',
  Genres: ['Action'],
  ImageTags: {Primary: 'poster-tag'},
  UserData: {Key: 'b1', IsFavorite: false},
  ...extra,
});

let favorite: {toggle: jest.Mock; isPending: boolean};

const renderGeneric = (item: BaseItemDto = boxSet()) =>
  render(
    <GenericDetails
      item={item}
      navigation={{push: jest.fn(), navigate: jest.fn()} as never}
    />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  favorite = {toggle: jest.fn(), isPending: false};
  const session = sessionFor();
  session.api = api;
  (useSession as jest.Mock).mockReturnValue({session});
  (useToggleFavorite as jest.Mock).mockImplementation(() => favorite);
});

describe('GenericDetails', () => {
  it('shows the header with Favorite as the only, focused action', () => {
    renderGeneric();

    expect(screen.getByTestId('details-generic')).toBeTruthy();
    expect(screen.getByText('The Collection')).toBeTruthy();
    expect(screen.getByText('Action')).toBeTruthy();
    expect(screen.getByText('Some films.')).toBeTruthy();
    expect(
      screen.getByTestId('details-header-poster').props.source.uri,
    ).toMatch(/\/Items\/b1\/Images\/Primary\?.*tag=poster-tag/);
    const buttons = screen
      .getAllByRole('button')
      .map((button) => button.props.testID as string)
      .filter((id) => id.startsWith('details-actions-'));
    expect(buttons).toEqual(['details-actions-favorite']);
    expect(
      screen.getByTestId('details-actions-favorite').props.hasTVPreferredFocus,
    ).toBe(true);
  });

  it('toggles favorite and shows it as on', () => {
    renderGeneric(boxSet({UserData: {Key: 'b1', IsFavorite: true}}));

    const button = screen.getByTestId('details-actions-favorite');
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({selected: true}),
    );
    fireEvent.press(button);
    expect(favorite.toggle).toHaveBeenCalledTimes(1);
    expect(useToggleFavorite).toHaveBeenCalledWith('b1');
  });
});

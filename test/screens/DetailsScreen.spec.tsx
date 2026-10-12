import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {fireEvent, render, screen} from '@testing-library/react-native';
import {AxiosError, AxiosHeaders} from 'axios';
import React from 'react';

import {useItemDetails} from '../../src/api/details';
import {DetailsScreen} from '../../src/screens/DetailsScreen';

jest.mock('../../src/api/details', () => ({
  useItemDetails: jest.fn(),
}));

// Each page renders its name and the item it got, so the dispatch shows. A
// function declaration, so it's hoisted above the jest.mock calls.
function mockPage(name: string) {
  return ({item, navigation}: {item: BaseItemDto; navigation: unknown}) => {
    const {Text: MockText} = jest.requireActual('react-native');
    return (
      <MockText
        testID={`page-${name}`}
        accessibilityHint={String(!!navigation)}>
        {item.Id}
      </MockText>
    );
  };
}
jest.mock('../../src/screens/details/MovieDetails', () => ({
  MovieDetails: mockPage('movie'),
}));
jest.mock('../../src/screens/details/SeriesDetails', () => ({
  SeriesDetails: mockPage('series'),
}));
jest.mock('../../src/screens/details/SeasonDetails', () => ({
  SeasonDetails: mockPage('season'),
}));
jest.mock('../../src/screens/details/EpisodeDetails', () => ({
  EpisodeDetails: mockPage('episode'),
}));
jest.mock('../../src/screens/details/PersonDetails', () => ({
  PersonDetails: mockPage('person'),
}));
jest.mock('../../src/screens/details/GenericDetails', () => ({
  GenericDetails: mockPage('generic'),
}));

type Query = {
  data?: BaseItemDto;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: jest.Mock;
};

const loaded = (data: BaseItemDto): Query => ({
  data,
  isPending: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
});

const failed = (error: unknown = new Error('boom')): Query => ({
  isPending: false,
  isError: true,
  error,
  refetch: jest.fn(),
});

const unauthorized = () =>
  new AxiosError('401', '401', undefined, undefined, {
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config: {headers: new AxiosHeaders()},
    data: null,
  });

let itemQuery: Query;

const renderDetails = () =>
  render(
    <DetailsScreen
      navigation={{push: jest.fn(), navigate: jest.fn()} as never}
      route={
        {
          key: 'Details-1',
          name: 'Details',
          params: {itemId: 'i1', title: 'Route title'},
        } as never
      }
    />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  (useItemDetails as jest.Mock).mockImplementation(() => itemQuery);
});

describe('DetailsScreen', () => {
  it('shows a spinner with the route title while the item loads', () => {
    itemQuery = {
      isPending: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    };
    renderDetails();

    expect(screen.getByTestId('details-loading')).toBeTruthy();
    expect(screen.getByText('Route title')).toBeTruthy();
    expect(useItemDetails).toHaveBeenCalledWith('i1');
  });

  it('shows an error with Retry when the item fails', () => {
    itemQuery = failed();
    renderDetails();

    expect(screen.getByText("Couldn't load this item.")).toBeTruthy();
    const retry = screen.getByTestId('details-retry');
    expect(retry.props.hasTVPreferredFocus).toBe(true);
    fireEvent.press(retry);
    expect(itemQuery.refetch).toHaveBeenCalledTimes(1);
  });

  it('shows nothing on a 401, which the session handles', () => {
    itemQuery = failed(unauthorized());
    renderDetails();

    expect(screen.toJSON()).toBeNull();
  });

  it.each([
    [BaseItemKind.Movie, 'movie'],
    [BaseItemKind.Video, 'movie'],
    [BaseItemKind.MusicVideo, 'movie'],
    [BaseItemKind.Trailer, 'movie'],
    [BaseItemKind.Series, 'series'],
    [BaseItemKind.Season, 'season'],
    [BaseItemKind.Episode, 'episode'],
    [BaseItemKind.Person, 'person'],
    [BaseItemKind.BoxSet, 'generic'],
    [BaseItemKind.MusicAlbum, 'generic'],
  ])('shows a %s on the %s page', (type, page) => {
    itemQuery = loaded({Id: 'i1', Name: 'Item', Type: type});
    renderDetails();

    const shown = screen.getByTestId(`page-${page}`);
    expect(shown.props.children).toBe('i1');
    expect(shown.props.accessibilityHint).toBe('true');
  });

  it('shows an item with no type on the generic page', () => {
    itemQuery = loaded({Id: 'i1', Name: 'Item'});
    renderDetails();

    expect(screen.getByTestId('page-generic')).toBeTruthy();
  });
});

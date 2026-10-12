import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import type {UserItemDataDto} from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';
import {fireEvent, render, screen, within} from '@testing-library/react-native';
import React from 'react';

import {createJellyfin} from '../../src/api/client';
import {useToggleFavorite} from '../../src/api/details';
import {PersonItemKind, usePersonItems} from '../../src/api/tvDetails';
import {useSession} from '../../src/auth/SessionContext';
import {PersonDetails} from '../../src/screens/details/PersonDetails';
import {sessionFor} from '../auth/fakes';

jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

jest.mock('../../src/api/details', () => ({
  useToggleFavorite: jest.fn(),
}));

jest.mock('../../src/api/tvDetails', () => ({
  usePersonItems: jest.fn(),
}));

const api = createJellyfin('device-1').createApi(
  'https://jf.example.com',
  'token-1',
);

type Query<T> = {data?: T; isPending: boolean; isError: boolean};

const loaded = <T,>(data: T): Query<T> => ({
  data,
  isPending: false,
  isError: false,
});
const pending = <T,>(): Query<T> => ({isPending: true, isError: false});
const failed = <T,>(): Query<T> => ({isPending: false, isError: true});

const flatStyle = (style: unknown): {width?: number; height?: number} =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const userData = (data: Omit<UserItemDataDto, 'Key'>): UserItemDataDto => ({
  Key: 'p1',
  ...data,
});

const person = (extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: 'p1',
  Name: 'Jane Doe',
  Type: BaseItemKind.Person,
  PremiereDate: '1970-03-14T12:00:00Z',
  EndDate: '2020-03-20T12:00:00Z',
  ProductionLocations: ['Lisbon, Portugal'],
  Overview: 'A long career.',
  ImageTags: {Primary: 'photo-tag'},
  UserData: userData({IsFavorite: false, Played: false}),
  ...extra,
});

let queries: Record<PersonItemKind, Query<BaseItemDto[]>>;
let favorite: {toggle: jest.Mock; isPending: boolean};
let push: jest.Mock;

const renderPerson = (item: BaseItemDto = person()) =>
  render(<PersonDetails item={item} navigation={{push} as never} />);

const actionKeys = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.props.testID as string)
    .filter((id) => id.startsWith('details-actions-'));

beforeEach(() => {
  jest.clearAllMocks();
  push = jest.fn();
  queries = {
    [BaseItemKind.Movie]: loaded([
      {Id: 'm1', Name: 'A Movie', Type: BaseItemKind.Movie},
    ]),
    [BaseItemKind.Series]: loaded([
      {Id: 's1', Name: 'A Series', Type: BaseItemKind.Series},
    ]),
    [BaseItemKind.Episode]: loaded([
      {
        Id: 'e1',
        Name: 'An Episode',
        Type: BaseItemKind.Episode,
        SeriesName: 'Lost',
        ParentIndexNumber: 1,
        IndexNumber: 2,
      },
    ]),
  };
  favorite = {toggle: jest.fn(), isPending: false};
  const session = sessionFor();
  session.api = api;
  (useSession as jest.Mock).mockReturnValue({session});
  (usePersonItems as jest.Mock).mockImplementation(
    (_id: string, kind: PersonItemKind) => queries[kind],
  );
  (useToggleFavorite as jest.Mock).mockImplementation(() => favorite);
});

describe('PersonDetails', () => {
  it('renders the name, photo, dates, birthplace and biography', () => {
    renderPerson();

    expect(screen.getByTestId('details-person')).toBeTruthy();
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText('Born Mar 14, 1970 (50)')).toBeTruthy();
    expect(screen.getByText('Died Mar 20, 2020')).toBeTruthy();
    expect(screen.getByText('Lisbon, Portugal')).toBeTruthy();
    expect(screen.getByText('A long career.')).toBeTruthy();
    expect(screen.queryByText('Directed by')).toBeNull();
    expect(
      screen.getByTestId('details-header-poster').props.source.uri,
    ).toMatch(/\/Items\/p1\/Images\/Primary\?.*tag=photo-tag/);
    // A portrait frame.
    const frame = flatStyle(
      screen.getByTestId('details-header-poster-frame').props.style,
    );
    expect(frame.height).toBeGreaterThan(frame.width ?? Infinity);
    expect(
      screen.queryByTestId('backdrop-image', {includeHiddenElements: true}),
    ).toBeNull();
  });

  it('has only Favorite, focused, and it toggles', () => {
    renderPerson(person({UserData: userData({IsFavorite: true})}));

    expect(actionKeys()).toEqual(['details-actions-favorite']);
    const button = screen.getByTestId('details-actions-favorite');
    expect(button.props.hasTVPreferredFocus).toBe(true);
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({selected: true}),
    );
    fireEvent.press(button);
    expect(favorite.toggle).toHaveBeenCalledTimes(1);
    expect(useToggleFavorite).toHaveBeenCalledWith('p1');
  });

  it('asks for the movies, series and episodes of the person', () => {
    renderPerson();

    for (const kind of [
      BaseItemKind.Movie,
      BaseItemKind.Series,
      BaseItemKind.Episode,
    ]) {
      expect(usePersonItems).toHaveBeenCalledWith('p1', kind);
    }
  });

  it('shows the rows in order: poster movies and series, landscape episodes', () => {
    renderPerson();

    const titles = screen
      .getAllByText(/^(Movies|TV series|Episodes)$/)
      .map((node) => node.props.children);
    expect(titles).toEqual(['Movies', 'TV series', 'Episodes']);
    const shape = (testID: string) =>
      flatStyle(screen.getByTestId(`${testID}-item-0-frame`).props.style);
    const movie = shape('row-person-movies');
    expect(movie.height).toBeGreaterThan(movie.width ?? Infinity);
    const show = shape('row-person-series');
    expect(show.height).toBeGreaterThan(show.width ?? Infinity);
    const episode = shape('row-person-episodes');
    expect(episode.width).toBeGreaterThan(episode.height ?? Infinity);
  });

  it('hides a row while it loads, when empty or when it fails', () => {
    queries[BaseItemKind.Movie] = loaded([]);
    queries[BaseItemKind.Series] = failed();
    queries[BaseItemKind.Episode] = pending();
    renderPerson();

    expect(screen.queryByText('Movies')).toBeNull();
    expect(screen.queryByText('TV series')).toBeNull();
    expect(screen.queryByText('Episodes')).toBeNull();
    expect(screen.getByText('Jane Doe')).toBeTruthy();
  });

  it('keeps the other rows when one fails', () => {
    queries[BaseItemKind.Series] = failed();
    renderPerson();

    expect(screen.getByText('Movies')).toBeTruthy();
    expect(screen.queryByText('TV series')).toBeNull();
    expect(screen.getByText('Episodes')).toBeTruthy();
  });

  it('with nothing in any row, shows the header with Favorite to focus', () => {
    queries = {
      [BaseItemKind.Movie]: loaded([]),
      [BaseItemKind.Series]: loaded([]),
      [BaseItemKind.Episode]: loaded([]),
    };
    renderPerson(person({Overview: undefined, PremiereDate: undefined}));

    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(
      screen.getByTestId('details-actions-favorite').props.hasTVPreferredFocus,
    ).toBe(true);
    expect(screen.queryByTestId('row-person-movies')).toBeNull();
  });


  it('pushes Details for a pressed movie, series or episode', () => {
    renderPerson();

    fireEvent.press(screen.getByTestId('row-person-movies-item-0'));
    expect(push).toHaveBeenLastCalledWith('Details', {
      itemId: 'm1',
      title: 'A Movie',
    });
    fireEvent.press(screen.getByTestId('row-person-series-item-0'));
    expect(push).toHaveBeenLastCalledWith('Details', {
      itemId: 's1',
      title: 'A Series',
    });
    fireEvent.press(
      within(screen.getByTestId('row-person-episodes')).getByTestId(
        'row-person-episodes-item-0',
      ),
    );
    expect(push).toHaveBeenLastCalledWith('Details', {
      itemId: 'e1',
      title: expect.any(String),
    });
  });
});

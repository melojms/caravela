import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import type {UserItemDataDto} from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';
import {PersonKind} from '@jellyfin/sdk/lib/generated-client/models/person-kind';
import {fireEvent, render, screen, within} from '@testing-library/react-native';
import {AxiosError, AxiosHeaders} from 'axios';
import React from 'react';

import {createJellyfin} from '../../src/api/client';
import {
  useItemDetails,
  useSimilarItems,
  useToggleFavorite,
  useTogglePlayed,
} from '../../src/api/details';
import {useSession} from '../../src/auth/SessionContext';
import {DetailsScreen} from '../../src/screens/DetailsScreen';
import {sessionFor} from '../auth/fakes';

jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

jest.mock('../../src/api/details', () => ({
  useItemDetails: jest.fn(),
  useSimilarItems: jest.fn(),
  useToggleFavorite: jest.fn(),
  useTogglePlayed: jest.fn(),
}));

const api = createJellyfin('device-1').createApi(
  'https://jf.example.com',
  'token-1',
);

type Query<T> = {
  data?: T;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: jest.Mock;
};

const loaded = <T,>(data: T): Query<T> => ({
  data,
  isPending: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
});
const pending = <T,>(): Query<T> => ({
  isPending: true,
  isError: false,
  error: null,
  refetch: jest.fn(),
});
const failed = <T,>(error: unknown = new Error('boom')): Query<T> => ({
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

const TICKS_PER_MS = 10000;

const userData = (data: Omit<UserItemDataDto, 'Key'>): UserItemDataDto => ({
  Key: 'm1',
  ...data,
});

const movie = (extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: 'm1',
  Name: 'The Movie',
  Type: BaseItemKind.Movie,
  ProductionYear: 2020,
  Overview: 'A story.',
  Genres: ['Drama', 'Comedy'],
  RunTimeTicks: 90 * 60000 * TICKS_PER_MS,
  ImageTags: {Primary: 'poster-tag'},
  BackdropImageTags: ['backdrop-tag'],
  UserData: userData({
    Played: false,
    IsFavorite: false,
    PlaybackPositionTicks: 0,
  }),
  People: [
    {Id: 'p1', Name: 'Jane Doe', Type: PersonKind.Director},
    {Id: 'p1', Name: 'Jane Doe', Type: PersonKind.Writer},
    {Id: 'p2', Name: 'John Roe', Role: 'Hero', Type: PersonKind.Actor},
  ],
  ...extra,
});

let itemQuery: Query<BaseItemDto>;
let similarQuery: Query<BaseItemDto[]>;
let favorite: {toggle: jest.Mock; isPending: boolean};
let played: {toggle: jest.Mock; isPending: boolean};
let push: jest.Mock;
let goBack: jest.Mock;
let navigate: jest.Mock;

const renderDetails = () =>
  render(
    <DetailsScreen
      navigation={{push, goBack, navigate} as never}
      route={
        {
          key: 'Details-1',
          name: 'Details',
          params: {itemId: 'm1', title: 'Route title'},
        } as never
      }
    />,
  );

const actionKeys = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.props.testID as string)
    .filter((id) => id.startsWith('details-actions-'));

const preferred = (key: string) =>
  screen.getByTestId(`details-actions-${key}`).props.hasTVPreferredFocus;

beforeEach(() => {
  jest.clearAllMocks();
  push = jest.fn();
  goBack = jest.fn();
  navigate = jest.fn();
  itemQuery = loaded(movie());
  similarQuery = loaded([
    {Id: 's1', Name: 'Similar One', Type: BaseItemKind.Movie},
    {Id: 's2', Name: 'Similar Two', Type: BaseItemKind.Movie},
  ]);
  favorite = {toggle: jest.fn(), isPending: false};
  played = {toggle: jest.fn(), isPending: false};
  const session = sessionFor();
  session.api = api;
  (useSession as jest.Mock).mockReturnValue({session});
  (useItemDetails as jest.Mock).mockImplementation(() => itemQuery);
  (useSimilarItems as jest.Mock).mockImplementation(() => similarQuery);
  (useToggleFavorite as jest.Mock).mockImplementation(() => favorite);
  (useTogglePlayed as jest.Mock).mockImplementation(() => played);
});

describe('DetailsScreen', () => {
  it('shows a spinner with the route title while the item loads', () => {
    itemQuery = pending();
    renderDetails();

    expect(screen.getByTestId('details-loading')).toBeTruthy();
    expect(screen.getByText('Route title')).toBeTruthy();
    expect(useItemDetails).toHaveBeenCalledWith('m1');
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

    expect(screen.queryByTestId('details-retry')).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });

  it('shows the placeholder for anything but a movie', () => {
    itemQuery = loaded(movie({Type: BaseItemKind.Episode}));
    renderDetails();

    expect(screen.getByText('Route title')).toBeTruthy();
    expect(screen.getByText('Item m1')).toBeTruthy();
    expect(screen.getByText('Details arrive in a later task.')).toBeTruthy();
    expect(screen.queryByTestId('details-actions')).toBeNull();
    fireEvent.press(screen.getByTestId('details-back'));
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('renders the header, actions and rows of a movie', () => {
    renderDetails();

    expect(screen.getByText('The Movie')).toBeTruthy();
    expect(screen.getByText('Drama / Comedy')).toBeTruthy();
    expect(screen.getByText('A story.')).toBeTruthy();
    expect(screen.getByText('Directed by')).toBeTruthy();
    expect(screen.getByText('1h 30m')).toBeTruthy();
    expect(
      screen.getByTestId('details-header-poster').props.source.uri,
    ).toMatch(/\/Items\/m1\/Images\/Primary\?.*tag=poster-tag/);
    expect(
      screen.getByTestId('backdrop-image', {includeHiddenElements: true}).props
        .source.uri,
    ).toMatch(/\/Items\/m1\/Images\/Backdrop\?tag=backdrop-tag&imageIndex=0/);
    expect(actionKeys()).toEqual([
      'details-actions-play',
      'details-actions-watched',
      'details-actions-favorite',
    ]);
    expect(screen.getByText('Cast & crew')).toBeTruthy();
    expect(screen.getByText('More like this')).toBeTruthy();
    expect(
      within(screen.getByTestId('row-similar')).getAllByText('Similar Two'),
    ).toHaveLength(2);
    expect(useSimilarItems).toHaveBeenCalledWith('m1');
  });

  it('shows Resume first, focused, when there is a resume point', () => {
    itemQuery = loaded(
      movie({
        UserData: userData({
          Played: false,
          IsFavorite: false,
          PlaybackPositionTicks: (62 * 60 + 10) * 1000 * TICKS_PER_MS,
        }),
      }),
    );
    renderDetails();

    expect(actionKeys()[0]).toBe('details-actions-resume');
    expect(screen.getByText('Resume from 1:02:10')).toBeTruthy();
    expect(preferred('resume')).toBe(true);
    expect(preferred('play')).toBe(false);
  });

  it('focuses Play when there is nothing to resume', () => {
    renderDetails();

    expect(screen.queryByTestId('details-actions-resume')).toBeNull();
    expect(preferred('play')).toBe(true);
  });

  it("doesn't move focus to Play when Resume goes away", () => {
    const resumable = movie({
      UserData: userData({
        Played: false,
        PlaybackPositionTicks: 5000 * TICKS_PER_MS,
      }),
    });
    itemQuery = loaded(resumable);
    renderDetails();
    expect(preferred('resume')).toBe(true);

    itemQuery = loaded(movie({UserData: userData({Played: true})}));
    screen.rerender(
      <DetailsScreen
        navigation={{push, goBack} as never}
        route={
          {
            key: 'Details-1',
            name: 'Details',
            params: {itemId: 'm1', title: 'Route title'},
          } as never
        }
      />,
    );
    expect(screen.queryByTestId('details-actions-resume')).toBeNull();
    expect(preferred('play')).toBe(false);
  });

  it('Play opens the player from the start with the title', () => {
    renderDetails();
    fireEvent.press(screen.getByTestId('details-actions-play'));
    expect(navigate).toHaveBeenCalledWith('Player', {
      itemId: 'm1',
      title: 'The Movie',
      startMs: 0,
    });
    // `navigate`, so a second press reuses the player rather than stacking one.
    expect(push).not.toHaveBeenCalled();
  });

  it('Resume opens the player at the resume position', () => {
    const resumeMs = (62 * 60 + 10) * 1000;
    itemQuery = loaded(
      movie({
        UserData: userData({
          Played: false,
          PlaybackPositionTicks: resumeMs * TICKS_PER_MS,
        }),
      }),
    );
    renderDetails();
    fireEvent.press(screen.getByTestId('details-actions-resume'));
    expect(navigate).toHaveBeenCalledWith('Player', {
      itemId: 'm1',
      title: 'The Movie',
      startMs: resumeMs,
    });
  });

  it('toggles watched and favorite', () => {
    renderDetails();

    fireEvent.press(screen.getByTestId('details-actions-watched'));
    expect(played.toggle).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('details-actions-favorite'));
    expect(favorite.toggle).toHaveBeenCalledTimes(1);
    expect(useTogglePlayed).toHaveBeenCalledWith('m1');
    expect(useToggleFavorite).toHaveBeenCalledWith('m1');
  });

  it('shows the toggles as on when played and favourite', () => {
    itemQuery = loaded(
      movie({UserData: userData({Played: true, IsFavorite: true})}),
    );
    renderDetails();

    for (const key of ['watched', 'favorite']) {
      expect(
        screen.getByTestId(`details-actions-${key}`).props.accessibilityState,
      ).toEqual(expect.objectContaining({selected: true}));
    }
    expect(
      screen.getByTestId('details-actions-play').props.accessibilityState,
    ).toEqual(expect.objectContaining({selected: false}));
  });

  it('disables a toggle while its mutation is pending', () => {
    played.isPending = true;
    renderDetails();

    const watched = screen.getByTestId('details-actions-watched');
    expect(watched.props.accessibilityState).toEqual(
      expect.objectContaining({disabled: true}),
    );
    fireEvent.press(watched);
    expect(played.toggle).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('details-actions-favorite').props.accessibilityState,
    ).toEqual(expect.objectContaining({disabled: false}));
  });

  it('hides the cast row when there are no people', () => {
    itemQuery = loaded(movie({People: []}));
    renderDetails();

    expect(screen.queryByText('Cast & crew')).toBeNull();
    expect(screen.getByText('More like this')).toBeTruthy();
  });

  it('hides More like this when there are no similar items', () => {
    similarQuery = loaded([]);
    renderDetails();

    expect(screen.queryByText('More like this')).toBeNull();
    expect(screen.getByText('Cast & crew')).toBeTruthy();
  });

  it('hides More like this while it loads or when it fails', () => {
    similarQuery = pending();
    renderDetails();
    expect(screen.queryByText('More like this')).toBeNull();

    similarQuery = failed();
    renderDetails();
    expect(screen.queryByText('More like this')).toBeNull();
    expect(screen.getAllByText('The Movie').length).toBeGreaterThan(0);
  });

  it('gives a person listed twice two cards', () => {
    renderDetails();

    expect(screen.getByTestId('row-cast-item-0')).toBeTruthy();
    expect(screen.getByTestId('row-cast-item-1')).toBeTruthy();
    expect(screen.getByTestId('row-cast-item-2')).toBeTruthy();
    expect(
      within(screen.getByTestId('row-cast')).getAllByText('Jane Doe'),
    ).toHaveLength(4);
    expect(screen.getByText('Writer')).toBeTruthy();
  });

  it('opens the placeholder with the person id when a person is pressed', () => {
    renderDetails();

    fireEvent.press(screen.getByTestId('row-cast-item-1'));
    expect(push).toHaveBeenCalledWith('DetailsPlaceholder', {
      itemId: 'p1',
      title: 'Jane Doe',
    });
  });

  it('pushes another Details when a similar item is pressed', () => {
    renderDetails();

    fireEvent.press(screen.getByTestId('row-similar-item-1'));
    expect(push).toHaveBeenCalledWith('Details', {
      itemId: 's2',
      title: 'Similar Two',
    });
  });
});

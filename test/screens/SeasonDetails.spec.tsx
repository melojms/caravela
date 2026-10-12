import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import type {UserItemDataDto} from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';
import {fireEvent, render, screen, within} from '@testing-library/react-native';
import React from 'react';

import {createJellyfin} from '../../src/api/client';
import {useToggleFavorite, useTogglePlayed} from '../../src/api/details';
import {useSeasonEpisodes} from '../../src/api/tvDetails';
import {useSession} from '../../src/auth/SessionContext';
import {SeasonDetails} from '../../src/screens/details/SeasonDetails';
import {sessionFor} from '../auth/fakes';

jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

jest.mock('../../src/api/details', () => ({
  useToggleFavorite: jest.fn(),
  useTogglePlayed: jest.fn(),
}));

jest.mock('../../src/api/tvDetails', () => ({
  useSeasonEpisodes: jest.fn(),
}));

const api = createJellyfin('device-1').createApi(
  'https://jf.example.com',
  'token-1',
);

type Query<T> = {
  data?: T;
  isPending: boolean;
  isLoading: boolean;
  isError: boolean;
};

const loaded = <T,>(data: T): Query<T> => ({
  data,
  isPending: false,
  isLoading: false,
  isError: false,
});
const pending = <T,>(): Query<T> => ({
  isPending: true,
  isLoading: true,
  isError: false,
});
const failed = <T,>(): Query<T> => ({
  isPending: false,
  isLoading: false,
  isError: true,
});

const TICKS_PER_MS = 10000;

const userData = (data: Omit<UserItemDataDto, 'Key'>): UserItemDataDto => ({
  Key: 'k',
  ...data,
});

const season = (extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: 'se1',
  Name: 'Season 1',
  Type: BaseItemKind.Season,
  IndexNumber: 1,
  SeriesId: 'sr1',
  SeriesName: 'The Show',
  SeriesPrimaryImageTag: 'series-poster',
  ProductionYear: 2019,
  PremiereDate: '2019-03-14T12:00:00Z',
  Overview: 'The first season.',
  ImageTags: {Primary: 'season-poster'},
  ParentBackdropItemId: 'sr1',
  ParentBackdropImageTags: ['series-backdrop'],
  UserData: userData({Played: false, IsFavorite: false}),
  People: [{Id: 'p1', Name: 'Jane Doe', Type: 'Director'}],
  ...extra,
});

const episode = (
  id: string,
  index: number,
  extra: Partial<BaseItemDto> = {},
): BaseItemDto => ({
  Id: id,
  Name: `Episode ${index}`,
  Type: BaseItemKind.Episode,
  SeriesName: 'The Show',
  SeriesId: 'sr1',
  ParentIndexNumber: 1,
  IndexNumber: index,
  ImageTags: {Primary: `still-${id}`},
  ParentThumbItemId: 'sr1',
  ParentThumbImageTag: 'series-thumb',
  UserData: userData({Played: false, PlaybackPositionTicks: 0}),
  ...extra,
});

let episodesQuery: Query<BaseItemDto[]>;
let favorite: {toggle: jest.Mock; isPending: boolean};
let played: {toggle: jest.Mock; isPending: boolean};
let push: jest.Mock;
let navigate: jest.Mock;

const ui = (item: BaseItemDto) => (
  <SeasonDetails item={item} navigation={{push, navigate} as never} />
);
const renderSeason = (item: BaseItemDto = season()) => render(ui(item));

const actionKeys = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.props.testID as string)
    .filter((id) => id.startsWith('details-actions-'))
    .map((id) => id.replace('details-actions-', ''));

const preferred = (key: string) =>
  screen.getByTestId(`details-actions-${key}`).props.hasTVPreferredFocus;

const watched = (): UserItemDataDto => userData({Played: true});

beforeEach(() => {
  jest.clearAllMocks();
  push = jest.fn();
  navigate = jest.fn();
  episodesQuery = loaded([episode('e1', 1), episode('e2', 2)]);
  favorite = {toggle: jest.fn(), isPending: false};
  played = {toggle: jest.fn(), isPending: false};
  const session = sessionFor();
  session.api = api;
  (useSession as jest.Mock).mockReturnValue({session});
  (useSeasonEpisodes as jest.Mock).mockImplementation(() => episodesQuery);
  (useToggleFavorite as jest.Mock).mockImplementation(() => favorite);
  (useTogglePlayed as jest.Mock).mockImplementation(() => played);
});

describe('SeasonDetails', () => {
  it('shows the loading view with the title until the episodes settle', () => {
    episodesQuery = pending();
    renderSeason();

    expect(screen.getByTestId('details-loading')).toBeTruthy();
    expect(screen.getByText('Season 1')).toBeTruthy();
    expect(screen.queryByTestId('details-actions-play')).toBeNull();

    episodesQuery = loaded([episode('e1', 1)]);
    screen.rerender(ui(season()));
    expect(screen.queryByTestId('details-loading')).toBeNull();
    expect(preferred('play')).toBe(true);
  });

  it('renders the header with the series name, the series backdrop and no info items', () => {
    renderSeason();

    expect(screen.getByText('Season 1')).toBeTruthy();
    expect(screen.getByText('The Show')).toBeTruthy();
    expect(screen.getByText('The first season.')).toBeTruthy();
    expect(screen.getByText('Mar 14, 2019')).toBeTruthy();
    expect(screen.queryByText('Directed by')).toBeNull();
    expect(
      screen.getByTestId('details-header-poster').props.source.uri,
    ).toMatch(/\/Items\/se1\/Images\/Primary\?.*tag=season-poster/);
    expect(
      screen.getByTestId('backdrop-image', {includeHiddenElements: true}).props
        .source.uri,
    ).toMatch(/\/Items\/sr1\/Images\/Backdrop\?tag=series-backdrop/);
    expect(useSeasonEpisodes).toHaveBeenCalledWith('sr1', 'se1');
  });

  it("falls back to the series' poster", () => {
    renderSeason(season({ImageTags: {}}));

    expect(
      screen.getByTestId('details-header-poster').props.source.uri,
    ).toMatch(/\/Items\/sr1\/Images\/Primary\?.*tag=series-poster/);
  });

  it('has no poster when neither the season nor the series has one', () => {
    renderSeason(season({ImageTags: {}, SeriesPrimaryImageTag: undefined}));

    expect(screen.queryByTestId('details-header-poster')).toBeNull();
  });

  it('Play opens the first unwatched episode from the start', () => {
    episodesQuery = loaded([
      episode('e1', 1, {UserData: watched()}),
      episode('e2', 2),
      episode('e3', 3),
    ]);
    renderSeason();

    expect(actionKeys()).toEqual(['play', 'watched', 'favorite']);
    fireEvent.press(screen.getByTestId('details-actions-play'));
    expect(navigate).toHaveBeenCalledWith('Player', {
      itemId: 'e2',
      title: 'Episode 2',
      startMs: 0,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('shows Resume first, focused, when that episode has a position', () => {
    const resumeMs = (3 * 60 + 7) * 1000;
    episodesQuery = loaded([
      episode('e1', 1, {UserData: watched()}),
      episode('e2', 2, {
        UserData: userData({
          Played: false,
          PlaybackPositionTicks: resumeMs * TICKS_PER_MS,
        }),
      }),
    ]);
    renderSeason();

    expect(actionKeys()).toEqual(['resume', 'play', 'watched', 'favorite']);
    expect(screen.getByText('Resume from 3:07')).toBeTruthy();
    expect(preferred('resume')).toBe(true);
    expect(preferred('play')).toBe(false);

    fireEvent.press(screen.getByTestId('details-actions-resume'));
    expect(navigate).toHaveBeenLastCalledWith('Player', {
      itemId: 'e2',
      title: 'Episode 2',
      startMs: resumeMs,
    });
    fireEvent.press(screen.getByTestId('details-actions-play'));
    expect(navigate).toHaveBeenLastCalledWith('Player', {
      itemId: 'e2',
      title: 'Episode 2',
      startMs: 0,
    });
  });

  it('plays the first episode when all are watched', () => {
    episodesQuery = loaded([
      episode('e1', 1, {UserData: watched()}),
      episode('e2', 2, {UserData: watched()}),
    ]);
    renderSeason();

    fireEvent.press(screen.getByTestId('details-actions-play'));
    expect(navigate).toHaveBeenCalledWith(
      'Player',
      expect.objectContaining({itemId: 'e1', startMs: 0}),
    );
  });

  it('has no Play and no Episodes row for a season with no episodes', () => {
    episodesQuery = loaded([]);
    renderSeason();

    expect(actionKeys()).toEqual(['watched', 'favorite']);
    expect(screen.queryByText('Episodes')).toBeNull();
    expect(screen.getByTestId('details-season')).toBeTruthy();
  });

  it('still shows the page when the episodes fail, without Play or the row', () => {
    episodesQuery = failed();
    renderSeason();

    expect(screen.getByTestId('details-season')).toBeTruthy();
    expect(actionKeys()).toEqual(['watched', 'favorite']);
    expect(preferred('watched')).toBe(true);
    expect(screen.queryByText('Episodes')).toBeNull();
  });

  it('toggles watched and favorite', () => {
    renderSeason(
      season({UserData: userData({Played: true, IsFavorite: true})}),
    );

    for (const key of ['watched', 'favorite']) {
      expect(
        screen.getByTestId(`details-actions-${key}`).props.accessibilityState,
      ).toEqual(expect.objectContaining({selected: true}));
    }
    fireEvent.press(screen.getByTestId('details-actions-watched'));
    expect(played.toggle).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('details-actions-favorite'));
    expect(favorite.toggle).toHaveBeenCalledTimes(1);
    expect(useTogglePlayed).toHaveBeenCalledWith('se1');
    expect(useToggleFavorite).toHaveBeenCalledWith('se1');
  });

  it('lists the episodes with their own image and progress, and pushes Details', () => {
    episodesQuery = loaded([
      episode('e1', 1, {
        UserData: userData({Played: false, PlayedPercentage: 40}),
      }),
      episode('e2', 2),
    ]);
    renderSeason();

    const row = screen.getByTestId('row-episodes');
    expect(within(row).getAllByText('The Show S1 E1').length).toBeGreaterThan(
      0,
    );
    const images = within(row)
      .UNSAFE_queryAllByProps({})
      .map((node) => node.props.source?.uri as string | undefined)
      .filter((uri): uri is string => typeof uri === 'string');
    expect(images.some((uri) => /\/Items\/e1\/Images\/Primary/.test(uri))).toBe(
      true,
    );
    expect(images.some((uri) => /series-thumb/.test(uri))).toBe(false);
    expect(within(row).getAllByTestId('card-progress').length).toBeGreaterThan(
      0,
    );

    fireEvent.press(screen.getByTestId('row-episodes-item-1'));
    expect(push).toHaveBeenCalledWith('Details', {
      itemId: 'e2',
      title: 'The Show S1 E2',
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});

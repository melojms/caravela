import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {PersonKind} from '@jellyfin/sdk/lib/generated-client/models/person-kind';
import type {UserItemDataDto} from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import React from 'react';

import {createJellyfin} from '../../src/api/client';
import {
  useSimilarItems,
  useToggleFavorite,
  useTogglePlayed,
} from '../../src/api/details';
import {
  fetchSeasonEpisodes,
  fetchSeasons,
  useSeasons,
  useSeriesNextUp,
} from '../../src/api/tvDetails';
import {useSession} from '../../src/auth/SessionContext';
import {SeriesDetails} from '../../src/screens/details/SeriesDetails';
import {sessionFor} from '../auth/fakes';

jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

// The real query keys: the first-episode fetch builds its keys from them.
jest.mock('../../src/api/details', () => ({
  ...jest.requireActual('../../src/api/details'),
  useSimilarItems: jest.fn(),
  useToggleFavorite: jest.fn(),
  useTogglePlayed: jest.fn(),
}));

jest.mock('../../src/api/tvDetails', () => ({
  ...jest.requireActual('../../src/api/tvDetails'),
  useSeasons: jest.fn(),
  useSeriesNextUp: jest.fn(),
  fetchSeasons: jest.fn(),
  fetchSeasonEpisodes: jest.fn(),
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

const series = (extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: 'sr1',
  Name: 'The Show',
  Type: BaseItemKind.Series,
  ProductionYear: 2019,
  Status: 'Continuing',
  Overview: 'A series.',
  Genres: ['Drama'],
  ChildCount: 3,
  ImageTags: {Primary: 'series-poster'},
  BackdropImageTags: ['series-backdrop'],
  UserData: userData({Played: false, IsFavorite: false, PlayedPercentage: 0}),
  People: [
    {Id: 'p1', Name: 'Jane Doe', Role: 'Lead', Type: PersonKind.Actor},
    {Id: 'p1', Name: 'Jane Doe', Type: PersonKind.Producer},
  ],
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
  UserData: userData({Played: false, PlaybackPositionTicks: 0}),
  ...extra,
});

const season = (id: string, index: number): BaseItemDto => ({
  Id: id,
  Name: index === 0 ? 'Specials' : `Season ${index}`,
  Type: BaseItemKind.Season,
  IndexNumber: index,
  SeriesId: 'sr1',
});

let nextUpQuery: Query<BaseItemDto[]>;
let seasonsQuery: Query<BaseItemDto[]>;
let similarQuery: Query<BaseItemDto[]>;
let favorite: {toggle: jest.Mock; isPending: boolean};
let played: {toggle: jest.Mock; isPending: boolean};
let push: jest.Mock;
let navigate: jest.Mock;
let queryClient: QueryClient;

const ui = (item: BaseItemDto) => (
  <QueryClientProvider client={queryClient}>
    <SeriesDetails item={item} navigation={{push, navigate} as never} />
  </QueryClientProvider>
);
const renderSeries = (item: BaseItemDto = series()) => render(ui(item));

const actionKeys = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.props.testID as string)
    .filter((id) => id.startsWith('details-actions-'))
    .map((id) => id.replace('details-actions-', ''));

const preferred = (key: string) =>
  screen.getByTestId(`details-actions-${key}`).props.hasTVPreferredFocus;

beforeEach(() => {
  jest.clearAllMocks();
  push = jest.fn();
  navigate = jest.fn();
  queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
  });
  nextUpQuery = loaded([episode('e2', 2), episode('e3', 3)]);
  seasonsQuery = loaded([season('s1', 1), season('s2', 2)]);
  similarQuery = loaded([
    {Id: 'x1', Name: 'Other Show', Type: BaseItemKind.Series},
  ]);
  favorite = {toggle: jest.fn(), isPending: false};
  played = {toggle: jest.fn(), isPending: false};
  const session = sessionFor();
  session.api = api;
  (useSession as jest.Mock).mockReturnValue({session});
  (useSeriesNextUp as jest.Mock).mockImplementation(() => nextUpQuery);
  (useSeasons as jest.Mock).mockImplementation(() => seasonsQuery);
  (useSimilarItems as jest.Mock).mockImplementation(() => similarQuery);
  (useToggleFavorite as jest.Mock).mockImplementation(() => favorite);
  (useTogglePlayed as jest.Mock).mockImplementation(() => played);
});

afterEach(() => queryClient.clear());

describe('SeriesDetails', () => {
  it('shows the loading view with the title until next up settles', () => {
    nextUpQuery = pending();
    renderSeries();

    expect(screen.getByTestId('details-loading')).toBeTruthy();
    expect(screen.getByText('The Show')).toBeTruthy();
    expect(screen.queryByTestId('details-actions-play')).toBeNull();

    nextUpQuery = loaded([episode('e2', 2)]);
    screen.rerender(ui(series()));
    expect(screen.queryByTestId('details-loading')).toBeNull();
    expect(preferred('play')).toBe(true);
  });

  it('renders once next up fails, with Play from the first episode', () => {
    nextUpQuery = failed();
    renderSeries();

    expect(screen.getByTestId('details-series')).toBeTruthy();
    expect(actionKeys()).toEqual(['play', 'watched', 'favorite']);
    expect(screen.queryByText('Next up')).toBeNull();
  });

  it('renders the header, actions and rows', () => {
    renderSeries();

    expect(screen.getAllByText('The Show').length).toBeGreaterThan(0);
    expect(screen.getByText('A series.')).toBeTruthy();
    expect(screen.getByText('Drama')).toBeTruthy();
    expect(screen.getByText('Continuing')).toBeTruthy();
    // The Seasons info item and the Seasons row.
    expect(screen.getAllByText('Seasons')).toHaveLength(2);
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    expect(
      screen.getByTestId('details-header-poster').props.source.uri,
    ).toMatch(/\/Items\/sr1\/Images\/Primary\?.*tag=series-poster/);
    expect(
      screen.getByTestId('backdrop-image', {includeHiddenElements: true}).props
        .source.uri,
    ).toMatch(/\/Items\/sr1\/Images\/Backdrop\?tag=series-backdrop/);
    expect(actionKeys()).toEqual(['play', 'watched', 'favorite']);
    expect(screen.getByText('Next up')).toBeTruthy();
    expect(screen.getByTestId('row-seasons')).toBeTruthy();
    expect(screen.getByText('Cast & crew')).toBeTruthy();
    expect(screen.getByText('More like this')).toBeTruthy();
    expect(useSeriesNextUp).toHaveBeenCalledWith('sr1');
    expect(useSeasons).toHaveBeenCalledWith('sr1');
    expect(useSimilarItems).toHaveBeenCalledWith('sr1');
  });

  it('Play opens the next-up episode from the start', () => {
    renderSeries();

    fireEvent.press(screen.getByTestId('details-actions-play'));
    expect(navigate).toHaveBeenCalledWith('Player', {
      itemId: 'e2',
      title: 'Episode 2',
      startMs: 0,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('shows Resume first, focused, when the next-up episode has a position', () => {
    const resumeMs = (12 * 60 + 5) * 1000;
    nextUpQuery = loaded([
      episode('e2', 2, {
        UserData: userData({PlaybackPositionTicks: resumeMs * TICKS_PER_MS}),
      }),
    ]);
    renderSeries();

    expect(actionKeys()).toEqual(['resume', 'play', 'watched', 'favorite']);
    expect(screen.getByText('Resume from 12:05')).toBeTruthy();
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

  it('labels Resume "Play next up" (androidtv) for a partly watched series whose next episode has no position', () => {
    renderSeries(
      series({
        UserData: userData({Played: false, PlayedPercentage: 40}),
      }),
    );

    expect(actionKeys()[0]).toBe('resume');
    expect(screen.getByText('Play next up')).toBeTruthy();
    expect(screen.queryByText('Resume from 0:00')).toBeNull();
    fireEvent.press(screen.getByTestId('details-actions-resume'));
    expect(navigate).toHaveBeenCalledWith('Player', {
      itemId: 'e2',
      title: 'Episode 2',
      startMs: 0,
    });
  });

  it('hides Resume for a finished series', () => {
    nextUpQuery = loaded([
      episode('e2', 2, {
        UserData: userData({PlaybackPositionTicks: 5000 * TICKS_PER_MS}),
      }),
    ]);
    renderSeries(
      series({UserData: userData({Played: true, PlayedPercentage: 100})}),
    );

    expect(screen.queryByTestId('details-actions-resume')).toBeNull();
    expect(preferred('play')).toBe(true);
  });

  it('with no next up, Play fetches and opens the first episode, skipping specials', async () => {
    nextUpQuery = loaded([]);
    (fetchSeasons as jest.Mock).mockResolvedValue([
      season('s0', 0),
      season('s1', 1),
      season('s2', 2),
    ]);
    (fetchSeasonEpisodes as jest.Mock).mockResolvedValue([
      episode('e1', 1),
      episode('e2', 2),
    ]);
    renderSeries(
      series({UserData: userData({Played: true, PlayedPercentage: 100})}),
    );

    expect(screen.queryByTestId('details-actions-resume')).toBeNull();
    expect(screen.queryByText('Next up')).toBeNull();
    fireEvent.press(screen.getByTestId('details-actions-play'));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('Player', {
        itemId: 'e1',
        title: 'Episode 1',
        startMs: 0,
      }),
    );
    expect(fetchSeasons).toHaveBeenCalledWith(api, 'u1', 'sr1');
    expect(fetchSeasonEpisodes).toHaveBeenCalledWith(api, 'u1', 'sr1', 's1');
  });

  it('plays from the specials when they are the only season', async () => {
    nextUpQuery = loaded([]);
    (fetchSeasons as jest.Mock).mockResolvedValue([season('s0', 0)]);
    (fetchSeasonEpisodes as jest.Mock).mockResolvedValue([episode('sp1', 1)]);
    renderSeries();

    fireEvent.press(screen.getByTestId('details-actions-play'));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        'Player',
        expect.objectContaining({itemId: 'sp1'}),
      ),
    );
    expect(fetchSeasonEpisodes).toHaveBeenCalledWith(api, 'u1', 'sr1', 's0');
  });

  it('does nothing when there is nothing to play', async () => {
    nextUpQuery = loaded([]);
    (fetchSeasons as jest.Mock).mockResolvedValue([season('s1', 1)]);
    (fetchSeasonEpisodes as jest.Mock).mockResolvedValue([]);
    renderSeries();

    fireEvent.press(screen.getByTestId('details-actions-play'));
    await waitFor(() => expect(fetchSeasonEpisodes).toHaveBeenCalled());
    await act(async () => {});
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does nothing when the series has no seasons or the fetch fails', async () => {
    nextUpQuery = loaded([]);
    (fetchSeasons as jest.Mock).mockResolvedValueOnce([]);
    renderSeries();

    fireEvent.press(screen.getByTestId('details-actions-play'));
    await waitFor(() => expect(fetchSeasons).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(fetchSeasonEpisodes).not.toHaveBeenCalled();

    queryClient.clear();
    (fetchSeasons as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    fireEvent.press(screen.getByTestId('details-actions-play'));
    await waitFor(() => expect(fetchSeasons).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores a second Play press while the first episode loads', async () => {
    nextUpQuery = loaded([]);
    let resolveSeasons: (seasons: BaseItemDto[]) => void = () => {};
    (fetchSeasons as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveSeasons = resolve;
      }),
    );
    (fetchSeasonEpisodes as jest.Mock).mockResolvedValue([episode('e1', 1)]);
    renderSeries();

    fireEvent.press(screen.getByTestId('details-actions-play'));
    fireEvent.press(screen.getByTestId('details-actions-play'));
    await act(async () => resolveSeasons([season('s1', 1)]));

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(fetchSeasons).toHaveBeenCalledTimes(1);
  });

  it("doesn't open the player when the page closed during the fetch", async () => {
    nextUpQuery = loaded([]);
    let resolveSeasons: (seasons: BaseItemDto[]) => void = () => {};
    (fetchSeasons as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveSeasons = resolve;
      }),
    );
    (fetchSeasonEpisodes as jest.Mock).mockResolvedValue([episode('e1', 1)]);
    renderSeries();

    fireEvent.press(screen.getByTestId('details-actions-play'));
    screen.unmount();
    await act(async () => resolveSeasons([season('s1', 1)]));
    await act(async () => {});
    expect(navigate).not.toHaveBeenCalled();
  });

  it('toggles watched and favorite', () => {
    renderSeries(
      series({UserData: userData({Played: true, IsFavorite: true})}),
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
    expect(useTogglePlayed).toHaveBeenCalledWith('sr1');
    expect(useToggleFavorite).toHaveBeenCalledWith('sr1');
  });

  it('hides empty rows', () => {
    nextUpQuery = loaded([]);
    seasonsQuery = loaded([]);
    similarQuery = loaded([]);
    renderSeries(series({People: []}));

    expect(screen.queryByText('Next up')).toBeNull();
    expect(screen.queryByTestId('row-seasons')).toBeNull();
    expect(screen.queryByText('Cast & crew')).toBeNull();
    expect(screen.queryByText('More like this')).toBeNull();
    expect(screen.getByTestId('details-series')).toBeTruthy();
  });

  it('hides errored or loading rows but keeps the page', () => {
    seasonsQuery = failed();
    similarQuery = pending();
    renderSeries();

    expect(screen.queryByTestId('row-seasons')).toBeNull();
    expect(screen.queryByText('More like this')).toBeNull();
    expect(screen.getByText('Next up')).toBeTruthy();
    expect(screen.getByText('Cast & crew')).toBeTruthy();

    seasonsQuery = loaded([season('s1', 1)]);
    similarQuery = failed();
    screen.rerender(ui(series()));
    expect(screen.getByTestId('row-seasons')).toBeTruthy();
    expect(screen.queryByText('More like this')).toBeNull();
  });

  it('pushes Details for next-up episodes, seasons and similar series', () => {
    renderSeries();

    fireEvent.press(screen.getByTestId('row-next-up-item-1'));
    expect(push).toHaveBeenLastCalledWith('Details', {
      itemId: 'e3',
      title: 'The Show S1 E3',
    });
    fireEvent.press(screen.getByTestId('row-seasons-item-1'));
    expect(push).toHaveBeenLastCalledWith('Details', {
      itemId: 's2',
      title: 'Season 2',
    });
    fireEvent.press(screen.getByTestId('row-similar-item-0'));
    expect(push).toHaveBeenLastCalledWith('Details', {
      itemId: 'x1',
      title: 'Other Show',
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('gives a person listed twice two cards and pushes Details with their id', () => {
    renderSeries();

    expect(
      within(screen.getByTestId('row-cast')).getAllByText('Jane Doe').length,
    ).toBeGreaterThanOrEqual(2);
    fireEvent.press(screen.getByTestId('row-cast-item-1'));
    expect(push).toHaveBeenCalledWith('Details', {
      itemId: 'p1',
      title: 'Jane Doe',
    });
  });
});

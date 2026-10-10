import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {act, fireEvent, render, screen} from '@testing-library/react-native';
import React from 'react';

import {createJellyfin} from '../src/api/client';
import {
  fetchLatest,
  type HomeSection,
  homeKeys,
  useHomeSections,
  useMyMedia,
  useNextUp,
  useResume,
} from '../src/api/home';
import {useSession} from '../src/auth/SessionContext';
import {BACKDROP_DELAY_MS, HomeScreen} from '../src/screens/HomeScreen';
import {sessionFor} from './auth/fakes';

jest.mock('../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

jest.mock('../src/api/home', () => ({
  ...jest.requireActual('../src/api/home'),
  useHomeSections: jest.fn(),
  useMyMedia: jest.fn(),
  useResume: jest.fn(),
  useNextUp: jest.fn(),
  fetchLatest: jest.fn(),
}));

let mockFocusEffect: (() => void) | undefined;
jest.mock('@amazon-devices/react-navigation__native', () => ({
  useFocusEffect: (effect: () => void) => {
    mockFocusEffect = effect;
  },
}));

const SERVER = 'https://jf.example.com';
const api = createJellyfin('device-1').createApi(SERVER, 'token-1');

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

const movie = (id: string, extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: id,
  Name: `Movie ${id}`,
  Type: BaseItemKind.Movie,
  ProductionYear: 2020,
  ...extra,
});

const library = (id: string, name: string, type: string): BaseItemDto => ({
  Id: id,
  Name: name,
  Type: BaseItemKind.CollectionFolder,
  CollectionType: type as BaseItemDto['CollectionType'],
});

const MOVIES = library('lib-movies', 'Movies', 'movies');
const SHOWS = library('lib-shows', 'Shows', 'tvshows');

let queries: {
  sections: Query<HomeSection[]>;
  myMedia: Query<BaseItemDto[]>;
  resume: Query<BaseItemDto[]>;
  nextUp: Query<BaseItemDto[]>;
};
let latestByLibrary: Record<string, BaseItemDto[]>;
let navigate: jest.Mock;
let client: QueryClient;

const renderHome = () => {
  render(
    <QueryClientProvider client={client}>
      <HomeScreen
        navigation={{navigate} as never}
        route={{key: 'Home', name: 'Home'} as never}
      />
    </QueryClientProvider>,
  );
};

const rowTitles = () =>
  screen
    .queryAllByTestId(/^row-(?!.*-(carousel|retry)$)[A-Za-z-]+$/)
    .map((row) => row.props.testID as string);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockFocusEffect = undefined;
  navigate = jest.fn();
  client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  queries = {
    sections: loaded<HomeSection[]>(['myMedia', 'resume', 'nextUp', 'latest']),
    myMedia: loaded([MOVIES, SHOWS]),
    resume: loaded([movie('r1')]),
    nextUp: loaded([movie('n1')]),
  };
  latestByLibrary = {
    'lib-movies': [movie('m1')],
    'lib-shows': [movie('s1')],
  };
  const session = sessionFor();
  session.api = api;
  (useSession as jest.Mock).mockReturnValue({session});
  (useHomeSections as jest.Mock).mockImplementation(() => queries.sections);
  (useMyMedia as jest.Mock).mockImplementation(() => queries.myMedia);
  (useResume as jest.Mock).mockImplementation(() => queries.resume);
  (useNextUp as jest.Mock).mockImplementation(() => queries.nextUp);
  (fetchLatest as jest.Mock).mockImplementation(
    async (_api: unknown, _userId: string, libraryId: string) =>
      latestByLibrary[libraryId] ?? [],
  );
});

afterEach(() => {
  client.clear();
});

describe('HomeScreen', () => {
  it('shows a spinner while the sections load', () => {
    queries.sections = pending();
    renderHome();

    expect(screen.getByTestId('home-loading')).toBeTruthy();
    expect(rowTitles()).toEqual([]);
  });

  it('shows the rows in the server order, with androidtv titles', async () => {
    queries.sections = loaded<HomeSection[]>([
      'latest',
      'nextUp',
      'myMedia',
      'resume',
    ]);
    renderHome();

    expect(await screen.findByText('Recently added in Shows')).toBeTruthy();
    expect(rowTitles()).toEqual([
      'row-latest-lib-movies',
      'row-latest-lib-shows',
      'row-nextUp',
      'row-myMedia',
      'row-resume',
    ]);
    expect(screen.getByText('Recently added in Movies')).toBeTruthy();
    expect(screen.getByText('Next up')).toBeTruthy();
    expect(screen.getByText('My media')).toBeTruthy();
    expect(screen.getByText('Continue watching')).toBeTruthy();
  });

  it('shows one Latest row per library, minus the excluded ones', async () => {
    const session = sessionFor();
    session.api = api;
    session.user.Configuration = {LatestItemsExcludes: ['lib-shows']};
    (useSession as jest.Mock).mockReturnValue({session});
    queries.sections = loaded<HomeSection[]>(['latest']);
    renderHome();

    expect(await screen.findByText('Recently added in Movies')).toBeTruthy();
    expect(screen.queryByText('Recently added in Shows')).toBeNull();
    expect(fetchLatest).toHaveBeenCalledWith(api, 'u1', 'lib-movies');
    expect(fetchLatest).not.toHaveBeenCalledWith(api, 'u1', 'lib-shows');
  });

  it('hides rows without items', async () => {
    queries.resume = loaded([]);
    latestByLibrary['lib-shows'] = [];
    renderHome();

    expect(await screen.findByText('Recently added in Movies')).toBeTruthy();
    expect(rowTitles()).toEqual([
      'row-myMedia',
      'row-nextUp',
      'row-latest-lib-movies',
    ]);
  });

  it('shows a failed row with a Retry that refetches it', () => {
    queries.sections = loaded<HomeSection[]>(['resume', 'nextUp']);
    queries.resume = failed();
    renderHome();

    expect(screen.getByText('Continue watching')).toBeTruthy();
    expect(screen.getByText("Couldn't load this row.")).toBeTruthy();
    fireEvent.press(screen.getByTestId('row-resume-retry'));
    expect(queries.resume.refetch).toHaveBeenCalled();
    expect(screen.getByTestId('row-nextUp-item-0')).toBeTruthy();
  });

  it('hides a row that fails with a 401', () => {
    queries.sections = loaded<HomeSection[]>(['resume', 'nextUp']);
    queries.resume = failed({
      isAxiosError: true,
      response: {status: 401},
    });
    renderHome();

    expect(screen.queryByText('Continue watching')).toBeNull();
    expect(screen.queryByTestId('row-resume-retry')).toBeNull();
    expect(screen.getByText('Next up')).toBeTruthy();
  });

  it('says so when every row is empty', () => {
    queries.sections = loaded<HomeSection[]>(['myMedia', 'resume', 'nextUp']);
    queries.myMedia = loaded([]);
    queries.resume = loaded([]);
    queries.nextUp = loaded([]);
    renderHome();

    expect(screen.getByTestId('home-empty')).toBeTruthy();
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it('keeps the spinner while no row has loaded yet', () => {
    queries.sections = loaded<HomeSection[]>(['resume', 'nextUp']);
    queries.resume = loaded([]);
    queries.nextUp = pending();
    renderHome();

    expect(screen.getByTestId('home-loading')).toBeTruthy();
    expect(screen.queryByTestId('home-empty')).toBeNull();
  });

  it('gives focus to the first row with items, once', () => {
    queries.sections = loaded<HomeSection[]>(['resume', 'nextUp']);
    queries.resume = pending();
    renderHome();

    const carouselFocus = (row: string) =>
      screen.UNSAFE_getByProps({uniqueId: row}).props.hasPreferredFocus;
    expect(carouselFocus('row-nextUp')).toBe(true);

    // Continue Watching loads later, above Next Up: focus stays put.
    queries.resume = loaded([movie('r1')]);
    screen.rerender(
      <QueryClientProvider client={client}>
        <HomeScreen
          navigation={{navigate} as never}
          route={{key: 'Home', name: 'Home'} as never}
        />
      </QueryClientProvider>,
    );
    expect(carouselFocus('row-resume')).toBe(false);
    expect(carouselFocus('row-nextUp')).toBe(true);
  });

  it('opens the details of a pressed card', () => {
    queries.sections = loaded<HomeSection[]>(['resume']);
    renderHome();

    fireEvent.press(screen.getByTestId('row-resume-item-0'));
    expect(navigate).toHaveBeenCalledWith('DetailsPlaceholder', {
      itemId: 'r1',
      title: 'Movie r1',
    });
  });

  it('shows the focused card backdrop once focus settles', () => {
    jest.useFakeTimers();
    queries.sections = loaded<HomeSection[]>(['resume']);
    queries.resume = loaded([
      movie('r1', {BackdropImageTags: ['bd1']}),
      movie('r2', {BackdropImageTags: ['bd2']}),
      movie('r3'),
    ]);
    renderHome();
    const backdrop = () =>
      screen.queryByTestId('backdrop-image', {includeHiddenElements: true})
        ?.props.source.uri as string | undefined;

    fireEvent(screen.getByTestId('row-resume-item-0'), 'focus');
    act(() => jest.advanceTimersByTime(BACKDROP_DELAY_MS - 1));
    fireEvent(screen.getByTestId('row-resume-item-1'), 'focus');
    act(() => jest.advanceTimersByTime(BACKDROP_DELAY_MS - 1));
    // Moving on before it settles loads nothing.
    expect(backdrop()).toBeUndefined();

    act(() => jest.advanceTimersByTime(1));
    expect(backdrop()).toContain('/Items/r2/Images/Backdrop');

    // A card without a backdrop clears it.
    fireEvent(screen.getByTestId('row-resume-item-2'), 'focus');
    act(() => jest.advanceTimersByTime(BACKDROP_DELAY_MS + 1000));
    expect(backdrop()).toBeUndefined();
  });

  it('refetches stale Home queries when Home regains focus', () => {
    const refetch = jest
      .spyOn(client, 'refetchQueries')
      .mockResolvedValue(undefined);
    renderHome();

    act(() => mockFocusEffect?.());
    expect(refetch).not.toHaveBeenCalled();

    act(() => mockFocusEffect?.());
    expect(refetch).toHaveBeenCalledWith(
      {queryKey: homeKeys.all('srv1', 'u1'), type: 'active', stale: true},
      {cancelRefetch: false},
    );
  });
});

import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {PersonKind} from '@jellyfin/sdk/lib/generated-client/models/person-kind';
import type {UserItemDataDto} from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';
import {fireEvent, render, screen, within} from '@testing-library/react-native';
import React from 'react';
import {Image} from 'react-native';

import {createJellyfin} from '../../src/api/client';
import {useToggleFavorite, useTogglePlayed} from '../../src/api/details';
import {useNextEpisodes, usePreviousEpisode} from '../../src/api/tvDetails';
import {useSession} from '../../src/auth/SessionContext';
import {EpisodeDetails} from '../../src/screens/details/EpisodeDetails';
import {sessionFor} from '../auth/fakes';

jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

jest.mock('../../src/api/details', () => ({
  useToggleFavorite: jest.fn(),
  useTogglePlayed: jest.fn(),
}));

jest.mock('../../src/api/tvDetails', () => ({
  usePreviousEpisode: jest.fn(),
  useNextEpisodes: jest.fn(),
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

const TICKS_PER_MS = 10000;

const flatStyle = (style: unknown): {width?: number; height?: number} =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const userData = (data: Omit<UserItemDataDto, 'Key'>): UserItemDataDto => ({
  Key: 'e2',
  ...data,
});

const episode = (extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: 'e2',
  Name: 'The Episode',
  Type: BaseItemKind.Episode,
  SeriesId: 'series-1',
  SeriesName: 'Lost',
  SeasonId: 'season-1',
  ParentIndexNumber: 1,
  IndexNumber: 2,
  PremiereDate: '2004-09-29T12:00:00Z',
  Overview: 'Things happen.',
  RunTimeTicks: 42 * 60000 * TICKS_PER_MS,
  ImageTags: {Primary: 'still-tag'},
  ParentBackdropItemId: 'series-1',
  ParentBackdropImageTags: ['series-backdrop'],
  UserData: userData({
    Played: false,
    IsFavorite: false,
    PlaybackPositionTicks: 0,
  }),
  People: [
    {Id: 'p1', Name: 'Main Actor', Role: 'Jack', Type: PersonKind.Actor},
    {Id: 'p2', Name: 'Guest One', Role: 'Pilot', Type: PersonKind.GuestStar},
    {Id: 'p3', Name: 'The Director', Type: PersonKind.Director},
    {Id: 'p4', Name: 'Guest Two', Type: PersonKind.GuestStar},
  ],
  ...extra,
});

let previousQuery: Query<BaseItemDto | null>;
let nextQuery: Query<BaseItemDto[]>;
let favorite: {toggle: jest.Mock; isPending: boolean};
let played: {toggle: jest.Mock; isPending: boolean};
let push: jest.Mock;
let navigate: jest.Mock;

const page = (item: BaseItemDto) => (
  <EpisodeDetails item={item} navigation={{push, navigate} as never} />
);

const renderEpisode = (item: BaseItemDto = episode()) => render(page(item));

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
  previousQuery = loaded({Id: 'e1', Name: 'Pilot', Type: BaseItemKind.Episode});
  nextQuery = loaded([
    {
      Id: 'e3',
      Name: 'Third',
      Type: BaseItemKind.Episode,
      SeriesName: 'Lost',
      ParentIndexNumber: 1,
      IndexNumber: 3,
      ImageTags: {Primary: 'e3-still'},
    },
    {
      Id: 'e4',
      Name: 'Fourth',
      Type: BaseItemKind.Episode,
      SeriesName: 'Lost',
      ParentIndexNumber: 1,
      IndexNumber: 4,
    },
  ]);
  favorite = {toggle: jest.fn(), isPending: false};
  played = {toggle: jest.fn(), isPending: false};
  const session = sessionFor();
  session.api = api;
  (useSession as jest.Mock).mockReturnValue({session});
  (usePreviousEpisode as jest.Mock).mockImplementation(() => previousQuery);
  (useNextEpisodes as jest.Mock).mockImplementation(() => nextQuery);
  (useToggleFavorite as jest.Mock).mockImplementation(() => favorite);
  (useTogglePlayed as jest.Mock).mockImplementation(() => played);
});

describe('EpisodeDetails', () => {
  it('renders the titles, the wide still, the info and the series backdrop', () => {
    renderEpisode();

    expect(screen.getByTestId('details-episode')).toBeTruthy();
    expect(screen.getByText('The Episode')).toBeTruthy();
    expect(screen.getByText('Lost S1 E2')).toBeTruthy();
    expect(screen.getByText('S1:E2')).toBeTruthy();
    expect(screen.getByText('Things happen.')).toBeTruthy();
    expect(screen.getByText('Directed by')).toBeTruthy();
    expect(screen.getByText('42m')).toBeTruthy();
    const poster = screen.getByTestId('details-header-poster');
    expect(poster.props.source.uri).toMatch(
      /\/Items\/e2\/Images\/Primary\?.*tag=still-tag/,
    );
    // The wide (16:9) frame: wider than tall.
    const frame = flatStyle(
      screen.getByTestId('details-header-poster-frame').props.style,
    );
    expect(frame.width).toBeGreaterThan(frame.height ?? Infinity);
    expect(
      screen.getByTestId('backdrop-image', {includeHiddenElements: true}).props
        .source.uri,
    ).toMatch(/\/Items\/series-1\/Images\/Backdrop\?tag=series-backdrop/);
    expect(usePreviousEpisode).toHaveBeenCalledWith(
      expect.objectContaining({Id: 'e2'}),
    );
    expect(useNextEpisodes).toHaveBeenCalledWith(
      expect.objectContaining({Id: 'e2'}),
    );
  });

  it("prefers the episode's own backdrop", () => {
    renderEpisode(episode({BackdropImageTags: ['own-backdrop']}));

    expect(
      screen.getByTestId('backdrop-image', {includeHiddenElements: true}).props
        .source.uri,
    ).toMatch(/\/Items\/e2\/Images\/Backdrop\?tag=own-backdrop/);
  });

  it("shows androidtv's buttons in order, Play focused", () => {
    renderEpisode();

    expect(actionKeys()).toEqual([
      'play',
      'watched',
      'favorite',
      'previous',
      'series',
    ]);
    expect(screen.getByText('Previous episode')).toBeTruthy();
    expect(screen.getByText('Go to series')).toBeTruthy();
    expect(preferred('play')).toBe(true);
  });

  it('shows Resume first, focused, when there is a resume point', () => {
    const resumeMs = (12 * 60 + 5) * 1000;
    renderEpisode(
      episode({
        UserData: userData({
          Played: false,
          PlaybackPositionTicks: resumeMs * TICKS_PER_MS,
        }),
      }),
    );

    expect(actionKeys()[0]).toBe('resume');
    expect(screen.getByText('Resume from 12:05')).toBeTruthy();
    expect(preferred('resume')).toBe(true);
    expect(preferred('play')).toBe(false);

    fireEvent.press(screen.getByTestId('details-actions-resume'));
    expect(navigate).toHaveBeenCalledWith('Player', {
      itemId: 'e2',
      title: 'The Episode',
      startMs: resumeMs,
    });
  });

  it('Play opens the player from the start', () => {
    renderEpisode();

    fireEvent.press(screen.getByTestId('details-actions-play'));
    expect(navigate).toHaveBeenCalledWith('Player', {
      itemId: 'e2',
      title: 'The Episode',
      startMs: 0,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('toggles watched and favorite', () => {
    renderEpisode(episode({UserData: userData({Played: true})}));

    expect(
      screen.getByTestId('details-actions-watched').props.accessibilityState,
    ).toEqual(expect.objectContaining({selected: true}));
    fireEvent.press(screen.getByTestId('details-actions-watched'));
    expect(played.toggle).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('details-actions-favorite'));
    expect(favorite.toggle).toHaveBeenCalledTimes(1);
    expect(useTogglePlayed).toHaveBeenCalledWith('e2');
    expect(useToggleFavorite).toHaveBeenCalledWith('e2');
  });

  it('Previous episode pushes the previous episode', () => {
    renderEpisode();

    fireEvent.press(screen.getByTestId('details-actions-previous'));
    expect(push).toHaveBeenCalledWith('Details', {
      itemId: 'e1',
      title: 'Pilot',
    });
  });

  it('hides Previous episode without one, while loading or on error', () => {
    for (const query of [loaded(null), pending(), failed()]) {
      previousQuery = query as Query<BaseItemDto | null>;
      renderEpisode();
      expect(screen.queryByTestId('details-actions-previous')).toBeNull();
      expect(actionKeys()).toEqual(['play', 'watched', 'favorite', 'series']);
      screen.unmount();
    }
  });

  it("doesn't move focus when Previous episode shows up later", () => {
    previousQuery = pending();
    renderEpisode();
    expect(preferred('play')).toBe(true);

    previousQuery = loaded({Id: 'e1', Name: 'Pilot'});
    screen.rerender(page(episode()));
    expect(screen.getByTestId('details-actions-previous')).toBeTruthy();
    expect(preferred('play')).toBe(true);
    expect(preferred('previous')).toBe(false);
  });

  it('Go to series pushes the series, and hides without a series id', () => {
    renderEpisode();
    fireEvent.press(screen.getByTestId('details-actions-series'));
    expect(push).toHaveBeenCalledWith('Details', {
      itemId: 'series-1',
      title: 'Lost',
    });
    screen.unmount();

    renderEpisode(episode({SeriesId: undefined}));
    expect(screen.queryByTestId('details-actions-series')).toBeNull();
  });

  it('shows the next episodes as landscape cards and opens them', () => {
    renderEpisode();

    const row = screen.getByTestId('row-next-episodes');
    expect(within(row).getByText('Next episodes')).toBeTruthy();
    expect(within(row).getAllByText('Third').length).toBeGreaterThan(0);
    const card = screen.getByTestId('row-next-episodes-item-0');
    const frame = flatStyle(
      screen.getByTestId('row-next-episodes-item-0-frame').props.style,
    );
    expect(frame.width).toBeGreaterThan(frame.height ?? Infinity);
    expect(within(card).UNSAFE_getByType(Image).props.source.uri).toMatch(
      /\/Items\/e3\/Images\/Primary\?.*tag=e3-still/,
    );

    fireEvent.press(screen.getByTestId('row-next-episodes-item-1'));
    expect(push).toHaveBeenCalledWith('Details', {
      itemId: 'e4',
      title: expect.any(String),
    });
  });

  it('hides Next episodes when empty, loading or failed', () => {
    for (const query of [loaded([]), pending(), failed()]) {
      nextQuery = query as Query<BaseItemDto[]>;
      renderEpisode();
      expect(screen.queryByText('Next episodes')).toBeNull();
      expect(screen.getByText('Guest stars')).toBeTruthy();
      screen.unmount();
    }
  });

  it('shows only the guest stars, and opens their page', () => {
    renderEpisode();

    const row = screen.getByTestId('row-guest-stars');
    expect(within(row).getAllByText('Guest One').length).toBeGreaterThan(0);
    expect(within(row).getAllByText('Guest Two').length).toBeGreaterThan(0);
    expect(within(row).queryByText('Main Actor')).toBeNull();
    expect(within(row).queryByText('The Director')).toBeNull();

    fireEvent.press(screen.getByTestId('row-guest-stars-item-1'));
    expect(push).toHaveBeenCalledWith('Details', {
      itemId: 'p4',
      title: 'Guest Two',
    });
  });

  it('gives a guest star listed twice two cards', () => {
    renderEpisode(
      episode({
        People: [
          {Id: 'p2', Name: 'Guest One', Type: PersonKind.GuestStar},
          {Id: 'p2', Name: 'Guest One', Type: PersonKind.GuestStar},
        ],
      }),
    );

    expect(screen.getByTestId('row-guest-stars-item-0')).toBeTruthy();
    expect(screen.getByTestId('row-guest-stars-item-1')).toBeTruthy();
  });

  it('hides Guest stars when there are none', () => {
    renderEpisode(
      episode({People: [{Id: 'p1', Name: 'Main', Type: PersonKind.Actor}]}),
    );

    expect(screen.queryByText('Guest stars')).toBeNull();
    expect(screen.getByText('Next episodes')).toBeTruthy();
  });
});

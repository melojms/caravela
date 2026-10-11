import type {DisplayPreferencesDto} from '@jellyfin/sdk/lib/generated-client/models/display-preferences-dto';
import {getDisplayPreferenceApi} from '@jellyfin/sdk/lib/utils/api/display-preference-api';
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {act, renderHook, waitFor} from '@testing-library/react-native';
import React, {type ReactNode} from 'react';

import {libraryKeys} from '../../src/api/library';
import {
  fetchLibraryDisplayPrefs,
  kotlinEnumName,
  LIBRARY_PREFS_CLIENT,
  mergeLibraryPrefs,
  parseLibraryPrefs,
  useLibraryPrefs,
  useSaveLibraryPrefs,
} from '../../src/api/libraryPrefs';
import {
  DEFAULT_LIBRARY_PREFS,
  LIBRARY_SORT_OPTIONS,
  type LibraryPrefs,
} from '../../src/api/libraryTypes';
import {useSession} from '../../src/auth/SessionContext';
import {sessionFor} from '../auth/fakes';

jest.mock('@jellyfin/sdk/lib/utils/api/display-preference-api', () => ({
  getDisplayPreferenceApi: jest.fn(),
}));
jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

const displayPreferenceApi = {
  getDisplayPreferences: jest.fn(),
  updateDisplayPreferences: jest.fn(),
};

const session = sessionFor();
const {api} = session;
const SERVER_ID = session.server.id;
const PREFS_KEY = libraryKeys.prefs(SERVER_ID, 'u1', 'dp1');

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: {status},
  });

// What androidtv saved: its Kotlin enum names and lowercase booleans.
const ANDROIDTV_DTO: DisplayPreferencesDto = {
  Id: 'dp1',
  Client: 'jellyfin-androidtv',
  SortBy: 'SortName',
  RememberSorting: false,
  ShowBackdrop: true,
  CustomPrefs: {
    SortBy: 'DATE_CREATED',
    SortOrder: 'DESCENDING',
    FilterFavoritesOnly: 'true',
    FilterUnwatchedOnly: 'false',
    PosterSize: 'MED',
  },
};

const BY_RUNTIME: LibraryPrefs = {
  sortBy: 'Runtime',
  sortOrder: 'Ascending',
  filters: {unwatchedOnly: true, favoritesOnly: false},
};

let client: QueryClient;
let onMutationError: jest.Mock;

const wrapper = ({children}: {children: ReactNode}) =>
  React.createElement(QueryClientProvider, {client}, children);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (getDisplayPreferenceApi as jest.Mock).mockReturnValue(displayPreferenceApi);
  (useSession as jest.Mock).mockReturnValue({session});
  onMutationError = jest.fn();
  client = new QueryClient({
    mutationCache: new MutationCache({onError: onMutationError}),
    defaultOptions: {
      queries: {retry: false, gcTime: Infinity},
      mutations: {retry: false, gcTime: Infinity},
    },
  });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe('kotlinEnumName', () => {
  it.each([
    ['SortName', 'SORT_NAME'],
    ['DateCreated', 'DATE_CREATED'],
    ['SeriesDatePlayed', 'SERIES_DATE_PLAYED'],
    ['DateLastContentAdded', 'DATE_LAST_CONTENT_ADDED'],
    ['Ascending', 'ASCENDING'],
  ])('%s is %s', (value, name) => {
    expect(kotlinEnumName(value)).toBe(name);
  });
});

describe('parseLibraryPrefs', () => {
  it('uses the defaults without prefs', () => {
    expect(parseLibraryPrefs(undefined, 'movies')).toEqual(
      DEFAULT_LIBRARY_PREFS,
    );
    expect(parseLibraryPrefs(null, 'tvshows')).toEqual(DEFAULT_LIBRARY_PREFS);
    expect(parseLibraryPrefs({}, 'movies')).toEqual(DEFAULT_LIBRARY_PREFS);
  });

  it('reads the values androidtv writes', () => {
    expect(parseLibraryPrefs(ANDROIDTV_DTO.CustomPrefs, 'movies')).toEqual({
      sortBy: 'DateCreated',
      sortOrder: 'Descending',
      filters: {unwatchedOnly: false, favoritesOnly: true},
    });
  });

  it('reads API-spelled sorts', () => {
    expect(
      parseLibraryPrefs({SortBy: 'SeriesDatePlayed'}, 'tvshows'),
    ).toMatchObject({sortBy: 'SeriesDatePlayed', sortOrder: 'Descending'});
  });

  it.each(['movies', 'tvshows'] as const)(
    'reads every %s sort in both spellings',
    (kind) => {
      for (const option of LIBRARY_SORT_OPTIONS[kind]) {
        for (const stored of [option.sortBy, kotlinEnumName(option.sortBy)]) {
          expect(parseLibraryPrefs({SortBy: stored}, kind)).toMatchObject({
            sortBy: option.sortBy,
            sortOrder: option.sortOrder,
          });
        }
      }
    },
  );

  it('takes the order from the sort option, not the stored one', () => {
    expect(
      parseLibraryPrefs(
        {SortBy: 'SORT_NAME', SortOrder: 'DESCENDING'},
        'movies',
      ),
    ).toMatchObject({sortBy: 'SortName', sortOrder: 'Ascending'});
  });

  it('uses the default sort for an unknown one or one from the other kind', () => {
    const defaults = {sortBy: 'SortName', sortOrder: 'Ascending'};
    expect(parseLibraryPrefs({SortBy: 'RANDOM'}, 'movies')).toMatchObject(
      defaults,
    );
    expect(parseLibraryPrefs({SortBy: 'sort_name'}, 'movies')).toMatchObject(
      defaults,
    );
    expect(parseLibraryPrefs({SortBy: 'RUNTIME'}, 'tvshows')).toMatchObject(
      defaults,
    );
    expect(
      parseLibraryPrefs({SortBy: 'DATE_LAST_CONTENT_ADDED'}, 'movies'),
    ).toMatchObject(defaults);
  });

  it('reads booleans', () => {
    const parse = (value: string | null) =>
      parseLibraryPrefs(
        {FilterUnwatchedOnly: value, FilterFavoritesOnly: value},
        'movies',
      ).filters;
    expect(parse('true')).toEqual({unwatchedOnly: true, favoritesOnly: true});
    expect(parse('True')).toEqual({unwatchedOnly: true, favoritesOnly: true});
    expect(parse('false')).toEqual({
      unwatchedOnly: false,
      favoritesOnly: false,
    });
    expect(parse('yes')).toEqual({unwatchedOnly: false, favoritesOnly: false});
    expect(parse(null)).toEqual({unwatchedOnly: false, favoritesOnly: false});
  });
});

describe('mergeLibraryPrefs', () => {
  it('writes androidtv spellings and keeps other keys', () => {
    expect(mergeLibraryPrefs(ANDROIDTV_DTO.CustomPrefs, BY_RUNTIME)).toEqual({
      SortBy: 'RUNTIME',
      SortOrder: 'ASCENDING',
      FilterFavoritesOnly: 'false',
      FilterUnwatchedOnly: 'true',
      PosterSize: 'MED',
    });
  });
});

describe('fetchLibraryDisplayPrefs', () => {
  it('reads the androidtv client prefs for the library', async () => {
    displayPreferenceApi.getDisplayPreferences.mockResolvedValue({
      data: ANDROIDTV_DTO,
    });
    await expect(fetchLibraryDisplayPrefs(api, 'u1', 'dp1')).resolves.toBe(
      ANDROIDTV_DTO,
    );
    expect(displayPreferenceApi.getDisplayPreferences).toHaveBeenCalledWith({
      displayPreferencesId: 'dp1',
      client: 'jellyfin-androidtv',
      userId: 'u1',
    });
    expect(LIBRARY_PREFS_CLIENT).toBe('jellyfin-androidtv');
  });

  it('falls back to empty prefs when the read fails', async () => {
    displayPreferenceApi.getDisplayPreferences.mockRejectedValue(
      httpError(500),
    );
    const dto = await fetchLibraryDisplayPrefs(api, 'u1', 'dp1');
    expect(dto.CustomPrefs).toEqual({});
    expect(parseLibraryPrefs(dto.CustomPrefs, 'movies')).toEqual(
      DEFAULT_LIBRARY_PREFS,
    );
  });

  it('rethrows a 401', async () => {
    const error = httpError(401);
    displayPreferenceApi.getDisplayPreferences.mockRejectedValue(error);
    await expect(fetchLibraryDisplayPrefs(api, 'u1', 'dp1')).rejects.toBe(
      error,
    );
  });
});

describe('useLibraryPrefs', () => {
  it('parses the cached prefs for the library kind', async () => {
    displayPreferenceApi.getDisplayPreferences.mockResolvedValue({
      data: ANDROIDTV_DTO,
    });
    const {result} = renderHook(() => useLibraryPrefs('dp1', 'movies'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(
      parseLibraryPrefs(ANDROIDTV_DTO.CustomPrefs, 'movies'),
    );
    expect(client.getQueryData(PREFS_KEY)).toBe(ANDROIDTV_DTO);
  });

  it('shows the defaults when the read fails', async () => {
    displayPreferenceApi.getDisplayPreferences.mockRejectedValue(
      httpError(500),
    );
    const {result} = renderHook(() => useLibraryPrefs('dp1', 'movies'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(DEFAULT_LIBRARY_PREFS);
  });

  it('errors on a 401', async () => {
    displayPreferenceApi.getDisplayPreferences.mockRejectedValue(
      httpError(401),
    );
    const {result} = renderHook(() => useLibraryPrefs('dp1', 'movies'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('does nothing without an id or session', async () => {
    renderHook(() => useLibraryPrefs('', 'movies'), {wrapper});
    (useSession as jest.Mock).mockReturnValue({session: undefined});
    renderHook(() => useLibraryPrefs('dp1', 'movies'), {wrapper});
    await act(async () => {});
    expect(displayPreferenceApi.getDisplayPreferences).not.toHaveBeenCalled();
  });
});

describe('useSaveLibraryPrefs', () => {
  const renderSave = async () => {
    displayPreferenceApi.getDisplayPreferences.mockResolvedValue({
      data: ANDROIDTV_DTO,
    });
    const {result} = renderHook(
      () => ({
        prefs: useLibraryPrefs('dp1', 'movies'),
        save: useSaveLibraryPrefs('dp1', 'movies'),
      }),
      {wrapper},
    );
    await waitFor(() => expect(result.current.prefs.isSuccess).toBe(true));
    return result;
  };

  it('sends the whole DTO with the merged prefs to the androidtv client', async () => {
    displayPreferenceApi.updateDisplayPreferences.mockResolvedValue({});
    const result = await renderSave();

    await act(() => result.current.save.mutateAsync(BY_RUNTIME));

    expect(displayPreferenceApi.updateDisplayPreferences).toHaveBeenCalledWith({
      displayPreferencesId: 'dp1',
      client: 'jellyfin-androidtv',
      userId: 'u1',
      displayPreferencesDto: {
        ...ANDROIDTV_DTO,
        CustomPrefs: {
          SortBy: 'RUNTIME',
          SortOrder: 'ASCENDING',
          FilterFavoritesOnly: 'false',
          FilterUnwatchedOnly: 'true',
          PosterSize: 'MED',
        },
      },
    });
  });

  it('updates the cached prefs before the server answers', async () => {
    let finish!: () => void;
    displayPreferenceApi.updateDisplayPreferences.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const result = await renderSave();

    act(() => result.current.save.mutate(BY_RUNTIME));

    await waitFor(() => expect(result.current.prefs.data).toEqual(BY_RUNTIME));
    expect(result.current.save.isPending).toBe(true);
    await act(async () => finish());
    await waitFor(() => expect(result.current.save.isSuccess).toBe(true));
  });

  it('keeps the local choice and reports no error when the save fails', async () => {
    displayPreferenceApi.updateDisplayPreferences.mockRejectedValue(
      httpError(500),
    );
    const result = await renderSave();

    await act(() => result.current.save.mutateAsync(BY_RUNTIME));

    await waitFor(() => expect(result.current.prefs.data).toEqual(BY_RUNTIME));
    expect(result.current.save.isError).toBe(false);
    expect(onMutationError).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it('passes a 401 to the client handler and keeps the local choice', async () => {
    const error = httpError(401);
    displayPreferenceApi.updateDisplayPreferences.mockRejectedValue(error);
    const result = await renderSave();

    await act(async () => {
      await result.current.save.mutateAsync(BY_RUNTIME).catch(() => undefined);
    });

    expect(onMutationError).toHaveBeenCalledWith(
      error,
      BY_RUNTIME,
      undefined,
      expect.anything(),
      expect.anything(),
    );
    await waitFor(() => expect(result.current.prefs.data).toEqual(BY_RUNTIME));
  });

  it('saves to an empty DTO when nothing was read', async () => {
    displayPreferenceApi.updateDisplayPreferences.mockResolvedValue({});
    const {result} = renderHook(() => useSaveLibraryPrefs('dp1', 'movies'), {
      wrapper,
    });

    await act(() => result.current.mutateAsync(BY_RUNTIME));

    const {displayPreferencesDto} =
      displayPreferenceApi.updateDisplayPreferences.mock.calls[0][0];
    expect(displayPreferencesDto).toMatchObject({
      SortOrder: 'Ascending',
      ScrollDirection: 'Horizontal',
      CustomPrefs: mergeLibraryPrefs({}, BY_RUNTIME),
    });
  });
});

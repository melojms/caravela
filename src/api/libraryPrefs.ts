import type {Api} from '@jellyfin/sdk';
import type {DisplayPreferencesDto} from '@jellyfin/sdk/lib/generated-client/models/display-preferences-dto';
import {ScrollDirection} from '@jellyfin/sdk/lib/generated-client/models/scroll-direction';
import {SortOrder} from '@jellyfin/sdk/lib/generated-client/models/sort-order';
import {getDisplayPreferenceApi} from '@jellyfin/sdk/lib/utils/api/display-preference-api';
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {useCallback} from 'react';

import {useSession} from '../auth/SessionContext';
import {isUnauthorized} from './home';
import {libraryKeys} from './library';
import {
  DEFAULT_LIBRARY_PREFS,
  LIBRARY_SORT_OPTIONS,
  type LibraryKind,
  type LibraryPrefs,
} from './libraryTypes';

/** The client androidtv's LibraryPreferences use, so both apps share them. */
export const LIBRARY_PREFS_CLIENT = 'jellyfin-androidtv';

// androidtv's LibraryPreferences keys.
const SORT_BY = 'SortBy';
const SORT_ORDER = 'SortOrder';
const FAVORITES_ONLY = 'FilterFavoritesOnly';
const UNWATCHED_ONLY = 'FilterUnwatchedOnly';

type CustomPrefs = Record<string, string | null>;

// androidtv's DisplayPreferencesDto.empty(), for a library without prefs.
const EMPTY_DTO: DisplayPreferencesDto = {
  PrimaryImageHeight: 0,
  PrimaryImageWidth: 0,
  CustomPrefs: {},
  RememberIndexing: false,
  ScrollDirection: ScrollDirection.Horizontal,
  RememberSorting: false,
  ShowBackdrop: false,
  ShowSidebar: false,
  SortOrder: SortOrder.Ascending,
};

/**
 * The Kotlin enum name androidtv stores for an API value: `SortName` is
 * `SORT_NAME`, `Ascending` is `ASCENDING`.
 */
export const kotlinEnumName = (value: string): string =>
  value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

const readBoolean = (value?: string | null): boolean =>
  value?.trim().toLowerCase() === 'true';

/**
 * A library's prefs from its `CustomPrefs`. The sort is read in androidtv's
 * spelling (`SORT_NAME`) or the API's (`SortName`); a missing or unknown one
 * takes the default. The order always comes from the sort option, like
 * androidtv.
 */
export function parseLibraryPrefs(
  customPrefs: CustomPrefs | null | undefined,
  kind: LibraryKind,
): LibraryPrefs {
  const stored = customPrefs?.[SORT_BY]?.trim();
  const option = stored
    ? LIBRARY_SORT_OPTIONS[kind].find(
        ({sortBy}) => sortBy === stored || kotlinEnumName(sortBy) === stored,
      )
    : undefined;
  return {
    sortBy: option?.sortBy ?? DEFAULT_LIBRARY_PREFS.sortBy,
    sortOrder: option?.sortOrder ?? DEFAULT_LIBRARY_PREFS.sortOrder,
    filters: {
      unwatchedOnly: readBoolean(customPrefs?.[UNWATCHED_ONLY]),
      favoritesOnly: readBoolean(customPrefs?.[FAVORITES_ONLY]),
    },
  };
}

/** `CustomPrefs` with the library's prefs written the way androidtv writes them; other keys are kept. */
export function mergeLibraryPrefs(
  customPrefs: CustomPrefs | null | undefined,
  prefs: LibraryPrefs,
): CustomPrefs {
  return {
    ...customPrefs,
    [SORT_BY]: kotlinEnumName(prefs.sortBy),
    [SORT_ORDER]: kotlinEnumName(prefs.sortOrder),
    [FAVORITES_ONLY]: String(prefs.filters.favoritesOnly),
    [UNWATCHED_ONLY]: String(prefs.filters.unwatchedOnly),
  };
}

/**
 * A library's display preferences. When they can't be read, the grid still
 * shows with the defaults; only a 401 is rethrown, like `fetchHomeSections`.
 */
export async function fetchLibraryDisplayPrefs(
  api: Api,
  userId: string,
  displayPreferencesId: string,
): Promise<DisplayPreferencesDto> {
  try {
    const {data} = await getDisplayPreferenceApi(api).getDisplayPreferences({
      displayPreferencesId,
      client: LIBRARY_PREFS_CLIENT,
      userId,
    });
    return data;
  } catch (error) {
    if (isUnauthorized(error)) {
      throw error;
    }
    return EMPTY_DTO;
  }
}

/** Saves a library's display preferences. */
export async function saveLibraryDisplayPrefs(
  api: Api,
  userId: string,
  displayPreferencesId: string,
  displayPreferencesDto: DisplayPreferencesDto,
): Promise<void> {
  await getDisplayPreferenceApi(api).updateDisplayPreferences({
    displayPreferencesId,
    client: LIBRARY_PREFS_CLIENT,
    userId,
    displayPreferencesDto,
  });
}

const useSessionScope = () => {
  const {session} = useSession();
  return {
    serverId: session?.server.id ?? '',
    userId: session?.user.Id ?? '',
    api: session?.api,
  };
};

/** The saved sort and filters of a library; disabled when nobody is signed in or there's no id. */
export function useLibraryPrefs(
  displayPreferencesId: string,
  kind: LibraryKind,
) {
  const {serverId, userId, api} = useSessionScope();
  const select = useCallback(
    (dto: DisplayPreferencesDto) => parseLibraryPrefs(dto.CustomPrefs, kind),
    [kind],
  );
  return useQuery({
    queryKey: libraryKeys.prefs(serverId, userId, displayPreferencesId),
    queryFn:
      api && displayPreferencesId
        ? () => fetchLibraryDisplayPrefs(api, userId, displayPreferencesId)
        : skipToken,
    select,
  });
}

/**
 * Saves a library's sort and filters. The cached prefs change first, so the
 * grid re-queries at once; then the whole DTO from the last read goes to the
 * server with the merged `CustomPrefs`. A failed save keeps the local choice
 * and isn't reported, like androidtv; a 401 still expires the session.
 */
export function useSaveLibraryPrefs(
  displayPreferencesId: string,
  // The prefs are stored the same way for every kind; kept for symmetry with useLibraryPrefs.
  _kind: LibraryKind,
) {
  const queryClient = useQueryClient();
  const {serverId, userId, api} = useSessionScope();
  const prefsKey = libraryKeys.prefs(serverId, userId, displayPreferencesId);

  return useMutation<void, Error, LibraryPrefs>({
    onMutate: async (prefs) => {
      await queryClient.cancelQueries({queryKey: prefsKey});
      queryClient.setQueryData<DisplayPreferencesDto>(prefsKey, (dto) => {
        const base = dto ?? EMPTY_DTO;
        return {
          ...base,
          CustomPrefs: mergeLibraryPrefs(base.CustomPrefs, prefs),
        };
      });
    },
    mutationFn: async () => {
      // onMutate has run: the cache holds the DTO to send.
      const dto = queryClient.getQueryData<DisplayPreferencesDto>(prefsKey);
      if (!api || !displayPreferencesId || !dto) {
        return;
      }
      try {
        await saveLibraryDisplayPrefs(api, userId, displayPreferencesId, dto);
      } catch (error) {
        if (isUnauthorized(error)) {
          throw error;
        }
        console.warn('Saving the library preferences failed', error);
      }
    },
  });
}

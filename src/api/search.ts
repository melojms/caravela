import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {getLibraryApi} from '@jellyfin/sdk/lib/utils/api/library-api';
import {
  type QueryClient,
  skipToken,
  useQueries,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import {useSession} from '../auth/SessionContext';
import {BROWSE_FIELDS} from './home';

/** Items per search row (androidtv's SearchRepository). */
export const SEARCH_LIMIT = 25;

export type SearchGroupKey = 'movies' | 'shows' | 'episodes';

export type SearchGroup = {
  key: SearchGroupKey;
  title: string;
  kind: BaseItemKind;
};

/** The search rows, in screen order. */
export const SEARCH_GROUPS: readonly SearchGroup[] = [
  {key: 'movies', title: 'Movies', kind: BaseItemKind.Movie},
  {key: 'shows', title: 'Shows', kind: BaseItemKind.Series},
  {key: 'episodes', title: 'Episodes', kind: BaseItemKind.Episode},
];

/** Up to 25 items of one kind matching the term, from every library. */
export async function fetchSearch(
  api: Api,
  userId: string,
  term: string,
  kind: BaseItemKind,
): Promise<BaseItemDto[]> {
  const {data} = await getLibraryApi(api).getItems({
    userId,
    searchTerm: term,
    includeItemTypes: [kind],
    limit: SEARCH_LIMIT,
    recursive: true,
    imageTypeLimit: 1,
    fields: BROWSE_FIELDS,
    enableTotalRecordCount: false,
  });
  return data.Items ?? [];
}

/** Query key; starts with the server and user so caches never mix. */
export const searchKeys = (
  serverId: string,
  userId: string,
  kind: BaseItemKind,
  term: string,
) => ['search', serverId, userId, kind, term] as const;

export type SearchGroupResult = SearchGroup & {
  query: UseQueryResult<BaseItemDto[]>;
};

// Stable, so useQueries only recombines when a result changes.
const toGroups = (
  results: UseQueryResult<BaseItemDto[]>[],
): SearchGroupResult[] =>
  results.map((query, index) => ({...SEARCH_GROUPS[index], query}));

/**
 * The group's most recent results for any term, shown while the next term
 * loads. Stands in for keepPreviousData, which useQueries never hands the
 * previous data: a new term is a new key, and so a new observer.
 */
function latestResults(
  client: QueryClient,
  serverId: string,
  userId: string,
  kind: BaseItemKind,
): BaseItemDto[] | undefined {
  const queries = client.getQueryCache().findAll({
    queryKey: ['search', serverId, userId, kind],
    predicate: (query) => query.state.data !== undefined,
  });
  let latest = queries[0];
  for (const query of queries) {
    if (query.state.dataUpdatedAt > latest.state.dataUpdatedAt) {
      latest = query;
    }
  }
  return latest?.state.data as BaseItemDto[] | undefined;
}

/**
 * Searches movies, shows and episodes for the term, in parallel. An empty
 * term (after trimming) or no session fetches nothing. Debounce the term
 * before passing it. While a new term loads, each group keeps its last
 * results (`isPlaceholderData`); clearing the term clears them.
 */
export function useSearch(term: string): SearchGroupResult[] {
  const {session} = useSession();
  const serverId = session?.server.id ?? '';
  const userId = session?.user.Id ?? '';
  const api = session?.api;
  const trimmed = term.trim();
  const client = useQueryClient();
  return useQueries({
    queries: SEARCH_GROUPS.map((group) => ({
      queryKey: searchKeys(serverId, userId, group.kind, trimmed),
      queryFn:
        api && trimmed
          ? () => fetchSearch(api, userId, trimmed, group.kind)
          : skipToken,
      placeholderData: trimmed
        ? () => latestResults(client, serverId, userId, group.kind)
        : undefined,
    })),
    combine: toGroups,
  });
}

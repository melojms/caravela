import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {CollectionType} from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import {ItemFields} from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import {ItemFilter} from '@jellyfin/sdk/lib/generated-client/models/item-filter';
import {ItemSortBy} from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import {getLibraryApi} from '@jellyfin/sdk/lib/utils/api/library-api';
import {skipToken, useInfiniteQuery} from '@tanstack/react-query';
import {useCallback, useMemo} from 'react';

import {useSession} from '../auth/SessionContext';
import type {CardItem} from '../components/types';
import {toCardItem} from './items';
import type {
  LibraryKind,
  LibraryQuery,
  LibrarySortOption,
} from './libraryTypes';

/** Items per grid page: 10 rows of 6. */
export const LIBRARY_PAGE_SIZE = 60;

// androidtv's ItemRepository.itemFields, which its grid request uses.
export const LIBRARY_FIELDS = [
  ItemFields.CanDelete,
  ItemFields.ChannelInfo,
  ItemFields.Chapters,
  ItemFields.ChildCount,
  ItemFields.CumulativeRunTimeTicks,
  ItemFields.DateCreated,
  ItemFields.DisplayPreferencesId,
  ItemFields.Genres,
  ItemFields.ItemCounts,
  ItemFields.MediaSourceCount,
  ItemFields.MediaSources,
  ItemFields.MediaStreams,
  ItemFields.Overview,
  ItemFields.Path,
  ItemFields.PrimaryImageAspectRatio,
  ItemFields.Taglines,
  ItemFields.Trickplay,
];

const ITEM_TYPES: Record<LibraryKind, BaseItemKind> = {
  [CollectionType.Movies]: BaseItemKind.Movie,
  [CollectionType.Tvshows]: BaseItemKind.Series,
};

// The letter jump's `#`: names before A, like jellyfin-web.
const BEFORE_A = '#';

export type LibraryPage = {items: BaseItemDto[]; total: number};

export type LibraryPageRequest = {
  libraryId: string;
  kind: LibraryKind;
  query: LibraryQuery;
  startIndex: number;
};

/**
 * One page of a library grid, like androidtv's `createBrowseGridItemsRequest`
 * with its sort, filters and start letter. Ties sort by name.
 */
export async function fetchLibraryPage(
  api: Api,
  userId: string,
  {libraryId, kind, query, startIndex}: LibraryPageRequest,
): Promise<LibraryPage> {
  const {sortBy, sortOrder, filters, letter} = query;
  const itemFilters: ItemFilter[] = [];
  if (filters.unwatchedOnly) {
    itemFilters.push(ItemFilter.IsUnplayed);
  }
  if (filters.favoritesOnly) {
    itemFilters.push(ItemFilter.IsFavorite);
  }
  const {data} = await getLibraryApi(api).getItems({
    userId,
    parentId: libraryId,
    includeItemTypes: [ITEM_TYPES[kind]],
    recursive: true,
    sortBy:
      sortBy === ItemSortBy.SortName ? [sortBy] : [sortBy, ItemSortBy.SortName],
    sortOrder: [sortOrder],
    filters: itemFilters.length ? itemFilters : undefined,
    fields: LIBRARY_FIELDS,
    startIndex,
    limit: LIBRARY_PAGE_SIZE,
    enableTotalRecordCount: true,
    ...(letter === BEFORE_A
      ? {nameLessThan: 'A'}
      : letter
      ? {nameStartsWith: letter}
      : {}),
  });
  return {items: data.Items ?? [], total: data.TotalRecordCount ?? 0};
}

/**
 * Where the next page starts, or undefined when every item is loaded. An
 * empty page also ends paging, so a library that shrank can't loop.
 */
export function nextLibraryPageParam(
  lastPage: LibraryPage,
  pages: LibraryPage[],
): number | undefined {
  const loaded = pages.reduce((count, page) => count + page.items.length, 0);
  return lastPage.items.length > 0 && loaded < lastPage.total
    ? loaded
    : undefined;
}

/**
 * androidtv's `setStatusText`, without its double spaces, e.g. "Showing
 * unwatched favorites beginning with those whose name starts with B from
 * 'Movies' sorted by Date added".
 */
export function libraryStatusText(
  folderName: string,
  query: LibraryQuery,
  sortOptions: readonly LibrarySortOption[],
): string {
  const {unwatchedOnly, favoritesOnly} = query.filters;
  const parts = ['Showing'];
  if (!unwatchedOnly && !favoritesOnly) {
    parts.push('all items');
  } else {
    if (unwatchedOnly) {
      parts.push('unwatched');
    }
    if (favoritesOnly) {
      parts.push('favorites');
    }
  }
  if (query.letter) {
    parts.push('beginning with those whose name starts with', query.letter);
  }
  const sort =
    sortOptions.find((option) => option.sortBy === query.sortBy)?.label ??
    'Unknown';
  parts.push(`from '${folderName}' sorted by ${sort}`);
  return parts.join(' ');
}

/** Query keys; each starts with the server and user so caches never mix. */
export const libraryKeys = {
  all: (serverId: string, userId: string) =>
    ['library', serverId, userId] as const,
  items: (
    serverId: string,
    userId: string,
    libraryId: string,
    query: LibraryQuery,
  ) =>
    [...libraryKeys.all(serverId, userId), 'items', libraryId, query] as const,
  prefs: (serverId: string, userId: string, displayPreferencesId: string) =>
    [
      ...libraryKeys.all(serverId, userId),
      'prefs',
      displayPreferencesId,
    ] as const,
};

/**
 * A library's items as poster cards, a page at a time. Disabled when nobody
 * is signed in, there's no library or no query yet (the prefs are loading).
 * `fetchNextPage` ignores calls while a page is loading or when there's none
 * left, so a list's `onEndReached` can call it freely.
 */
export function useLibraryItems(
  libraryId: string,
  kind: LibraryKind,
  query: LibraryQuery | undefined,
) {
  const {session} = useSession();
  const serverId = session?.server.id ?? '';
  const userId = session?.user.Id ?? '';
  const api = session?.api;

  const result = useInfiniteQuery({
    queryKey: libraryKeys.items(
      serverId,
      userId,
      libraryId,
      query ?? ({} as LibraryQuery),
    ),
    queryFn:
      api && libraryId && query
        ? ({pageParam}) =>
            fetchLibraryPage(api, userId, {
              libraryId,
              kind,
              query,
              startIndex: pageParam,
            })
        : skipToken,
    initialPageParam: 0,
    getNextPageParam: nextLibraryPageParam,
  });

  const {data, hasNextPage, isFetching, fetchNextPage} = result;

  const cards = useMemo<CardItem[]>(() => {
    if (!api || !data) {
      return [];
    }
    // A library that changed while paging can repeat an item across pages.
    const seen = new Set<string>();
    const items: CardItem[] = [];
    for (const page of data.pages) {
      for (const item of page.items) {
        if (item.Id && !seen.has(item.Id)) {
          seen.add(item.Id);
          items.push(toCardItem(item, api, {variant: 'poster'}));
        }
      }
    }
    return items;
  }, [api, data]);

  const total = data?.pages[data.pages.length - 1]?.total ?? 0;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetching) {
      // cancelRefetch: false reuses a page already in flight, for calls made
      // before the next render updates isFetching.
      fetchNextPage({cancelRefetch: false});
    }
  }, [hasNextPage, isFetching, fetchNextPage]);

  return {
    cards,
    total,
    fetchNextPage: loadMore,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
    status: result.status,
    isPending: result.isPending,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

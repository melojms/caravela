import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {ItemSortBy} from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import {SortOrder} from '@jellyfin/sdk/lib/generated-client/models/sort-order';
import {getLibraryApi} from '@jellyfin/sdk/lib/utils/api/library-api';
import {getShowApi} from '@jellyfin/sdk/lib/utils/api/show-api';
import {skipToken, useQuery} from '@tanstack/react-query';

import {useSession} from '../auth/SessionContext';
import {detailsKeys, ITEM_FIELDS} from './details';

/** Items in the "Next episodes" row, like androidtv. */
export const NEXT_EPISODES_LIMIT = 20;

/** Items in each of a person's rows, like androidtv. */
export const PERSON_ITEMS_LIMIT = 100;

/** What a person's row lists: Movies, TV series or Episodes. */
export type PersonItemKind =
  | typeof BaseItemKind.Movie
  | typeof BaseItemKind.Series
  | typeof BaseItemKind.Episode;

/** A series' seasons, like androidtv's `createSeasonsRequest`. */
export async function fetchSeasons(
  api: Api,
  userId: string,
  seriesId: string,
): Promise<BaseItemDto[]> {
  const {data} = await getShowApi(api).getSeasons({
    seriesId,
    userId,
    fields: ITEM_FIELDS,
  });
  return data.Items ?? [];
}

/**
 * Every episode of a season, in order, like androidtv's season playback
 * request: missing episodes left out, sorted by name (an episode's sort name
 * starts with its number).
 */
export async function fetchSeasonEpisodes(
  api: Api,
  userId: string,
  seriesId: string,
  seasonId: string,
): Promise<BaseItemDto[]> {
  const {data} = await getShowApi(api).getEpisodes({
    seriesId,
    seasonId,
    userId,
    isMissing: false,
    sortBy: ItemSortBy.SortName,
    fields: ITEM_FIELDS,
  });
  return data.Items ?? [];
}

/**
 * A series' Next up row, like androidtv's `createSeriesGetNextUpRequest`. The
 * first item is what the series' Play/Resume plays.
 */
export async function fetchSeriesNextUp(
  api: Api,
  userId: string,
  seriesId: string,
): Promise<BaseItemDto[]> {
  const {data} = await getShowApi(api).getNextUp({
    userId,
    seriesId,
    fields: ITEM_FIELDS,
  });
  return data.Items ?? [];
}

/**
 * The episode before this one in its series, or null for the first. Like
 * androidtv's `populatePreviousButton`, it asks for the episodes adjacent to
 * this one (previous, self, next), but takes the one *before* self: androidtv
 * takes the first that isn't self, which for the first episode is the next one.
 */
export async function fetchPreviousEpisode(
  api: Api,
  userId: string,
  episode: BaseItemDto,
): Promise<BaseItemDto | null> {
  const {Id: id, SeriesId: seriesId} = episode;
  if (!id || !seriesId) {
    return null;
  }
  const {data} = await getShowApi(api).getEpisodes({
    seriesId,
    userId,
    adjacentTo: id,
    fields: ITEM_FIELDS,
  });
  const siblings = data.Items ?? [];
  const index = siblings.findIndex((sibling) => sibling.Id === id);
  return index > 0 ? siblings[index - 1] : null;
}

/**
 * The episodes after this one in its season, like androidtv's
 * `createNextEpisodesRequest`: the start index is zero-based and episode
 * numbers aren't, so starting at the episode's number skips it.
 */
export async function fetchNextEpisodes(
  api: Api,
  userId: string,
  seasonId: string,
  indexNumber: number,
): Promise<BaseItemDto[]> {
  const {data} = await getLibraryApi(api).getItems({
    userId,
    parentId: seasonId,
    includeItemTypes: [BaseItemKind.Episode],
    startIndex: indexNumber,
    limit: NEXT_EPISODES_LIMIT,
    fields: ITEM_FIELDS,
  });
  return data.Items ?? [];
}

/** A person's movies, series or episodes, newest first, like androidtv's `createPersonItemsRequest`. */
export async function fetchPersonItems(
  api: Api,
  userId: string,
  personId: string,
  kind: PersonItemKind,
): Promise<BaseItemDto[]> {
  const {data} = await getLibraryApi(api).getItems({
    userId,
    personIds: [personId],
    recursive: true,
    includeItemTypes: [kind],
    sortBy: [ItemSortBy.PremiereDate, ItemSortBy.SortName],
    sortOrder: [SortOrder.Descending, SortOrder.Ascending],
    limit: PERSON_ITEMS_LIMIT,
    fields: ITEM_FIELDS,
  });
  return data.Items ?? [];
}

/**
 * Query keys, under `detailsKeys.all` so the Watched/Favorite toggles'
 * invalidation refreshes them too.
 */
export const tvDetailsKeys = {
  seasons: (serverId: string, userId: string, seriesId: string) =>
    [...detailsKeys.all(serverId, userId), 'seasons', seriesId] as const,
  seasonEpisodes: (
    serverId: string,
    userId: string,
    seriesId: string,
    seasonId: string,
  ) =>
    [
      ...detailsKeys.all(serverId, userId),
      'seasonEpisodes',
      seriesId,
      seasonId,
    ] as const,
  seriesNextUp: (serverId: string, userId: string, seriesId: string) =>
    [...detailsKeys.all(serverId, userId), 'seriesNextUp', seriesId] as const,
  previousEpisode: (serverId: string, userId: string, episodeId: string) =>
    [
      ...detailsKeys.all(serverId, userId),
      'previousEpisode',
      episodeId,
    ] as const,
  nextEpisodes: (
    serverId: string,
    userId: string,
    seasonId: string,
    indexNumber: number,
  ) =>
    [
      ...detailsKeys.all(serverId, userId),
      'nextEpisodes',
      seasonId,
      indexNumber,
    ] as const,
  personItems: (
    serverId: string,
    userId: string,
    personId: string,
    kind: PersonItemKind,
  ) =>
    [
      ...detailsKeys.all(serverId, userId),
      'personItems',
      personId,
      kind,
    ] as const,
};

/**
 * Runs a query for the signed-in user. `fetch` is undefined when an id is
 * missing; the query is disabled then, and when nobody is signed in.
 */
function useTvQuery<T>(
  key: (serverId: string, userId: string) => readonly unknown[],
  fetch: ((api: Api, userId: string) => Promise<T>) | undefined,
) {
  const {session} = useSession();
  const serverId = session?.server.id ?? '';
  const userId = session?.user.Id ?? '';
  const api = session?.api;
  return useQuery({
    queryKey: key(serverId, userId),
    queryFn: api && fetch ? () => fetch(api, userId) : skipToken,
  });
}

export const useSeasons = (seriesId: string) =>
  useTvQuery(
    (serverId, userId) => tvDetailsKeys.seasons(serverId, userId, seriesId),
    seriesId ? (api, userId) => fetchSeasons(api, userId, seriesId) : undefined,
  );

export const useSeasonEpisodes = (seriesId: string, seasonId: string) =>
  useTvQuery(
    (serverId, userId) =>
      tvDetailsKeys.seasonEpisodes(serverId, userId, seriesId, seasonId),
    seriesId && seasonId
      ? (api, userId) => fetchSeasonEpisodes(api, userId, seriesId, seasonId)
      : undefined,
  );

export const useSeriesNextUp = (seriesId: string) =>
  useTvQuery(
    (serverId, userId) =>
      tvDetailsKeys.seriesNextUp(serverId, userId, seriesId),
    seriesId
      ? (api, userId) => fetchSeriesNextUp(api, userId, seriesId)
      : undefined,
  );

/** The episode before this one; disabled without the episode's id or series id. */
export const usePreviousEpisode = (episode: BaseItemDto | undefined) =>
  useTvQuery(
    (serverId, userId) =>
      tvDetailsKeys.previousEpisode(serverId, userId, episode?.Id ?? ''),
    episode?.Id && episode.SeriesId
      ? (api, userId) => fetchPreviousEpisode(api, userId, episode)
      : undefined,
  );

/** The episodes after this one in its season; disabled without its `SeasonId` or `IndexNumber`. */
export const useNextEpisodes = (episode: BaseItemDto | undefined) => {
  const seasonId = episode?.SeasonId ?? '';
  const indexNumber = episode?.IndexNumber;
  return useTvQuery(
    (serverId, userId) =>
      tvDetailsKeys.nextEpisodes(serverId, userId, seasonId, indexNumber ?? -1),
    seasonId && indexNumber != null
      ? (api, userId) => fetchNextEpisodes(api, userId, seasonId, indexNumber)
      : undefined,
  );
};

export const usePersonItems = (personId: string, kind: PersonItemKind) =>
  useTvQuery(
    (serverId, userId) =>
      tvDetailsKeys.personItems(serverId, userId, personId, kind),
    personId
      ? (api, userId) => fetchPersonItems(api, userId, personId, kind)
      : undefined,
  );

import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {ItemFields} from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import type {UserItemDataDto} from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';
import {getLibraryApi} from '@jellyfin/sdk/lib/utils/api/library-api';
import {getUserDataApi} from '@jellyfin/sdk/lib/utils/api/user-data-api';
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {useCallback} from 'react';

import {useSession} from '../auth/SessionContext';
import {homeKeys} from './home';

/** Items in the "More like this" row, like androidtv. */
export const SIMILAR_LIMIT = 20;

// androidtv's ItemRepository.itemFields, plus People for the cast row.
export const ITEM_FIELDS = [
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
  ItemFields.People,
  ItemFields.PrimaryImageAspectRatio,
  ItemFields.Taglines,
  ItemFields.Trickplay,
];

/**
 * One item with the user's data, like androidtv's `userLibraryApi.getItem`.
 * The single-item endpoint takes no field list: it returns every field,
 * including People, MediaSources, MediaStreams, Taglines and Chapters.
 */
export async function fetchItemDetails(
  api: Api,
  userId: string,
  itemId: string,
): Promise<BaseItemDto> {
  const {data} = await getLibraryApi(api).getItem({itemId, userId});
  return data;
}

/** "More like this", like androidtv's `createSimilarItemsRequest`. */
export async function fetchSimilarItems(
  api: Api,
  userId: string,
  itemId: string,
): Promise<BaseItemDto[]> {
  const {data} = await getLibraryApi(api).getSimilarItems({
    itemId,
    userId,
    limit: SIMILAR_LIMIT,
    fields: ITEM_FIELDS,
  });
  return data.Items ?? [];
}

/** Query keys; each starts with the server and user so caches never mix. */
export const detailsKeys = {
  all: (serverId: string, userId: string) =>
    ['details', serverId, userId] as const,
  item: (serverId: string, userId: string, itemId: string) =>
    [...detailsKeys.all(serverId, userId), 'item', itemId] as const,
  similar: (serverId: string, userId: string, itemId: string) =>
    [...detailsKeys.all(serverId, userId), 'similar', itemId] as const,
};

const useSessionScope = () => {
  const {session} = useSession();
  return {
    serverId: session?.server.id ?? '',
    userId: session?.user.Id ?? '',
    api: session?.api,
  };
};

/** Runs a details query for the signed-in user; disabled when nobody is or there's no item. */
function useDetailsQuery<T>(
  key: (serverId: string, userId: string, itemId: string) => readonly unknown[],
  fetch: (api: Api, userId: string, itemId: string) => Promise<T>,
  itemId: string,
) {
  const {serverId, userId, api} = useSessionScope();
  return useQuery({
    queryKey: key(serverId, userId, itemId),
    queryFn: api && itemId ? () => fetch(api, userId, itemId) : skipToken,
  });
}

export const useItemDetails = (itemId: string) =>
  useDetailsQuery(detailsKeys.item, fetchItemDetails, itemId);

export const useSimilarItems = (itemId: string) =>
  useDetailsQuery(detailsKeys.similar, fetchSimilarItems, itemId);

type ToggleContext = {previous?: BaseItemDto};

/**
 * A user-data toggle on the cached item (favorite, played). `toggle()` sends
 * the opposite of the cached state; the cache flips first, rolls back on
 * error, then every details query and Home refetch.
 */
function useUserDataToggle(
  itemId: string,
  isOn: (item: BaseItemDto) => boolean,
  apply: (userData: UserItemDataDto, on: boolean) => UserItemDataDto,
  send: (
    api: Api,
    request: UserDataRequest,
    on: boolean,
  ) => Promise<UserItemDataDto>,
) {
  const queryClient = useQueryClient();
  const {serverId, userId, api} = useSessionScope();
  const itemKey = detailsKeys.item(serverId, userId, itemId);

  const mutation = useMutation<UserItemDataDto, Error, boolean, ToggleContext>({
    mutationFn: (on) => {
      if (!api) {
        return Promise.reject(new Error('Not signed in'));
      }
      return send(api, {itemId, userId}, on);
    },
    onMutate: async (on) => {
      await queryClient.cancelQueries({queryKey: itemKey});
      const previous = queryClient.getQueryData<BaseItemDto>(itemKey);
      // The item always comes with its user data; without it there's
      // nothing to flip, and the refetch fills it in.
      if (previous?.UserData) {
        queryClient.setQueryData<BaseItemDto>(itemKey, {
          ...previous,
          UserData: apply(previous.UserData, on),
        });
      }
      return {previous};
    },
    onError: (_error, _on, context) => {
      if (context?.previous) {
        queryClient.setQueryData(itemKey, context.previous);
      }
    },
    onSuccess: (userData) => {
      // The server's answer is the truth, like androidtv's copyWithUserData.
      queryClient.setQueryData<BaseItemDto>(itemKey, (item) =>
        item ? {...item, UserData: userData} : item,
      );
    },
    // Marking a series or season changes its episodes, next up and seasons
    // too, so every details query refetches, the item included.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: detailsKeys.all(serverId, userId),
        }),
        queryClient.invalidateQueries({
          queryKey: homeKeys.all(serverId, userId),
        }),
      ]),
  });

  const {mutate} = mutation;
  const toggle = useCallback(() => {
    const item = queryClient.getQueryData<BaseItemDto>(itemKey);
    mutate(!(item && isOn(item)));
    // itemKey is rebuilt each render; its parts are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, mutate, isOn, serverId, userId, itemId]);

  return {...mutation, toggle};
}

type UserDataRequest = {itemId: string; userId: string};

const isFavorite = (item: BaseItemDto) => item.UserData?.IsFavorite === true;

const setFavorite = (userData: UserItemDataDto, on: boolean) => ({
  ...userData,
  IsFavorite: on,
});

const sendFavorite = async (
  api: Api,
  request: UserDataRequest,
  on: boolean,
) => {
  const userDataApi = getUserDataApi(api);
  const {data} = on
    ? await userDataApi.markFavoriteItem(request)
    : await userDataApi.unmarkFavoriteItem(request);
  return data;
};

const isPlayed = (item: BaseItemDto) => item.UserData?.Played === true;

// The server clears the resume point when marking played or unplayed.
const setPlayed = (userData: UserItemDataDto, on: boolean) => ({
  ...userData,
  Played: on,
  PlaybackPositionTicks: 0,
  PlayedPercentage: undefined,
});

const sendPlayed = async (api: Api, request: UserDataRequest, on: boolean) => {
  const userDataApi = getUserDataApi(api);
  const {data} = on
    ? await userDataApi.markPlayedItem(request)
    : await userDataApi.markUnplayedItem(request);
  return data;
};

/** Favorite on/off for an item, optimistic. Call `toggle()`. */
export const useToggleFavorite = (itemId: string) =>
  useUserDataToggle(itemId, isFavorite, setFavorite, sendFavorite);

/** Watched on/off for an item, optimistic. Call `toggle()`. */
export const useTogglePlayed = (itemId: string) =>
  useUserDataToggle(itemId, isPlayed, setPlayed, sendPlayed);

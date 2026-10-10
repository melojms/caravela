import type {Api} from '@jellyfin/sdk';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {CollectionType} from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import {ItemFields} from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import {MediaType} from '@jellyfin/sdk/lib/generated-client/models/media-type';
import type {UserDto} from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import {getDisplayPreferenceApi} from '@jellyfin/sdk/lib/utils/api/display-preference-api';
import {getLibraryApi} from '@jellyfin/sdk/lib/utils/api/library-api';
import {getShowApi} from '@jellyfin/sdk/lib/utils/api/show-api';
import {getUserViewApi} from '@jellyfin/sdk/lib/utils/api/user-view-api';
import {skipToken, useQuery} from '@tanstack/react-query';
import {isAxiosError} from 'axios';

import {useSession} from '../auth/SessionContext';

export type HomeSection = 'myMedia' | 'resume' | 'nextUp' | 'latest';

/** Items per Home row. */
export const HOME_ROW_LIMIT = 20;

// The DisplayPreferences entry jellyfin-web and androidtv share.
const USER_SETTINGS_ID = 'usersettings';
const USER_SETTINGS_CLIENT = 'emby';

const HOME_SECTION_COUNT = 10;

// androidtv's homesection0..9 defaults (UserSettingPreferences).
const DEFAULT_HOME_SECTIONS = [
  'smalllibrarytiles',
  'resume',
  'resumeaudio',
  'resumebook',
  'livetv',
  'nextup',
  'latestmedia',
  'none',
  'none',
  'none',
];

// Server section names we support. The rest (resumeaudio, resumebook, livetv,
// activerecordings, none, unknown) is dropped: no music, books or Live TV.
const SUPPORTED_SECTIONS: Record<string, HomeSection> = {
  smalllibrarytiles: 'myMedia',
  librarybuttons: 'myMedia',
  resume: 'resume',
  nextup: 'nextUp',
  latestmedia: 'latest',
};

// androidtv's ItemRepository.browseFields.
const BROWSE_FIELDS = [
  ItemFields.CanDelete,
  ItemFields.ChildCount,
  ItemFields.DateCreated,
  ItemFields.Genres,
  ItemFields.Overview,
  ItemFields.PrimaryImageAspectRatio,
];

const MY_MEDIA_TYPES: (string | null | undefined)[] = [
  CollectionType.Movies,
  CollectionType.Tvshows,
];

const isMovieOrShowLibrary = (view: BaseItemDto) =>
  MY_MEDIA_TYPES.includes(view.CollectionType);

/**
 * Home section order from the `homesection0..9` custom prefs. A missing key
 * takes androidtv's default for that slot; unsupported sections and repeats
 * are dropped.
 */
export function parseHomeSections(
  customPrefs?: Record<string, string | null> | null,
): HomeSection[] {
  const sections: HomeSection[] = [];
  for (let index = 0; index < HOME_SECTION_COUNT; index++) {
    const value =
      customPrefs?.[`homesection${index}`] || DEFAULT_HOME_SECTIONS[index];
    const section = SUPPORTED_SECTIONS[value.trim().toLowerCase()];
    if (section && !sections.includes(section)) {
      sections.push(section);
    }
  }
  return sections;
}

export async function fetchHomeSections(
  api: Api,
  userId: string,
): Promise<HomeSection[]> {
  const {data} = await getDisplayPreferenceApi(api).getDisplayPreferences({
    displayPreferencesId: USER_SETTINGS_ID,
    client: USER_SETTINGS_CLIENT,
    userId,
  });
  return parseHomeSections(data.CustomPrefs);
}

/** The user's Movies and TV libraries, for My Media. */
export async function fetchMyMedia(
  api: Api,
  userId: string,
): Promise<BaseItemDto[]> {
  const {data} = await getUserViewApi(api).getUserViews({userId});
  return (data.Items ?? []).filter(isMovieOrShowLibrary);
}

/** Continue Watching: videos only, without audiobooks (like androidtv). */
export async function fetchResume(
  api: Api,
  userId: string,
): Promise<BaseItemDto[]> {
  const {data} = await getLibraryApi(api).getResumeItems({
    userId,
    limit: HOME_ROW_LIMIT,
    fields: BROWSE_FIELDS,
    imageTypeLimit: 1,
    enableTotalRecordCount: false,
    mediaTypes: [MediaType.Video],
    excludeItemTypes: [BaseItemKind.AudioBook],
  });
  return data.Items ?? [];
}

/** Next Up, without episodes in progress: those are in Continue Watching. */
export async function fetchNextUp(
  api: Api,
  userId: string,
): Promise<BaseItemDto[]> {
  const {data} = await getShowApi(api).getNextUp({
    userId,
    limit: HOME_ROW_LIMIT,
    fields: BROWSE_FIELDS,
    imageTypeLimit: 1,
    enableTotalRecordCount: false,
    enableResumable: false,
  });
  return data.Items ?? [];
}

/** Latest items in one library, episodes grouped by series. */
export async function fetchLatest(
  api: Api,
  userId: string,
  libraryId: string,
): Promise<BaseItemDto[]> {
  const {data} = await getLibraryApi(api).getLatestMedia({
    userId,
    parentId: libraryId,
    limit: HOME_ROW_LIMIT,
    fields: BROWSE_FIELDS,
    imageTypeLimit: 1,
    groupItems: true,
  });
  return data;
}

/** The libraries that get a Latest row: Movies and TV, minus the user's exclusions. */
export function latestLibraries(
  views: BaseItemDto[],
  user: UserDto,
): BaseItemDto[] {
  const excluded = user.Configuration?.LatestItemsExcludes ?? [];
  return views.filter(
    (view) =>
      isMovieOrShowLibrary(view) && !!view.Id && !excluded.includes(view.Id),
  );
}

/** True for an HTTP 401 from the SDK: the token is no longer valid. */
export const isUnauthorized = (error: unknown): boolean =>
  isAxiosError(error) && error.response?.status === 401;

/** Query keys; each starts with the server and user so caches never mix. */
export const homeKeys = {
  all: (serverId: string, userId: string) =>
    ['home', serverId, userId] as const,
  sections: (serverId: string, userId: string) =>
    [...homeKeys.all(serverId, userId), 'sections'] as const,
  myMedia: (serverId: string, userId: string) =>
    [...homeKeys.all(serverId, userId), 'myMedia'] as const,
  resume: (serverId: string, userId: string) =>
    [...homeKeys.all(serverId, userId), 'resume'] as const,
  nextUp: (serverId: string, userId: string) =>
    [...homeKeys.all(serverId, userId), 'nextUp'] as const,
  latest: (serverId: string, userId: string, libraryId: string) =>
    [...homeKeys.all(serverId, userId), 'latest', libraryId] as const,
};

/** Runs a Home query for the signed-in user; disabled when nobody is. */
function useHomeQuery<T>(
  key: (serverId: string, userId: string) => readonly unknown[],
  fetch: (api: Api, userId: string) => Promise<T>,
  enabled = true,
) {
  const {session} = useSession();
  const serverId = session?.server.id ?? '';
  const userId = session?.user.Id ?? '';
  const api = session?.api;
  return useQuery({
    queryKey: key(serverId, userId),
    queryFn: api && enabled ? () => fetch(api, userId) : skipToken,
  });
}

export const useHomeSections = () =>
  useHomeQuery(homeKeys.sections, fetchHomeSections);

export const useMyMedia = () => useHomeQuery(homeKeys.myMedia, fetchMyMedia);

export const useResume = () => useHomeQuery(homeKeys.resume, fetchResume);

export const useNextUp = () => useHomeQuery(homeKeys.nextUp, fetchNextUp);

export const useLatest = (libraryId: string) =>
  useHomeQuery(
    (serverId, userId) => homeKeys.latest(serverId, userId, libraryId),
    (api, userId) => fetchLatest(api, userId, libraryId),
    !!libraryId,
  );

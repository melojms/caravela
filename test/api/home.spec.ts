import type {Api} from '@jellyfin/sdk';
import {getDisplayPreferenceApi} from '@jellyfin/sdk/lib/utils/api/display-preference-api';
import {getLibraryApi} from '@jellyfin/sdk/lib/utils/api/library-api';
import {getShowApi} from '@jellyfin/sdk/lib/utils/api/show-api';
import {getUserViewApi} from '@jellyfin/sdk/lib/utils/api/user-view-api';

import {
  fetchHomeSections,
  fetchLatest,
  fetchMyMedia,
  fetchNextUp,
  fetchResume,
  homeKeys,
  isUnauthorized,
  latestLibraries,
  parseHomeSections,
} from '../../src/api/home';

jest.mock('@jellyfin/sdk/lib/utils/api/display-preference-api', () => ({
  getDisplayPreferenceApi: jest.fn(),
}));
jest.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({
  getLibraryApi: jest.fn(),
}));
jest.mock('@jellyfin/sdk/lib/utils/api/show-api', () => ({
  getShowApi: jest.fn(),
}));
jest.mock('@jellyfin/sdk/lib/utils/api/user-view-api', () => ({
  getUserViewApi: jest.fn(),
}));

const displayPreferenceApi = {getDisplayPreferences: jest.fn()};
const libraryApi = {getResumeItems: jest.fn(), getLatestMedia: jest.fn()};
const showApi = {getNextUp: jest.fn()};
const userViewApi = {getUserViews: jest.fn()};

const api = {} as Api;

const BROWSE_FIELDS = [
  'CanDelete',
  'ChildCount',
  'DateCreated',
  'Genres',
  'Overview',
  'PrimaryImageAspectRatio',
];

const MOVIES = {Id: 'lib-movies', Name: 'Movies', CollectionType: 'movies'};
const SHOWS = {Id: 'lib-shows', Name: 'Shows', CollectionType: 'tvshows'};
const MUSIC = {Id: 'lib-music', Name: 'Music', CollectionType: 'music'};
const BOOKS = {Id: 'lib-books', Name: 'Books', CollectionType: 'books'};
const MIXED = {Id: 'lib-mixed', Name: 'Mixed'};

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: {status},
  });

beforeEach(() => {
  jest.clearAllMocks();
  (getDisplayPreferenceApi as jest.Mock).mockReturnValue(displayPreferenceApi);
  (getLibraryApi as jest.Mock).mockReturnValue(libraryApi);
  (getShowApi as jest.Mock).mockReturnValue(showApi);
  (getUserViewApi as jest.Mock).mockReturnValue(userViewApi);
});

describe('parseHomeSections', () => {
  it('uses the androidtv defaults when there are no prefs', () => {
    const defaults = ['myMedia', 'resume', 'nextUp', 'latest'];
    expect(parseHomeSections(undefined)).toEqual(defaults);
    expect(parseHomeSections(null)).toEqual(defaults);
    expect(parseHomeSections({})).toEqual(defaults);
  });

  it('follows a custom order', () => {
    expect(
      parseHomeSections({
        homesection0: 'latestmedia',
        homesection1: 'nextup',
        homesection2: 'resume',
        homesection3: 'smalllibrarytiles',
        homesection4: 'none',
        homesection5: 'none',
        homesection6: 'none',
        homesection7: 'none',
        homesection8: 'none',
        homesection9: 'none',
      }),
    ).toEqual(['latest', 'nextUp', 'resume', 'myMedia']);
  });

  it('takes the default for each missing key', () => {
    // Slot 0 is set; slot 1 (resume), 5 (nextup) and 6 (latestmedia) default.
    expect(parseHomeSections({homesection0: 'nextup'})).toEqual([
      'nextUp',
      'resume',
      'latest',
    ]);
  });

  it('drops unsupported and unknown sections', () => {
    expect(
      parseHomeSections({
        homesection0: 'resumeaudio',
        homesection1: 'resumebook',
        homesection2: 'livetv',
        homesection3: 'activerecordings',
        homesection4: 'somethingnew',
        homesection5: 'resume',
        homesection6: 'none',
        homesection7: 'none',
        homesection8: 'none',
        homesection9: 'none',
      }),
    ).toEqual(['resume']);
  });

  it('removes duplicates and maps librarybuttons to My Media', () => {
    expect(
      parseHomeSections({
        homesection0: 'librarybuttons',
        homesection1: 'resume',
        homesection2: 'smalllibrarytiles',
        homesection3: 'resume',
        homesection4: 'none',
        homesection5: 'none',
        homesection6: 'none',
        homesection7: 'none',
        homesection8: 'none',
        homesection9: 'none',
      }),
    ).toEqual(['myMedia', 'resume']);
  });

  it('returns no sections when every slot is none', () => {
    const prefs: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      prefs[`homesection${i}`] = 'none';
    }
    expect(parseHomeSections(prefs)).toEqual([]);
  });
});

describe('fetchHomeSections', () => {
  it('reads the shared usersettings prefs for the emby client', async () => {
    displayPreferenceApi.getDisplayPreferences.mockResolvedValue({
      data: {CustomPrefs: {homesection0: 'resume', homesection6: 'none'}},
    });

    await expect(fetchHomeSections(api, 'u1')).resolves.toEqual([
      'resume',
      'nextUp',
    ]);
    expect(getDisplayPreferenceApi).toHaveBeenCalledWith(api);
    expect(displayPreferenceApi.getDisplayPreferences).toHaveBeenCalledWith({
      displayPreferencesId: 'usersettings',
      client: 'emby',
      userId: 'u1',
    });
  });

  it('uses the defaults when the server has no custom prefs', async () => {
    displayPreferenceApi.getDisplayPreferences.mockResolvedValue({data: {}});

    await expect(fetchHomeSections(api, 'u1')).resolves.toEqual([
      'myMedia',
      'resume',
      'nextUp',
      'latest',
    ]);
  });
});

describe('row fetchers', () => {
  it('fetchMyMedia keeps only the Movies and TV libraries', async () => {
    userViewApi.getUserViews.mockResolvedValue({
      data: {Items: [MOVIES, MUSIC, SHOWS, BOOKS, MIXED]},
    });

    await expect(fetchMyMedia(api, 'u1')).resolves.toEqual([MOVIES, SHOWS]);
    expect(userViewApi.getUserViews).toHaveBeenCalledWith({userId: 'u1'});
  });

  it('fetchMyMedia handles a response without items', async () => {
    userViewApi.getUserViews.mockResolvedValue({data: {}});
    await expect(fetchMyMedia(api, 'u1')).resolves.toEqual([]);
  });

  it('fetchResume asks for 20 videos, without audiobooks', async () => {
    libraryApi.getResumeItems.mockResolvedValue({data: {Items: [{Id: 'm1'}]}});

    await expect(fetchResume(api, 'u1')).resolves.toEqual([{Id: 'm1'}]);
    expect(libraryApi.getResumeItems).toHaveBeenCalledWith({
      userId: 'u1',
      limit: 20,
      fields: BROWSE_FIELDS,
      imageTypeLimit: 1,
      enableTotalRecordCount: false,
      mediaTypes: ['Video'],
      excludeItemTypes: ['AudioBook'],
    });
  });

  it('fetchNextUp asks for 20 items, without resumable ones', async () => {
    showApi.getNextUp.mockResolvedValue({data: {Items: [{Id: 'e1'}]}});

    await expect(fetchNextUp(api, 'u1')).resolves.toEqual([{Id: 'e1'}]);
    expect(showApi.getNextUp).toHaveBeenCalledWith({
      userId: 'u1',
      limit: 20,
      fields: BROWSE_FIELDS,
      imageTypeLimit: 1,
      enableTotalRecordCount: false,
      enableResumable: false,
    });
  });

  it('fetchLatest asks for 20 grouped items in one library', async () => {
    libraryApi.getLatestMedia.mockResolvedValue({data: [{Id: 's1'}]});

    await expect(fetchLatest(api, 'u1', 'lib-shows')).resolves.toEqual([
      {Id: 's1'},
    ]);
    expect(libraryApi.getLatestMedia).toHaveBeenCalledWith({
      userId: 'u1',
      parentId: 'lib-shows',
      limit: 20,
      fields: BROWSE_FIELDS,
      imageTypeLimit: 1,
      groupItems: true,
    });
  });

  it('passes errors through', async () => {
    libraryApi.getResumeItems.mockRejectedValue(httpError(500));
    await expect(fetchResume(api, 'u1')).rejects.toThrow('HTTP 500');
  });
});

describe('latestLibraries', () => {
  const views = [MOVIES, SHOWS, MUSIC, MIXED];

  it('keeps the Movies and TV libraries', () => {
    expect(latestLibraries(views, {})).toEqual([MOVIES, SHOWS]);
  });

  it('honours LatestItemsExcludes', () => {
    expect(
      latestLibraries(views, {
        Configuration: {LatestItemsExcludes: ['lib-movies']},
      }),
    ).toEqual([SHOWS]);
  });
});

describe('isUnauthorized', () => {
  it('is true for an HTTP 401', () => {
    expect(isUnauthorized(httpError(401))).toBe(true);
  });

  it('is false for other failures', () => {
    expect(isUnauthorized(httpError(500))).toBe(false);
    expect(
      isUnauthorized(
        Object.assign(new Error('Network Error'), {isAxiosError: true}),
      ),
    ).toBe(false);
    expect(isUnauthorized(new Error('boom'))).toBe(false);
    expect(isUnauthorized(undefined)).toBe(false);
  });
});

describe('homeKeys', () => {
  it('scopes every key to the server and user', () => {
    const keys = [
      homeKeys.sections('srv1', 'u1'),
      homeKeys.myMedia('srv1', 'u1'),
      homeKeys.resume('srv1', 'u1'),
      homeKeys.nextUp('srv1', 'u1'),
      homeKeys.latest('srv1', 'u1', 'lib-movies'),
    ];
    for (const key of keys) {
      expect(key.slice(0, 3)).toEqual(['home', 'srv1', 'u1']);
    }
    expect(homeKeys.latest('srv1', 'u1', 'lib-movies')).not.toEqual(
      homeKeys.latest('srv1', 'u1', 'lib-shows'),
    );
  });
});

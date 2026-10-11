import {CollectionType} from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import {ItemSortBy} from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import {SortOrder} from '@jellyfin/sdk/lib/generated-client/models/sort-order';

/** The library types the grid browses: movies and TV shows only. */
export type LibraryKind =
  | typeof CollectionType.Movies
  | typeof CollectionType.Tvshows;

/** One entry in the Sort by picker. The option sets its own order. */
export type LibrarySortOption = {
  sortBy: ItemSortBy;
  sortOrder: SortOrder;
  label: string;
};

const name: LibrarySortOption = {
  sortBy: ItemSortBy.SortName,
  sortOrder: SortOrder.Ascending,
  label: 'Name',
};

const shared = (dateAddedLabel: string): LibrarySortOption[] => [
  name,
  {
    sortBy: ItemSortBy.DateCreated,
    sortOrder: SortOrder.Descending,
    label: dateAddedLabel,
  },
  {
    sortBy: ItemSortBy.PremiereDate,
    sortOrder: SortOrder.Descending,
    label: 'Premier date',
  },
  {
    sortBy: ItemSortBy.OfficialRating,
    sortOrder: SortOrder.Ascending,
    label: 'Rating',
  },
  {
    sortBy: ItemSortBy.CommunityRating,
    sortOrder: SortOrder.Descending,
    label: 'Community rating',
  },
  {
    sortBy: ItemSortBy.CriticRating,
    sortOrder: SortOrder.Descending,
    label: 'Critic rating',
  },
];

/** androidtv's sort options (BrowseGridFragment), in its order and wording. */
export const LIBRARY_SORT_OPTIONS: Record<
  LibraryKind,
  readonly LibrarySortOption[]
> = {
  [CollectionType.Movies]: [
    ...shared('Date added'),
    {
      sortBy: ItemSortBy.DatePlayed,
      sortOrder: SortOrder.Descending,
      label: 'Last played',
    },
    {
      sortBy: ItemSortBy.Runtime,
      sortOrder: SortOrder.Ascending,
      label: 'Runtime',
    },
  ],
  [CollectionType.Tvshows]: [
    ...shared('Date show added'),
    {
      sortBy: ItemSortBy.SeriesDatePlayed,
      sortOrder: SortOrder.Descending,
      label: 'Last played',
    },
    {
      sortBy: ItemSortBy.DateLastContentAdded,
      sortOrder: SortOrder.Descending,
      label: 'Date episode added',
    },
  ],
};

export type LibraryFilters = {
  unwatchedOnly: boolean;
  favoritesOnly: boolean;
};

/** What's saved per library in the server's DisplayPreferences. */
export type LibraryPrefs = {
  sortBy: ItemSortBy;
  sortOrder: SortOrder;
  filters: LibraryFilters;
};

export const DEFAULT_LIBRARY_PREFS: LibraryPrefs = {
  sortBy: ItemSortBy.SortName,
  sortOrder: SortOrder.Ascending,
  filters: {unwatchedOnly: false, favoritesOnly: false},
};

/** The letter jump's choices. `#` means names before A. */
export const LIBRARY_LETTERS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Everything the grid query depends on. The letter isn't saved. */
export type LibraryQuery = LibraryPrefs & {letter?: string};

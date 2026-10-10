import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {ImageType} from '@jellyfin/sdk/lib/generated-client/models/image-type';
import {LocationType} from '@jellyfin/sdk/lib/generated-client/models/location-type';
import {getImageApi} from '@jellyfin/sdk/lib/utils/api/image-api';

import type {CardVariant} from '../components/FocusableCard';
import type {CardItem} from '../components/types';
import {BASELINE_SCALE, layout} from '../theme';

/** JPEG quality the server encodes card and backdrop images with. */
export const IMAGE_QUALITY = 96;

/** Backdrops cover the 1080p canvas; never ask for more. */
export const BACKDROP_MAX_WIDTH = 1920;

/** Placeholder backgrounds for cards without an image (or still loading). */
export const PLACEHOLDER_COLORS = [
  '#2a3f6b',
  '#3b2f6e',
  '#1f4f5f',
  '#4a2d5c',
  '#24476b',
] as const;

/** An image on the server: which item it belongs to, its type and its tag. */
export type ItemImage = {
  itemId: string;
  type: ImageType;
  tag: string;
  /** Position among the item's backdrops. */
  index?: number;
};

export type ImageSize = {maxWidth?: number; maxHeight?: number};

export type ToCardItemOptions = {
  variant: CardVariant;
  /** Landscape rows (Continue Watching, Next Up) use thumbs over posters. */
  preferParentThumb?: boolean;
};

const LIBRARY_KINDS: ReadonlySet<BaseItemKind | undefined> = new Set([
  BaseItemKind.CollectionFolder,
  BaseItemKind.UserView,
]);

const isLibrary = (item: BaseItemDto) => LIBRARY_KINDS.has(item.Type);

/** Builds the URL of an image. The tag is always sent, so the server and the image cache can cache it. */
export function imageUrl(
  api: Api,
  image: ItemImage,
  size: ImageSize = {},
): string {
  return getImageApi(api).getItemImageUrlById(image.itemId, image.type, {
    tag: image.tag,
    imageIndex: image.index,
    ...size,
    quality: IMAGE_QUALITY,
  });
}

/**
 * Size to request for a card's image, in 1080p pixels. Posters are bound by
 * height and landscape cards by width, so a 16:9 image fills a landscape card
 * and a 2:3 one fills a poster card.
 */
export function cardImageSize(variant: CardVariant): ImageSize {
  const size = variant === 'poster' ? layout.posterCard : layout.landscapeCard;
  return variant === 'poster'
    ? {maxHeight: Math.round(size.height * BASELINE_SCALE)}
    : {maxWidth: Math.round(size.width * BASELINE_SCALE)};
}

const itemImage = (
  item: BaseItemDto,
  type: ImageType,
): ItemImage | undefined => {
  const tag = item.ImageTags?.[type];
  return item.Id && tag ? {itemId: item.Id, type, tag} : undefined;
};

const parentThumb = (item: BaseItemDto): ItemImage | undefined =>
  item.ParentThumbItemId && item.ParentThumbImageTag
    ? {
        itemId: item.ParentThumbItemId,
        type: ImageType.Thumb,
        tag: item.ParentThumbImageTag,
      }
    : undefined;

const seriesThumb = (item: BaseItemDto): ItemImage | undefined =>
  item.SeriesId && item.SeriesThumbImageTag
    ? {
        itemId: item.SeriesId,
        type: ImageType.Thumb,
        tag: item.SeriesThumbImageTag,
      }
    : undefined;

const seriesPrimary = (item: BaseItemDto): ItemImage | undefined =>
  item.SeriesId && item.SeriesPrimaryImageTag
    ? {
        itemId: item.SeriesId,
        type: ImageType.Primary,
        tag: item.SeriesPrimaryImageTag,
      }
    : undefined;

/** The item's own backdrops, in order. */
export function itemBackdrops(item: BaseItemDto): ItemImage[] {
  const id = item.Id;
  if (!id) {
    return [];
  }
  return (item.BackdropImageTags ?? []).map((tag, index) => ({
    itemId: id,
    type: ImageType.Backdrop,
    tag,
    index,
  }));
}

/** The parent's backdrops (a series' backdrops for an episode or season). */
export function parentBackdrops(item: BaseItemDto): ItemImage[] {
  const id = item.ParentBackdropItemId;
  if (!id) {
    return [];
  }
  return (item.ParentBackdropImageTags ?? []).map((tag, index) => ({
    itemId: id,
    type: ImageType.Backdrop,
    tag,
    index,
  }));
}

/**
 * Picks the image a card shows, following androidtv's `getImage`:
 * - library: its Primary (16:9);
 * - landscape: for an episode, the parent or series thumb first, then its own
 *   Thumb and Primary (an episode still); for anything else its Thumb, the
 *   parent or series thumb, a backdrop, then Primary;
 * - poster: Primary; a season or episode without one uses the series poster.
 */
export function cardImage(
  item: BaseItemDto,
  {variant, preferParentThumb = false}: ToCardItemOptions,
): ItemImage | undefined {
  const primary = itemImage(item, ImageType.Primary);
  if (isLibrary(item)) {
    return primary;
  }

  const isEpisode = item.Type === BaseItemKind.Episode;
  if (variant === 'landscape' && preferParentThumb) {
    const backdrop = itemBackdrops(item)[0] ?? parentBackdrops(item)[0];
    const candidates = isEpisode
      ? [
          parentThumb(item),
          seriesThumb(item),
          itemImage(item, ImageType.Thumb),
          primary,
          backdrop,
        ]
      : [
          itemImage(item, ImageType.Thumb),
          parentThumb(item),
          seriesThumb(item),
          backdrop,
          primary,
        ];
    return candidates.find(Boolean);
  }

  if (variant === 'landscape') {
    return (
      itemImage(item, ImageType.Thumb) ?? primary ?? itemBackdrops(item)[0]
    );
  }

  const usesSeriesPoster = isEpisode || item.Type === BaseItemKind.Season;
  return primary ?? (usesSeriesPoster ? seriesPrimary(item) : undefined);
}

/** Backdrop URLs for the background: the item's, then its parent's, like androidtv's BackgroundService. */
export function backdropUris(item: BaseItemDto, api: Api): string[] {
  const urls = [...itemBackdrops(item), ...parentBackdrops(item)].map((image) =>
    imageUrl(api, image, {maxWidth: BACKDROP_MAX_WIDTH}),
  );
  return [...new Set(urls)];
}

/** A stable placeholder colour for an item, so a card keeps its colour across renders. */
export function placeholderColor(id: string): string {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000003;
  }
  return PLACEHOLDER_COLORS[hash % PLACEHOLDER_COLORS.length];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dayOfYear = (date: Date) =>
  Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 1)) /
      86400000,
  ) + 1;

/** en-US short date and time, e.g. `3/14/25, 9:05 PM`. */
const shortDateTime = (date: Date) => {
  const hours = date.getHours();
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const year = `${date.getFullYear() % 100}`.padStart(2, '0');
  return (
    `${date.getMonth() + 1}/${date.getDate()}/${year}, ` +
    `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`
  );
};

/**
 * androidtv's `TimeUtils.getFriendlyDate`: Today, Tomorrow, a weekday within
 * the next week, otherwise a short date and time, all in the device's local
 * time. Like androidtv, Tomorrow and the weekday never cross a new year.
 */
export function friendlyDate(date: Date, now: Date = new Date()): string {
  if (date.getFullYear() === now.getFullYear()) {
    const day = dayOfYear(date);
    const today = dayOfYear(now);
    if (day === today) {
      return 'Today';
    }
    if (day === today + 1) {
      return 'Tomorrow';
    }
    if (day > today && day < today + 7) {
      return WEEKDAYS[date.getDay()];
    }
  }
  return shortDateTime(date);
}

/**
 * androidtv's `getFullName` for an episode: the series name, then `S1 E2`,
 * `S1 E2–3` or `special`, joined with spaces.
 */
export function episodeFullName(item: BaseItemDto): string {
  const parts: (string | null | undefined)[] = [item.SeriesName];
  if (item.ParentIndexNumber === 0) {
    parts.push('special');
  } else {
    if (item.ParentIndexNumber != null) {
      parts.push(`S${item.ParentIndexNumber}`);
    }
    if (item.IndexNumber != null && item.IndexNumberEnd != null) {
      parts.push(`E${item.IndexNumber}–${item.IndexNumberEnd}`);
    } else if (item.IndexNumber != null) {
      parts.push(`E${item.IndexNumber}`);
    }
  }
  return parts.filter((part) => part && part.trim()).join(' ');
}

/** androidtv's `getSubName` for an episode: its name, plus the premiere date when it isn't in the library yet. */
const episodeSubName = (item: BaseItemDto, now?: Date) => {
  if (
    item.LocationType === LocationType.Virtual &&
    item.Name &&
    item.PremiereDate
  ) {
    const date = new Date(item.PremiereDate);
    if (!Number.isNaN(date.getTime())) {
      return `${item.Name} (${friendlyDate(date, now)})`;
    }
  }
  return item.Name || undefined;
};

const episodeCount = (count?: number | null) =>
  count != null && count > 0
    ? `${count} ${count === 1 ? 'episode' : 'episodes'}`
    : undefined;

/**
 * Card title and subtitle, following androidtv's `getCardName` / `getSubText`:
 * - episode: `Lost S1 E2`, then the episode name;
 * - season: its name, then `N episodes`;
 * - library: its name only;
 * - anything else: its name, then its official rating.
 */
export function cardText(
  item: BaseItemDto,
  now?: Date,
): {title: string; subtitle?: string} {
  const name = item.Name ?? '';
  if (isLibrary(item)) {
    return {title: name};
  }
  switch (item.Type) {
    case BaseItemKind.Episode:
      return {
        // androidtv would show a blank title; fall back to the episode name.
        title: episodeFullName(item) || name,
        subtitle: episodeSubName(item, now),
      };
    case BaseItemKind.Season:
      return {title: name, subtitle: episodeCount(item.ChildCount)};
    default:
      return {title: name, subtitle: item.OfficialRating || undefined};
  }
}

/** Watch progress, 0..1, only while partly watched. */
export function watchProgress(item: BaseItemDto): number | undefined {
  const percent = item.UserData?.PlayedPercentage;
  return percent != null && percent > 0 && percent < 100
    ? percent / 100
    : undefined;
}

/** Maps a Jellyfin item to the view model ContentRow and PosterGrid render. */
export function toCardItem(
  item: BaseItemDto,
  api: Api,
  options: ToCardItemOptions,
): CardItem {
  const id = item.Id ?? '';
  const image = cardImage(item, options);
  return {
    id,
    ...cardText(item),
    imageUri: image
      ? imageUrl(api, image, cardImageSize(options.variant))
      : undefined,
    placeholderColor: placeholderColor(id),
    progress: watchProgress(item),
    played: item.UserData?.Played === true,
    backdropUris: backdropUris(item, api),
  };
}

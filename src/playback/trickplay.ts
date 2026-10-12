import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type {TrickplayInfoDto} from '@jellyfin/sdk/lib/generated-client/models/trickplay-info-dto';

import type {TrickplayInfo, TrickplayTile} from './types';

/** The resolution picked when the server has it (Jellyfin's default width). */
export const PREFERRED_TRICKPLAY_WIDTH = 320;

const positive = (value?: number | null): value is number =>
  value != null && value > 0;

/**
 * The trickplay resolution to use for `mediaSourceId`: width 320 when the
 * server has it, else the smallest. androidtv takes the first resolution the
 * server lists; this makes the pick independent of map order. Undefined when
 * the item has no trickplay for that source, or the resolution is missing a
 * size, tile layout, count or interval.
 */
export function trickplayInfo(
  item: BaseItemDto,
  mediaSourceId: string,
): TrickplayInfo | undefined {
  const itemId = item.Id;
  const resolutions = item.Trickplay?.[mediaSourceId];
  if (!itemId || !resolutions) {
    return undefined;
  }
  const dtos = Object.values(resolutions).filter((dto) =>
    positive(dto.Width),
  ) as (TrickplayInfoDto & {Width: number})[];
  const dto =
    dtos.find((candidate) => candidate.Width === PREFERRED_TRICKPLAY_WIDTH) ??
    [...dtos].sort((a, b) => a.Width - b.Width)[0];
  if (
    !dto ||
    !positive(dto.Height) ||
    !positive(dto.TileWidth) ||
    !positive(dto.TileHeight) ||
    !positive(dto.ThumbnailCount) ||
    !positive(dto.Interval)
  ) {
    return undefined;
  }
  return {
    itemId,
    mediaSourceId,
    width: dto.Width,
    height: dto.Height,
    tileWidth: dto.TileWidth,
    tileHeight: dto.TileHeight,
    thumbnailCount: dto.ThumbnailCount,
    intervalMs: dto.Interval,
  };
}

/**
 * The tile sheet `/Videos/{id}/Trickplay/{width}/{index}.jpg`. SDK 1.0.0 has
 * no URL helper for it (only `getTrickPlayApi().getTrickplayTileImage`, which
 * fetches), so it's built like `directPlayUrl`. RN `Image` sends no auth
 * header, so the token goes in `api_key`.
 */
export function trickplaySheetUrl(
  api: Api,
  info: TrickplayInfo,
  index: number,
): string {
  const params: [string, string | undefined][] = [
    ['mediaSourceId', info.mediaSourceId],
    ['api_key', api.accessToken || undefined],
  ];
  const query = params
    .filter((param): param is [string, string] => !!param[1])
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `${api.basePath}/Videos/${encodeURIComponent(info.itemId)}/Trickplay/${
    info.width
  }/${index}.jpg?${query}`;
}

/**
 * The thumbnail for `positionMs`, as androidtv's
 * `CustomSeekProvider.getThumbnail`: thumbnail `floor(ms / interval)`, here
 * clamped to the ones that exist, then its sheet and its cell in the sheet.
 * Undefined when the info has no usable layout.
 */
export function trickplayTile(
  api: Api,
  info: TrickplayInfo,
  positionMs: number,
): TrickplayTile | undefined {
  const {width, height, tileWidth, tileHeight, thumbnailCount, intervalMs} =
    info;
  if (
    !positive(width) ||
    !positive(height) ||
    !positive(tileWidth) ||
    !positive(tileHeight) ||
    !positive(thumbnailCount) ||
    !positive(intervalMs) ||
    !Number.isFinite(positionMs)
  ) {
    return undefined;
  }
  const thumbnail = Math.min(
    Math.max(Math.floor(positionMs / intervalMs), 0),
    thumbnailCount - 1,
  );
  const perSheet = tileWidth * tileHeight;
  const sheet = Math.floor(thumbnail / perSheet);
  const cell = thumbnail % perSheet;
  return {
    url: trickplaySheetUrl(api, info, sheet),
    sheetWidth: width * tileWidth,
    sheetHeight: height * tileHeight,
    offsetX: (cell % tileWidth) * width,
    offsetY: Math.floor(cell / tileWidth) * height,
    width,
    height,
  };
}

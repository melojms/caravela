import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {ImageType} from '@jellyfin/sdk/lib/generated-client/models/image-type';

import {ticksToMs} from '../api/itemInfo';
import {cardImageSize, imageUrl} from '../api/items';
import type {Chapter} from './types';

/**
 * androidtv's `buildChapterItems`: the item's chapters in server order, each
 * with its start and, when it has an `ImageTag`, the chapter image sized for
 * a landscape (16:9, 400 px) card. androidtv shows a chapter without a name
 * with an empty title; so does this.
 */
export function itemChapters(api: Api, item: BaseItemDto): Chapter[] {
  const itemId = item.Id;
  return (item.Chapters ?? []).map((chapter, index) => ({
    index,
    name: chapter.Name ?? '',
    startMs: ticksToMs(chapter.StartPositionTicks ?? 0),
    imageUrl:
      itemId && chapter.ImageTag
        ? imageUrl(
            api,
            {itemId, type: ImageType.Chapter, tag: chapter.ImageTag, index},
            cardImageSize('landscape'),
          )
        : undefined,
  }));
}

/**
 * androidtv's `getCurrentChapterIndex`: the last chapter starting at or before
 * `positionMs`. Before the first chapter it's 0 (androidtv's -1 there leaves
 * its row on the first card anyway); -1 when there are no chapters.
 */
export function currentChapterIndex(
  chapters: Chapter[],
  positionMs: number,
): number {
  if (chapters.length === 0) {
    return -1;
  }
  const next = chapters.findIndex((chapter) => chapter.startMs > positionMs);
  const current = next === -1 ? chapters.length - 1 : next - 1;
  return Math.max(current, 0);
}

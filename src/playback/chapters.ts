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
 * androidtv's `getCurrentChapterIndex`: the chapter starting last at or before
 * `positionMs` (of several with that start, the last in the list). Before
 * every chapter it's the earliest one: 0 when sorted (androidtv's -1 there
 * leaves its row on the first card anyway); -1 when there are no chapters.
 * Chapters stay in server order, so this doesn't assume they're sorted by
 * start (androidtv does, and picks a wrong chapter when they aren't).
 */
export function currentChapterIndex(
  chapters: Chapter[],
  positionMs: number,
): number {
  let current = -1;
  let earliest = -1;
  chapters.forEach(({startMs}, index) => {
    if (
      startMs <= positionMs &&
      (current === -1 || startMs >= chapters[current].startMs)
    ) {
      current = index;
    }
    if (earliest === -1 || startMs < chapters[earliest].startMs) {
      earliest = index;
    }
  });
  return current === -1 ? earliest : current;
}

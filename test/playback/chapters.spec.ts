import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {getImageApi} from '@jellyfin/sdk/lib/utils/api/image-api';

import {currentChapterIndex, itemChapters} from '../../src/playback/chapters';
import type {Chapter} from '../../src/playback/types';

jest.mock('@jellyfin/sdk/lib/utils/api/image-api', () => ({
  getImageApi: jest.fn(),
}));

const imageApi = {
  getItemImageUrlById: jest.fn(
    (
      id: string,
      type: string,
      params: {tag: string; imageIndex?: number; maxWidth?: number},
    ) =>
      `https://jf/Items/${id}/Images/${type}?tag=${params.tag}&imageIndex=${params.imageIndex}&maxWidth=${params.maxWidth}`,
  ),
};

const api = {} as Api;

beforeEach(() => {
  jest.clearAllMocks();
  (getImageApi as jest.Mock).mockReturnValue(imageApi);
});

const MS = 10000;

describe('itemChapters', () => {
  it('maps the chapters in server order', () => {
    const item: BaseItemDto = {
      Id: 'item-1',
      Chapters: [
        {Name: 'Opening', StartPositionTicks: 0, ImageTag: 'tag0'},
        {Name: 'Act 2', StartPositionTicks: 600_000 * MS},
        {Name: 'Act 1', StartPositionTicks: 90_500 * MS + 9999},
      ],
    };
    expect(itemChapters(api, item)).toEqual([
      {
        index: 0,
        name: 'Opening',
        startMs: 0,
        imageUrl:
          'https://jf/Items/item-1/Images/Chapter?tag=tag0&imageIndex=0&maxWidth=400',
      },
      {index: 1, name: 'Act 2', startMs: 600_000, imageUrl: undefined},
      {index: 2, name: 'Act 1', startMs: 90_500, imageUrl: undefined},
    ]);
  });

  it('asks for the chapter image by its index', () => {
    itemChapters(api, {
      Id: 'item-1',
      Chapters: [{StartPositionTicks: 0}, {ImageTag: 'tag1'}],
    });
    expect(imageApi.getItemImageUrlById).toHaveBeenCalledTimes(1);
    expect(imageApi.getItemImageUrlById).toHaveBeenCalledWith(
      'item-1',
      'Chapter',
      expect.objectContaining({tag: 'tag1', imageIndex: 1, maxWidth: 400}),
    );
  });

  it('has no image without a tag or an item id', () => {
    const chapters = itemChapters(api, {
      Id: 'item-1',
      Chapters: [{ImageTag: ''}, {ImageTag: null}],
    });
    expect(chapters.map((chapter) => chapter.imageUrl)).toEqual([
      undefined,
      undefined,
    ]);
    expect(
      itemChapters(api, {Chapters: [{ImageTag: 'tag0'}]})[0].imageUrl,
    ).toBeUndefined();
  });

  it('leaves an unnamed chapter blank and a missing start at 0', () => {
    expect(itemChapters(api, {Id: 'item-1', Chapters: [{}]})).toEqual([
      {index: 0, name: '', startMs: 0, imageUrl: undefined},
    ]);
  });

  it('is empty without chapters', () => {
    expect(itemChapters(api, {Id: 'item-1'})).toEqual([]);
    expect(itemChapters(api, {Id: 'item-1', Chapters: null})).toEqual([]);
  });
});

describe('currentChapterIndex', () => {
  const chapters: Chapter[] = [
    {index: 0, name: 'A', startMs: 5000},
    {index: 1, name: 'B', startMs: 60_000},
    {index: 2, name: 'C', startMs: 120_000},
  ];

  it('is 0 before the first chapter', () => {
    expect(currentChapterIndex(chapters, 0)).toBe(0);
    expect(currentChapterIndex(chapters, 4999)).toBe(0);
  });

  it('picks a chapter from its exact start', () => {
    expect(currentChapterIndex(chapters, 5000)).toBe(0);
    expect(currentChapterIndex(chapters, 59_999)).toBe(0);
    expect(currentChapterIndex(chapters, 60_000)).toBe(1);
    expect(currentChapterIndex(chapters, 120_000)).toBe(2);
  });

  it('stays on the last chapter after its start', () => {
    expect(currentChapterIndex(chapters, 10_000_000)).toBe(2);
  });

  it('is -1 without chapters', () => {
    expect(currentChapterIndex([], 0)).toBe(-1);
  });

  describe('with chapters out of start order', () => {
    // Server order, as itemChapters keeps it: the row shows them like this.
    const unsorted: Chapter[] = [
      {index: 0, name: 'Opening', startMs: 5000},
      {index: 1, name: 'Act 2', startMs: 600_000},
      {index: 2, name: 'Act 1', startMs: 90_500},
      {index: 3, name: 'Credits', startMs: 1_200_000},
    ];

    it('picks the chapter that started last, wherever it is in the list', () => {
      expect(currentChapterIndex(unsorted, 5000)).toBe(0);
      expect(currentChapterIndex(unsorted, 90_499)).toBe(0);
      expect(currentChapterIndex(unsorted, 90_500)).toBe(2);
      expect(currentChapterIndex(unsorted, 599_999)).toBe(2);
      expect(currentChapterIndex(unsorted, 600_000)).toBe(1);
      expect(currentChapterIndex(unsorted, 1_200_000)).toBe(3);
      expect(currentChapterIndex(unsorted, 10_000_000)).toBe(3);
    });

    it('is the earliest chapter before every start', () => {
      const lateFirst: Chapter[] = [
        {index: 0, name: 'B', startMs: 60_000},
        {index: 1, name: 'A', startMs: 5000},
      ];
      expect(currentChapterIndex(lateFirst, 0)).toBe(1);
      expect(currentChapterIndex(lateFirst, 5000)).toBe(1);
      expect(currentChapterIndex(lateFirst, 60_000)).toBe(0);
    });

    it('takes the last of chapters sharing a start', () => {
      const shared: Chapter[] = [
        {index: 0, name: 'A', startMs: 0},
        {index: 1, name: 'B', startMs: 30_000},
        {index: 2, name: 'B2', startMs: 30_000},
      ];
      expect(currentChapterIndex(shared, 30_000)).toBe(2);
      expect(currentChapterIndex([...shared].reverse(), 30_000)).toBe(1);
    });
  });
});

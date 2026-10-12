import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type {TrickplayInfoDto} from '@jellyfin/sdk/lib/generated-client/models/trickplay-info-dto';

import {
  trickplayInfo,
  trickplaySheetUrl,
  trickplayTile,
} from '../../src/playback/trickplay';
import type {TrickplayInfo} from '../../src/playback/types';

const api = {
  basePath: 'https://jf.example/base',
  accessToken: 'tok en/+',
} as unknown as Api;

const dto = (width: number, fields: Partial<TrickplayInfoDto> = {}) => ({
  Width: width,
  Height: Math.round((width * 9) / 16),
  TileWidth: 10,
  TileHeight: 10,
  ThumbnailCount: 250,
  Interval: 10000,
  Bandwidth: 1000,
  ...fields,
});

const item = (
  resolutions: Record<string, TrickplayInfoDto>,
  sourceId = 'source-1',
): BaseItemDto => ({Id: 'item-1', Trickplay: {[sourceId]: resolutions}});

// 10×10 cells of 320×180 per sheet, one every 10 s; 250 thumbnails = 3 sheets.
const INFO: TrickplayInfo = {
  itemId: 'item-1',
  mediaSourceId: 'source-1',
  width: 320,
  height: 180,
  tileWidth: 10,
  tileHeight: 10,
  thumbnailCount: 250,
  intervalMs: 10000,
};

describe('trickplayInfo', () => {
  it('maps the resolution for the media source', () => {
    expect(trickplayInfo(item({320: dto(320)}), 'source-1')).toEqual(INFO);
  });

  it('prefers width 320', () => {
    const info = trickplayInfo(
      item({160: dto(160), 640: dto(640), 320: dto(320)}),
      'source-1',
    );
    expect(info?.width).toBe(320);
  });

  it('takes the smallest width without a 320 one', () => {
    const info = trickplayInfo(
      item({640: dto(640), 480: dto(480), 1280: dto(1280)}),
      'source-1',
    );
    expect(info).toMatchObject({width: 480, height: 270});
  });

  it('is undefined without trickplay for the source', () => {
    expect(trickplayInfo({Id: 'item-1'}, 'source-1')).toBeUndefined();
    expect(
      trickplayInfo(item({320: dto(320)}, 'other'), 'source-1'),
    ).toBeUndefined();
    expect(trickplayInfo(item({}), 'source-1')).toBeUndefined();
    expect(
      trickplayInfo({Trickplay: {'source-1': {320: dto(320)}}}, 'source-1'),
    ).toBeUndefined();
  });

  it.each([
    ['Height', {Height: undefined}],
    ['TileWidth', {TileWidth: 0}],
    ['TileHeight', {TileHeight: -1}],
    ['ThumbnailCount', {ThumbnailCount: undefined}],
    ['Interval', {Interval: 0}],
  ])('is undefined with no usable %s', (_, fields) => {
    expect(
      trickplayInfo(item({320: dto(320, fields)}), 'source-1'),
    ).toBeUndefined();
  });

  it('skips resolutions without a width', () => {
    expect(
      trickplayInfo(item({0: dto(0), 640: dto(640)}), 'source-1')?.width,
    ).toBe(640);
    expect(trickplayInfo(item({0: dto(0)}), 'source-1')).toBeUndefined();
  });
});

describe('trickplayTile', () => {
  const tile = (positionMs: number) => trickplayTile(api, INFO, positionMs);

  it('finds the first cell at 0', () => {
    expect(tile(0)).toEqual({
      url: trickplaySheetUrl(api, INFO, 0),
      sheetWidth: 3200,
      sheetHeight: 1800,
      offsetX: 0,
      offsetY: 0,
      width: 320,
      height: 180,
    });
  });

  it('finds a cell mid-sheet', () => {
    // 345 s → thumbnail 34: row 3, column 4.
    expect(tile(345_000)).toMatchObject({
      url: trickplaySheetUrl(api, INFO, 0),
      offsetX: 4 * 320,
      offsetY: 3 * 180,
    });
  });

  it('starts the second sheet at its first cell', () => {
    expect(tile(1_000_000)).toMatchObject({
      url: trickplaySheetUrl(api, INFO, 1),
      offsetX: 0,
      offsetY: 0,
    });
    expect(tile(999_999)).toMatchObject({
      url: trickplaySheetUrl(api, INFO, 0),
      offsetX: 9 * 320,
      offsetY: 9 * 180,
    });
  });

  it('clamps past the end to the last thumbnail', () => {
    // Thumbnail 249: sheet 2, cell 49 (row 4, column 9).
    const last = {
      url: trickplaySheetUrl(api, INFO, 2),
      offsetX: 9 * 320,
      offsetY: 4 * 180,
    };
    expect(tile(2_490_000)).toMatchObject(last);
    expect(tile(99_000_000)).toMatchObject(last);
  });

  it('clamps a negative position to the first thumbnail', () => {
    expect(tile(-5000)).toMatchObject({
      url: trickplaySheetUrl(api, INFO, 0),
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('handles a non-square sheet layout', () => {
    const info = {...INFO, tileWidth: 5, tileHeight: 2, thumbnailCount: 30};
    // Thumbnail 13: sheet 1, cell 3 (row 0, column 3).
    expect(trickplayTile(api, info, 130_000)).toMatchObject({
      url: trickplaySheetUrl(api, info, 1),
      sheetWidth: 1600,
      sheetHeight: 360,
      offsetX: 3 * 320,
      offsetY: 0,
    });
  });

  it('is undefined without a usable layout or position', () => {
    expect(trickplayTile(api, {...INFO, intervalMs: 0}, 0)).toBeUndefined();
    expect(trickplayTile(api, {...INFO, tileWidth: 0}, 0)).toBeUndefined();
    expect(trickplayTile(api, {...INFO, thumbnailCount: 0}, 0)).toBeUndefined();
    expect(trickplayTile(api, INFO, Number.NaN)).toBeUndefined();
  });
});

describe('trickplaySheetUrl', () => {
  it('has the width, index, media source and token', () => {
    const url = new URL(trickplaySheetUrl(api, INFO, 2));
    expect(url.origin + url.pathname).toBe(
      'https://jf.example/base/Videos/item-1/Trickplay/320/2.jpg',
    );
    expect(url.searchParams.get('mediaSourceId')).toBe('source-1');
    expect(url.searchParams.get('api_key')).toBe('tok en/+');
  });

  it('leaves out the token when signed out', () => {
    const url = trickplaySheetUrl(
      {...api, accessToken: ''} as unknown as Api,
      INFO,
      0,
    );
    expect(url).toBe(
      'https://jf.example/base/Videos/item-1/Trickplay/320/0.jpg?mediaSourceId=source-1',
    );
  });
});

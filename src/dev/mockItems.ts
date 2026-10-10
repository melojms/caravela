/**
 * ============================================================
 * DEV ONLY: MOCK DATA, NOT FROM JELLYFIN.
 * Lets Home and Movies be tested for focus and scrolling without
 * a server. Delete it once real library data lands (tasks 5 and 6).
 * ============================================================
 */
import {CardItem} from '../components/types';

const PALETTE = ['#2a3f6b', '#3b2f6e', '#1f4f5f', '#4a2d5c', '#24476b'];

const makeItems = (
  prefix: string,
  label: string,
  count: number,
  extra: (i: number) => Partial<CardItem> = () => ({}),
  start = 0,
): CardItem[] =>
  Array.from({length: count}, (_, n) => {
    const i = start + n;
    return {
      id: `${prefix}-${i}`,
      title: `${label} ${i + 1}`,
      placeholderColor: PALETTE[i % PALETTE.length],
      ...extra(i),
    };
  });

export const mockContinueWatching = makeItems(
  'mock-resume',
  'Episode',
  8,
  (i) => ({
    subtitle: `Mock Show · S1:E${i + 1}`,
    progress: 0.15 + (i % 5) * 0.17,
  }),
);

export const mockLatestMovies = makeItems(
  'mock-latest-movie',
  'Movie',
  12,
  (i) => ({subtitle: `${2020 + (i % 6)}`, played: i % 4 === 1}),
);

export const mockLatestShows = makeItems(
  'mock-latest-show',
  'Show',
  12,
  (i) => ({subtitle: `${1 + (i % 4)} seasons`}),
);

export const MOCK_MOVIES_PAGE_SIZE = 36;
export const MOCK_MOVIES_TOTAL = 144;

/** Returns one page of fake movies, simulating a paged library query. */
export const mockMoviesPage = (page: number): CardItem[] => {
  const start = page * MOCK_MOVIES_PAGE_SIZE;
  const count = Math.max(
    0,
    Math.min(MOCK_MOVIES_PAGE_SIZE, MOCK_MOVIES_TOTAL - start),
  );
  return makeItems(
    'mock-movie',
    'Movie',
    count,
    (i) => ({subtitle: `${1990 + (i % 35)}`, played: i % 7 === 3}),
    start,
  );
};

import {useEffect, useState} from 'react';

/** A run of cue text with the same `<i>` / `<b>` / `<u>` flags. */
export type SubtitleSpan = {
  text: string;
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
};

/** One WebVTT cue: shown while `startMs <= position < endMs`. */
export type SubtitleCue = {
  startMs: number;
  endMs: number;
  /** The cue's text lines, each a list of styled spans. Never empty. */
  lines: SubtitleSpan[][];
};

// `hh:mm:ss.mmm` (hours may be longer than 2 digits) or `mm:ss.mmm`. A comma
// before the milliseconds is accepted too, for SRT-flavoured files.
const TIMESTAMP = String.raw`(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})`;
const TIMING = new RegExp(
  String.raw`^\s*${TIMESTAMP}\s+-->\s+${TIMESTAMP}(?:\s.*)?$`,
);

const toMs = (h: string | undefined, m: string, s: string, ms: string) =>
  ((Number(h ?? 0) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(ms);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lrm: '‎',
  rlm: '‏',
};

const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });

type Flag = 'italic' | 'bold' | 'underline';
const FLAG_TAGS: Record<string, Flag> = {
  i: 'italic',
  b: 'bold',
  u: 'underline',
};

/** The tag name: `c.yellow` → `c`, `v Name` → `v`, `/i` → `i`. */
const tagName = (tag: string) =>
  tag.replace(/^\//, '').split(/[.\s]/)[0].toLowerCase();

const sameFlags = (a: SubtitleSpan, b: SubtitleSpan) =>
  !!a.italic === !!b.italic &&
  !!a.bold === !!b.bold &&
  !!a.underline === !!b.underline;

/** Drops the line's outer whitespace and any spans left empty. */
const trimLine = (line: SubtitleSpan[]): SubtitleSpan[] => {
  if (line.length > 0) {
    line[0].text = line[0].text.replace(/^\s+/, '');
    const last = line[line.length - 1];
    last.text = last.text.replace(/\s+$/, '');
  }
  return line.filter((span) => span.text.length > 0);
};

/**
 * Turns cue text into lines of spans. `<i>`, `<b>` and `<u>` set span flags
 * (nesting and spanning lines); every other tag (`<c.x>`, `<v Name>`,
 * `<lang>`, `<ruby>`, `<rt>`, inline timestamps) is dropped, keeping its text.
 */
const parseCueText = (text: string): SubtitleSpan[][] => {
  const open: Flag[] = [];
  const lines: SubtitleSpan[][] = [[]];

  const addText = (raw: string) => {
    decodeEntities(raw)
      .split('\n')
      .forEach((part, i) => {
        if (i > 0) {
          lines.push([]);
        }
        if (!part) {
          return;
        }
        const span: SubtitleSpan = {text: part};
        open.forEach((flag) => (span[flag] = true));
        const line = lines[lines.length - 1];
        const previous = line[line.length - 1];
        if (previous && sameFlags(previous, span)) {
          previous.text += part;
        } else {
          line.push(span);
        }
      });
  };

  // A `<` with no closing `>` is literal text.
  const token = /<([^>]*)>|([^<]+|<)/g;
  for (let match = token.exec(text); match; match = token.exec(text)) {
    const [, tag, plain] = match;
    if (plain !== undefined) {
      addText(plain);
      continue;
    }
    const flag = FLAG_TAGS[tagName(tag)];
    if (!flag) {
      continue;
    }
    if (tag.startsWith('/')) {
      const at = open.lastIndexOf(flag);
      if (at >= 0) {
        open.splice(at, 1);
      }
    } else {
      open.push(flag);
    }
  }

  return lines.map(trimLine).filter((line) => line.length > 0);
};

/** `NOTE`, `STYLE` and `REGION` blocks: the keyword alone or before a space. */
const isMetadataBlock = (firstLine: string) =>
  /^(NOTE|STYLE|REGION)(\s|$)/.test(firstLine);

const parseBlock = (lines: string[]): SubtitleCue | undefined => {
  // The timing line comes first, or second after a cue identifier.
  const timingAt = lines.findIndex((line) => line.includes('-->'));
  if (timingAt < 0 || timingAt > 1) {
    return undefined;
  }
  const timing = TIMING.exec(lines[timingAt]);
  if (!timing) {
    return undefined;
  }
  const startMs = toMs(timing[1], timing[2], timing[3], timing[4]);
  const endMs = toMs(timing[5], timing[6], timing[7], timing[8]);
  if (endMs <= startMs) {
    return undefined;
  }
  const cueLines = parseCueText(lines.slice(timingAt + 1).join('\n'));
  return cueLines.length > 0 ? {startMs, endMs, lines: cueLines} : undefined;
};

/**
 * Parses a WebVTT file into cues sorted by start time. Copes with a BOM,
 * CRLF/CR line ends, header text, `NOTE`/`STYLE`/`REGION` blocks, cue ids,
 * both timestamp forms and cue settings (ignored). Malformed cues are skipped.
 */
export const parseVtt = (text: string): SubtitleCue[] => {
  const blocks = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n(?:[ \t]*\n)+/);

  const cues: SubtitleCue[] = [];
  blocks.forEach((block, i) => {
    const lines = block.split('\n').filter((line, at) => at > 0 || line.trim());
    if (lines.length === 0) {
      return;
    }
    // The header block: `WEBVTT` plus optional header text.
    if (i === 0 && /^WEBVTT(\s|$)/.test(lines[0])) {
      return;
    }
    if (isMetadataBlock(lines[0])) {
      return;
    }
    const cue = parseBlock(lines);
    if (cue) {
      cues.push(cue);
    }
  });

  // Array.prototype.sort is stable, so cues with the same start keep file order.
  return cues.sort((a, b) => a.startMs - b.startMs);
};

/** For each sorted cue list: the largest `endMs` among cues `0..i`. */
const maxEndCache = new WeakMap<readonly SubtitleCue[], number[]>();

const maxEnds = (cues: readonly SubtitleCue[]): number[] => {
  let ends = maxEndCache.get(cues);
  if (!ends) {
    ends = [];
    let max = -Infinity;
    for (const cue of cues) {
      max = Math.max(max, cue.endMs);
      ends.push(max);
    }
    maxEndCache.set(cues, ends);
  }
  return ends;
};

/**
 * The cues showing at `positionMs` (`startMs <= position < endMs`), in start
 * order. `cues` must be sorted by start (as `parseVtt` returns them) and not
 * mutated afterwards. Binary search finds the last cue that has started, then
 * the running max of end times stops the walk back once no earlier cue can
 * still be showing.
 */
export const activeCues = (
  cues: readonly SubtitleCue[],
  positionMs: number,
): SubtitleCue[] => {
  // First index whose cue starts after the position.
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (cues[mid].startMs <= positionMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const ends = maxEnds(cues);
  const active: SubtitleCue[] = [];
  for (let i = lo - 1; i >= 0 && ends[i] > positionMs; i--) {
    if (cues[i].endMs > positionMs) {
      active.push(cues[i]);
    }
  }
  return active.reverse();
};

/** How many parsed subtitle files stay in memory. */
export const SUBTITLE_CACHE_SIZE = 8;

// Parsed cues by URL, oldest first, so switching back to a track doesn't
// refetch. Keys hold the token: never log them.
const cueCache = new Map<string, SubtitleCue[]>();

const cacheGet = (url: string): SubtitleCue[] | undefined => {
  const cues = cueCache.get(url);
  if (cues) {
    cueCache.delete(url);
    cueCache.set(url, cues);
  }
  return cues;
};

const cachePut = (url: string, cues: SubtitleCue[]) => {
  cueCache.delete(url);
  cueCache.set(url, cues);
  while (cueCache.size > SUBTITLE_CACHE_SIZE) {
    cueCache.delete(cueCache.keys().next().value as string);
  }
};

/** Empties the parsed-cue cache (tests, or a user switch). */
export const clearSubtitleCache = () => cueCache.clear();

export type SubtitleCuesState = {
  cues: readonly SubtitleCue[];
  loading: boolean;
  /** Set when the file couldn't be fetched; the message has no URL. */
  error?: Error;
};

const NO_CUES: readonly SubtitleCue[] = [];

type LoadState = SubtitleCuesState & {url?: string};

/** What to show for `url` before its effect has run. */
const initialState = (url?: string): LoadState => {
  if (!url) {
    return {url, cues: NO_CUES, loading: false};
  }
  const cached = cueCache.get(url);
  return cached
    ? {url, cues: cached, loading: false}
    : {url, cues: NO_CUES, loading: true};
};

/**
 * Fetches and parses the WebVTT file at `vttUrl`. No URL means no fetch and
 * no cues. A URL change or unmount aborts the pending request, and a late
 * answer for an old URL is ignored. A failed load sets `error`; it never
 * throws.
 */
export const useSubtitleCues = (vttUrl?: string): SubtitleCuesState => {
  const [state, setState] = useState<LoadState>(() => initialState(vttUrl));

  useEffect(() => {
    if (!vttUrl) {
      setState(initialState());
      return;
    }
    const cached = cacheGet(vttUrl);
    if (cached) {
      setState({url: vttUrl, cues: cached, loading: false});
      return;
    }
    setState({url: vttUrl, cues: NO_CUES, loading: true});

    const controller = new AbortController();
    const load = async () => {
      let response: Awaited<ReturnType<typeof fetch>>;
      try {
        response = await fetch(vttUrl, {signal: controller.signal});
      } catch {
        throw new Error('Subtitles could not be loaded (network error)');
      }
      if (!response.ok) {
        throw new Error(
          `Subtitles could not be loaded (HTTP ${response.status})`,
        );
      }
      return parseVtt(await response.text());
    };
    load().then(
      (cues) => {
        if (controller.signal.aborted) {
          return;
        }
        cachePut(vttUrl, cues);
        setState({url: vttUrl, cues, loading: false});
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          url: vttUrl,
          cues: NO_CUES,
          loading: false,
          error:
            error instanceof Error
              ? error
              : new Error('Subtitles could not be loaded'),
        });
      },
    );
    return () => controller.abort();
  }, [vttUrl]);

  // Until the effect catches up with a new URL, don't show the old cues.
  const current = state.url === vttUrl ? state : initialState(vttUrl);
  return {cues: current.cues, loading: current.loading, error: current.error};
};

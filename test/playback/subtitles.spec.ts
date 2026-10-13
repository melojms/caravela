import {act, renderHook, waitFor} from '@testing-library/react-native';

import {
  activeCues,
  clearSubtitleCache,
  parseVtt,
  SubtitleCue,
  useSubtitleCues,
} from '../../src/playback/subtitles';

const vtt = (...lines: string[]) => lines.join('\n');

/** Plain text of each cue, lines joined with `|`. */
const texts = (cues: SubtitleCue[]) =>
  cues.map((cue) =>
    cue.lines.map((line) => line.map((s) => s.text).join('')).join('|'),
  );

const cue = (startMs: number, endMs: number, text = `${startMs}`) =>
  ({startMs, endMs, lines: [[{text}]]} as SubtitleCue);

describe('parseVtt', () => {
  it('parses a basic file with the header', () => {
    expect(
      parseVtt(
        vtt(
          'WEBVTT',
          '',
          '00:00:01.000 --> 00:00:02.500',
          'Hello',
          '',
          '00:00:03.000 --> 00:00:04.000',
          'World',
          '',
        ),
      ),
    ).toEqual([
      {startMs: 1000, endMs: 2500, lines: [[{text: 'Hello'}]]},
      {startMs: 3000, endMs: 4000, lines: [[{text: 'World'}]]},
    ]);
  });

  it('skips header text after WEBVTT and in the header block', () => {
    const cues = parseVtt(
      vtt(
        'WEBVTT - Some title',
        'Kind: captions',
        'Language: en',
        '',
        '00:01.000 --> 00:02.000',
        'One',
      ),
    );
    expect(texts(cues)).toEqual(['One']);
  });

  it('skips NOTE, STYLE and REGION blocks', () => {
    const cues = parseVtt(
      vtt(
        'WEBVTT',
        '',
        'NOTE a comment',
        'over two lines',
        '',
        'NOTE',
        'alone',
        '',
        'STYLE',
        '::cue { color: yellow }',
        '',
        'REGION',
        'id:fred width:40%',
        '',
        '00:01.000 --> 00:02.000',
        'One',
      ),
    );
    expect(texts(cues)).toEqual(['One']);
  });

  it('reads both timestamp forms and long hours', () => {
    const cues = parseVtt(
      vtt(
        'WEBVTT',
        '',
        '01:02.003 --> 01:03.004',
        'Short',
        '',
        '01:00:00.000 --> 01:00:01.500',
        'Long',
        '',
        '100:00:00.000 --> 100:00:00.001',
        'Huge',
      ),
    );
    expect(cues.map((c) => [c.startMs, c.endMs])).toEqual([
      [62003, 63004],
      [3600000, 3601500],
      [360000000, 360000001],
    ]);
  });

  it('accepts a comma before the milliseconds', () => {
    expect(
      parseVtt(vtt('WEBVTT', '', '00:00:01,000 --> 00:00:02,000', 'SRT-ish')),
    ).toEqual([{startMs: 1000, endMs: 2000, lines: [[{text: 'SRT-ish'}]]}]);
  });

  it('ignores cue settings after the end time', () => {
    const cues = parseVtt(
      vtt(
        'WEBVTT',
        '',
        '00:01.000 --> 00:02.000 align:start position:10% line:0 size:50%',
        'Placed',
      ),
    );
    expect(cues).toEqual([
      {startMs: 1000, endMs: 2000, lines: [[{text: 'Placed'}]]},
    ]);
  });

  it('accepts cue identifiers', () => {
    const cues = parseVtt(
      vtt(
        'WEBVTT',
        '',
        '1',
        '00:01.000 --> 00:02.000',
        'Numbered',
        '',
        'intro-cue',
        '00:03.000 --> 00:04.000',
        'Named',
      ),
    );
    expect(texts(cues)).toEqual(['Numbered', 'Named']);
  });

  it('keeps multi-line cue text as separate lines', () => {
    const cues = parseVtt(
      vtt('WEBVTT', '', '00:01.000 --> 00:02.000', 'First line', 'Second line'),
    );
    expect(cues[0].lines).toEqual([
      [{text: 'First line'}],
      [{text: 'Second line'}],
    ]);
  });

  it('handles CRLF, lone CR and a BOM', () => {
    const crlf = '﻿WEBVTT\r\n\r\n00:01.000 --> 00:02.000\r\nA\r\nB\r\n';
    const cr = 'WEBVTT\r\r00:01.000 --> 00:02.000\rC\r';
    expect(texts(parseVtt(crlf))).toEqual(['A|B']);
    expect(texts(parseVtt(cr))).toEqual(['C']);
  });

  it('tolerates several blank lines and whitespace-only separators', () => {
    const cues = parseVtt(
      vtt(
        '',
        'WEBVTT',
        '',
        '',
        '',
        '00:01.000 --> 00:02.000',
        'One',
        '   ',
        '00:03.000 --> 00:04.000',
        'Two',
      ),
    );
    expect(texts(cues)).toEqual(['One', 'Two']);
  });

  it('parses a file with no WEBVTT header', () => {
    expect(texts(parseVtt(vtt('00:01.000 --> 00:02.000', 'Bare')))).toEqual([
      'Bare',
    ]);
  });

  it('turns <i>, <b> and <u> into span flags, nested too', () => {
    const [only] = parseVtt(
      vtt(
        'WEBVTT',
        '',
        '00:01.000 --> 00:02.000',
        'plain <i>italic <b>both</b></i> <u>under</u>',
      ),
    );
    expect(only.lines).toEqual([
      [
        {text: 'plain '},
        {text: 'italic ', italic: true},
        {text: 'both', italic: true, bold: true},
        {text: ' '},
        {text: 'under', underline: true},
      ],
    ]);
  });

  it('carries open tags across lines and accepts tag classes', () => {
    const [only] = parseVtt(
      vtt('WEBVTT', '', '00:01.000 --> 00:02.000', '<i.loud>one', 'two</i>'),
    );
    expect(only.lines).toEqual([
      [{text: 'one', italic: true}],
      [{text: 'two', italic: true}],
    ]);
  });

  it('ignores an unmatched closing tag and an unclosed opening tag', () => {
    const [only] = parseVtt(
      vtt('WEBVTT', '', '00:01.000 --> 00:02.000', 'a</b> <b>b'),
    );
    expect(only.lines).toEqual([[{text: 'a '}, {text: 'b', bold: true}]]);
  });

  it('strips other tags but keeps their text', () => {
    const [only] = parseVtt(
      vtt(
        'WEBVTT',
        '',
        '00:01.000 --> 00:05.000',
        '<v Roger Bingham>We are <c.yellow.bg_blue>in</c> <lang en-GB>space</lang></v>',
        '<ruby>漢<rt>kan</rt></ruby> <00:00:02.000>later <00:03.000>still',
      ),
    );
    expect(texts([only])).toEqual(['We are in space|漢kan later still']);
    expect(only.lines[0]).toEqual([{text: 'We are in space'}]);
  });

  it('keeps a stray < as text', () => {
    const [only] = parseVtt(
      vtt('WEBVTT', '', '00:01.000 --> 00:02.000', '1 < 2'),
    );
    expect(texts([only])).toEqual(['1 < 2']);
  });

  it('decodes named and numeric entities', () => {
    const [only] = parseVtt(
      vtt(
        'WEBVTT',
        '',
        '00:01.000 --> 00:02.000',
        'Tom &amp; Jerry &lt;i&gt; a&nbsp;b &lrm;x&rlm; &#65;&#x42; &bogus; &#0;',
      ),
    );
    expect(texts([only])).toEqual(['Tom & Jerry <i> a b ‎x‏ AB &bogus; &#0;']);
    // An escaped tag is text, not a tag.
    expect(only.lines[0]).toHaveLength(1);
  });

  it('skips malformed cues and keeps the rest', () => {
    const cues = parseVtt(
      vtt(
        'WEBVTT',
        '',
        '00:01.000 -> 00:02.000',
        'Bad arrow',
        '',
        '00:01 --> 00:02',
        'No millis',
        '',
        'too',
        'many',
        '00:01.000 --> 00:02.000',
        'Id lines',
        '',
        '00:05.000 --> 00:04.000',
        'Ends before it starts',
        '',
        '00:06.000 --> 00:07.000',
        '',
        'Just text, no timing',
        '',
        '00:08.000 --> 00:09.000',
        '<i></i>',
        '',
        '00:10.000 --> 00:11.000',
        'Good',
      ),
    );
    expect(texts(cues)).toEqual(['Good']);
  });

  it('sorts unsorted cues by start, keeping file order on ties', () => {
    const cues = parseVtt(
      vtt(
        'WEBVTT',
        '',
        '00:05.000 --> 00:06.000',
        'C',
        '',
        '00:01.000 --> 00:02.000',
        'A',
        '',
        '00:03.000 --> 00:04.000',
        'B1',
        '',
        '00:03.000 --> 00:03.500',
        'B2',
      ),
    );
    expect(texts(cues)).toEqual(['A', 'B1', 'B2', 'C']);
  });

  it('returns nothing for an empty or header-only file', () => {
    expect(parseVtt('')).toEqual([]);
    expect(parseVtt('WEBVTT\n')).toEqual([]);
  });
});

describe('activeCues', () => {
  const cues = [cue(1000, 2000), cue(3000, 4000), cue(5000, 6000)];

  it('includes the start and excludes the end', () => {
    expect(activeCues(cues, 1000)).toEqual([cues[0]]);
    expect(activeCues(cues, 1999)).toEqual([cues[0]]);
    expect(activeCues(cues, 2000)).toEqual([]);
  });

  it('returns nothing in gaps, before the first and after the last', () => {
    expect(activeCues(cues, 2500)).toEqual([]);
    expect(activeCues(cues, 0)).toEqual([]);
    expect(activeCues(cues, 999)).toEqual([]);
    expect(activeCues(cues, 6000)).toEqual([]);
    expect(activeCues(cues, 99999)).toEqual([]);
  });

  it('returns nothing for no cues', () => {
    expect(activeCues([], 1000)).toEqual([]);
  });

  it('returns overlapping cues in start order', () => {
    const overlap = [cue(1000, 3000), cue(2000, 4000), cue(2500, 2600)];
    expect(activeCues(overlap, 2550)).toEqual(overlap);
    expect(activeCues(overlap, 2600)).toEqual([overlap[0], overlap[1]]);
    expect(activeCues(overlap, 3000)).toEqual([overlap[1]]);
  });

  it('keeps a long cue showing over later short ones', () => {
    const long = [
      cue(0, 60000, 'sign'),
      cue(1000, 2000),
      cue(3000, 4000),
      cue(5000, 6000),
    ];
    expect(activeCues(long, 3500)).toEqual([long[0], long[2]]);
    expect(activeCues(long, 4500)).toEqual([long[0]]);
    expect(activeCues(long, 60000)).toEqual([]);
  });

  it('matches a full scan on a long, overlapping list', () => {
    const many: SubtitleCue[] = [];
    for (let i = 0; i < 500; i++) {
      many.push(cue(i * 1000, i * 1000 + ((i * 7919) % 5000) + 1));
    }
    for (let at = 0; at < 505000; at += 777) {
      expect(activeCues(many, at)).toEqual(
        many.filter((c) => c.startMs <= at && at < c.endMs),
      );
    }
  });
});

describe('useSubtitleCues', () => {
  const FILE_A = vtt('WEBVTT', '', '00:01.000 --> 00:02.000', 'From A');
  const FILE_B = vtt('WEBVTT', '', '00:01.000 --> 00:02.000', 'From B');
  const URL_A = 'https://jf.test/Videos/1/Subtitles/2/0/Stream.vtt?ApiKey=t';
  const URL_B = 'https://jf.test/Videos/1/Subtitles/3/0/Stream.vtt?ApiKey=t';

  type FakeResponse = {
    ok: boolean;
    status: number;
    text?: () => Promise<string>;
  };
  type Pending = {
    resolve: (r: FakeResponse) => void;
    reject: (e: unknown) => void;
    signal?: {aborted: boolean};
  };
  let pending: Record<string, Pending[]>;
  const fetchMock = jest.fn();
  const fetchGlobal = global as unknown as {fetch: unknown};
  const realFetch = fetchGlobal.fetch;

  const ok = (text: string): FakeResponse => ({
    ok: true,
    status: 200,
    text: () => Promise.resolve(text),
  });

  beforeEach(() => {
    clearSubtitleCache();
    pending = {};
    fetchMock.mockReset();
    fetchMock.mockImplementation(
      (url: string, init?: {signal?: {aborted: boolean}}) =>
        new Promise((resolve, reject) => {
          (pending[url] ??= []).push({
            resolve,
            reject,
            signal: init?.signal,
          });
        }),
    );
    fetchGlobal.fetch = fetchMock;
  });

  afterAll(() => {
    fetchGlobal.fetch = realFetch;
  });

  const answer = async (url: string, response: FakeResponse) => {
    await act(async () => {
      pending[url].shift()!.resolve(response);
    });
  };

  it('loads and parses the file', async () => {
    const {result} = renderHook(() => useSubtitleCues(URL_A));
    expect(result.current).toEqual({cues: [], loading: true, error: undefined});
    expect(fetchMock).toHaveBeenCalledWith(
      URL_A,
      expect.objectContaining({signal: expect.anything()}),
    );

    await answer(URL_A, ok(FILE_A));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();
    expect(texts([...result.current.cues])).toEqual(['From A']);
  });

  it('does not fetch without a URL', () => {
    const {result} = renderHook(() => useSubtitleCues(undefined));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      cues: [],
      loading: false,
      error: undefined,
    });
  });

  it('aborts on URL change and ignores the old late answer', async () => {
    const {result, rerender} = renderHook(
      ({url}: {url?: string}) => useSubtitleCues(url),
      {initialProps: {url: URL_A}},
    );
    const first = pending[URL_A][0];

    rerender({url: URL_B});
    expect(first.signal?.aborted).toBe(true);
    expect(result.current.loading).toBe(true);

    await answer(URL_B, ok(FILE_B));
    expect(texts([...result.current.cues])).toEqual(['From B']);

    await answer(URL_A, ok(FILE_A));
    expect(texts([...result.current.cues])).toEqual(['From B']);
    expect(result.current.loading).toBe(false);
  });

  it('clears the cues and aborts when the URL goes away', async () => {
    const {result, rerender} = renderHook(
      ({url}: {url?: string}) => useSubtitleCues(url),
      {initialProps: {url: URL_A} as {url?: string}},
    );
    await answer(URL_A, ok(FILE_A));
    rerender({url: URL_B});
    const second = pending[URL_B][0];
    rerender({url: undefined});
    expect(second.signal?.aborted).toBe(true);
    expect(result.current).toEqual({
      cues: [],
      loading: false,
      error: undefined,
    });
  });

  it('aborts on unmount', () => {
    const {unmount} = renderHook(() => useSubtitleCues(URL_A));
    unmount();
    expect(pending[URL_A][0].signal?.aborted).toBe(true);
  });

  it('reports an HTTP failure without the URL', async () => {
    const {result} = renderHook(() => useSubtitleCues(URL_A));
    await answer(URL_A, {
      ok: false,
      status: 404,
      text: () => Promise.resolve('nope'),
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.cues).toEqual([]);
    expect(result.current.error?.message).toContain('404');
    expect(result.current.error?.message).not.toContain('ApiKey');
  });

  it('reports a network failure without the URL', async () => {
    const {result} = renderHook(() => useSubtitleCues(URL_A));
    await act(async () => {
      pending[URL_A][0].reject(new TypeError(`Network failed: ${URL_A}`));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).not.toContain('ApiKey');
  });

  it('does not refetch when coming back to a loaded URL', async () => {
    const {result, rerender} = renderHook(
      ({url}: {url?: string}) => useSubtitleCues(url),
      {initialProps: {url: URL_A}},
    );
    await answer(URL_A, ok(FILE_A));
    rerender({url: URL_B});
    await answer(URL_B, ok(FILE_B));

    rerender({url: URL_A});
    // Shown on the very first render after the switch, not after an effect.
    expect(result.current.loading).toBe(false);
    expect(texts([...result.current.cues])).toEqual(['From A']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares the cache between hook instances', async () => {
    const first = renderHook(() => useSubtitleCues(URL_A));
    await answer(URL_A, ok(FILE_A));
    first.unmount();

    const second = renderHook(() => useSubtitleCues(URL_A));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(texts([...second.result.current.cues])).toEqual(['From A']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches after a failure instead of caching it', async () => {
    const first = renderHook(() => useSubtitleCues(URL_A));
    await answer(URL_A, {ok: false, status: 500});
    first.unmount();

    renderHook(() => useSubtitleCues(URL_A));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('drops the oldest file once the cache is full', async () => {
    const urls = Array.from({length: 9}, (_, i) => `${URL_A}&n=${i}`);
    const {rerender} = renderHook(
      ({url}: {url?: string}) => useSubtitleCues(url),
      {initialProps: {url: urls[0]}},
    );
    for (const [i, url] of urls.entries()) {
      if (i > 0) {
        rerender({url});
      }
      await answer(url, ok(FILE_A));
    }
    expect(fetchMock).toHaveBeenCalledTimes(9);

    rerender({url: urls[8]});
    rerender({url: urls[1]});
    expect(fetchMock).toHaveBeenCalledTimes(9);
    rerender({url: urls[0]});
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});

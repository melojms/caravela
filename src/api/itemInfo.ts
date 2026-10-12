import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {BaseItemKind} from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import {ImageType} from '@jellyfin/sdk/lib/generated-client/models/image-type';
import type {MediaSourceInfo} from '@jellyfin/sdk/lib/generated-client/models/media-source-info';
import type {MediaStream} from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import {MediaStreamType} from '@jellyfin/sdk/lib/generated-client/models/media-stream-type';
import {PersonKind} from '@jellyfin/sdk/lib/generated-client/models/person-kind';
import {SeriesStatus} from '@jellyfin/sdk/lib/generated-client/models/series-status';
import {VideoRangeType} from '@jellyfin/sdk/lib/generated-client/models/video-range-type';

import {formatClock} from '../components/ToolbarClock';
import type {
  CardItem,
  DetailsInfoItem,
  InfoRowEntry,
} from '../components/types';
import type {PlayerTitle} from '../playback/types';
import {
  cardImageSize,
  episodeFullName,
  imageUrl,
  placeholderColor,
} from './items';

/** Jellyfin ticks are 100 ns: 10 000 per millisecond. */
export const TICKS_PER_MS = 10000;

export const ticksToMs = (ticks: number): number =>
  Math.floor(ticks / TICKS_PER_MS);

export const msToTicks = (ms: number): number => ms * TICKS_PER_MS;

const MS_PER_HOUR = 3600000;
const MS_PER_MINUTE = 60000;
const TICKS_PER_MINUTE = 600000000;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** en-US medium date in local time, e.g. `Mar 14, 2025`. */
const mediumDate = (date: Date) =>
  `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

const parseDate = (value?: string | null): Date | undefined => {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** Whole years from `from` to `to`, in local time. */
const yearsBetween = (from: Date, to: Date) => {
  const years = to.getFullYear() - from.getFullYear();
  const beforeBirthday =
    to.getMonth() < from.getMonth() ||
    (to.getMonth() === from.getMonth() && to.getDate() < from.getDate());
  return beforeBirthday ? years - 1 : years;
};

/**
 * androidtv's `InfoRowDate`: a series shows its production year; a person
 * `Born Mar 14, 1970 (54)`, with the age at death when there's an end date;
 * anything else the premiere date, else the production year.
 */
const infoRowDate = (item: BaseItemDto, now: Date): string | undefined => {
  const year =
    item.ProductionYear != null ? `${item.ProductionYear}` : undefined;
  switch (item.Type) {
    case BaseItemKind.Series:
      return year;
    case BaseItemKind.Person: {
      const born = parseDate(item.PremiereDate);
      if (!born) {
        return undefined;
      }
      const age = yearsBetween(born, parseDate(item.EndDate) ?? now);
      return `Born ${mediumDate(born)} (${age})`;
    }
    default: {
      const premiere = parseDate(item.PremiereDate);
      return premiere ? mediumDate(premiere) : year;
    }
  }
};

/** androidtv's `getSeasonEpisodeName`, e.g. `S1:E2`, `S1:E2–3` or `Special`. */
const seasonEpisodeName = (item: BaseItemDto): string => {
  const season = item.ParentIndexNumber;
  const parts: string[] = [];
  if (season != null && season !== 0) {
    parts.push(`S${season}`);
  }
  if (season === 0) {
    parts.push('Special');
  } else if (item.IndexNumber != null) {
    parts.push(
      item.IndexNumberEnd != null
        ? `E${item.IndexNumber}–${item.IndexNumberEnd}`
        : `E${item.IndexNumber}`,
    );
  }
  return parts.join(':');
};

const SERIES_STATUS_TEXT: Record<SeriesStatus, string> = {
  [SeriesStatus.Continuing]: 'Continuing',
  [SeriesStatus.Ended]: 'Ended',
  [SeriesStatus.Unreleased]: 'Not yet released',
};

/** androidtv's `InfoRowSeriesStatus`; nothing for an unknown status. */
const seriesStatusText = (status?: string | null): string | undefined =>
  status ? SERIES_STATUS_TEXT[status as SeriesStatus] : undefined;

/** androidtv's `getResolutionName`. */
export function resolutionName(
  width: number,
  height: number,
  interlaced = false,
): string {
  const suffix = interlaced ? 'i' : 'p';
  if (width >= 7600 || height >= 4300) {
    return '8K';
  }
  if (width >= 3800 || height >= 2000) {
    return '4K';
  }
  if (width >= 2500 || height >= 1400) {
    return `1440${suffix}`;
  }
  if (width >= 1800 || height >= 1000) {
    return `1080${suffix}`;
  }
  if (width >= 1200 || height >= 700) {
    return `720${suffix}`;
  }
  if (width >= 600 || height >= 400) {
    return `480${suffix}`;
  }
  return 'SD';
}

const DOLBY_VISION = 'Dolby Vision';
const DOLBY_VISION_EL = 'Dolby Vision with EL';

const VIDEO_RANGE_NAMES: Partial<Record<VideoRangeType, string[]>> = {
  [VideoRangeType.Sdr]: ['SDR'],
  [VideoRangeType.Hdr10]: ['HDR10'],
  [VideoRangeType.Hdr10Plus]: ['HDR10+'],
  [VideoRangeType.Hlg]: ['HLG'],
  [VideoRangeType.Dovi]: [DOLBY_VISION],
  [VideoRangeType.DoviWithHdr10]: [DOLBY_VISION, 'HDR10'],
  [VideoRangeType.DoviWithHlg]: [DOLBY_VISION, 'HLG'],
  [VideoRangeType.DoviWithSdr]: [DOLBY_VISION, 'SDR'],
  [VideoRangeType.DoviWithEl]: [DOLBY_VISION_EL],
  [VideoRangeType.DoviWithHdr10Plus]: [DOLBY_VISION, 'HDR10+'],
  [VideoRangeType.DoviWithElhdr10Plus]: [DOLBY_VISION_EL, 'HDR10+'],
  [VideoRangeType.DoviInvalid]: [DOLBY_VISION],
};

/** androidtv's video range names; none for an unknown range. */
export const videoRangeNames = (range?: VideoRangeType): string[] =>
  (range && VIDEO_RANGE_NAMES[range]) || [];

const CODEC_NAMES: Record<string, string> = {
  DCA: 'DTS',
  AC3: 'DD',
  EAC3: 'DD+',
  TRUEHD: 'TrueHD',
};

/** androidtv's audio codec name: Atmos and DTS profiles first, then the codec. */
export function audioCodecName(stream: MediaStream): string | undefined {
  const profile = stream.Profile?.toLowerCase() ?? '';
  const codec = stream.Codec?.toUpperCase();
  if (profile.includes('dolby atmos')) {
    if (codec === 'EAC3') {
      return 'DD+ Atmos';
    }
    return codec === 'TRUEHD' ? 'TrueHD Atmos' : 'Dolby Atmos';
  }
  if (profile.includes('dts:x')) {
    return 'DTS:X';
  }
  if (profile.includes('dts:hd') || profile.includes('dts-hd')) {
    return 'DTS-HD';
  }
  return codec ? CODEC_NAMES[codec] ?? codec : undefined;
}

/**
 * androidtv's `getDefault`: the stream at `defaultIndex` (a list position)
 * when it has the right type, else the first stream of that type.
 */
const defaultStream = (
  streams: MediaStream[],
  type: MediaStreamType,
  defaultIndex?: number | null,
) => {
  if (defaultIndex != null && streams[defaultIndex]?.Type === type) {
    return streams[defaultIndex];
  }
  return streams.find((stream) => stream.Type === type);
};

const nonBlank = (text?: string | null) =>
  text && text.trim() ? text : undefined;

/** androidtv's `InfoRowMediaDetails`: subtitles, resolution, video range, audio codec and channels. */
export function mediaBadges(source: MediaSourceInfo): string[] {
  const streams = source.MediaStreams ?? [];
  const video = defaultStream(streams, MediaStreamType.Video);
  const audio = defaultStream(
    streams,
    MediaStreamType.Audio,
    source.DefaultAudioStreamIndex,
  );
  const subtitles = streams.filter(
    (stream) => stream.Type === MediaStreamType.Subtitle,
  );

  const badges: string[] = [];
  if (subtitles.some((stream) => stream.IsHearingImpaired === true)) {
    badges.push('SDH');
  }
  if (subtitles.some((stream) => stream.IsHearingImpaired !== true)) {
    badges.push('CC');
  }
  if (video?.Width != null && video.Height != null) {
    badges.push(
      resolutionName(video.Width, video.Height, video.IsInterlaced === true),
    );
  }
  badges.push(...videoRangeNames(video?.VideoRangeType));
  const codec = audio && nonBlank(audioCodecName(audio));
  if (codec) {
    badges.push(codec);
  }
  const layout = nonBlank(audio?.ChannelLayout);
  if (layout) {
    badges.push(layout.toUpperCase());
  }
  return badges;
}

/**
 * androidtv's `BaseItemInfoRow` on the details page (no runtime): community
 * rating and critic rating, then per type
 * - episode: `S1:E2`, date, age rating, badges;
 * - series: production year, status (Continuing / Ended / Not yet released),
 *   age rating, badges;
 * - person: `Born <date> (age)`, plus `Died <date>` and the birthplace (which
 *   androidtv doesn't show);
 * - anything else (movie, season): date, age rating, then the default media
 *   source's badges.
 */
export function infoRowEntries(
  item: BaseItemDto,
  now: Date = new Date(),
): InfoRowEntry[] {
  const entries: InfoRowEntry[] = [];
  const addText = (value?: string) => {
    if (value) {
      entries.push({kind: 'text', text: value});
    }
  };
  if (item.CommunityRating != null) {
    entries.push({kind: 'communityRating', value: item.CommunityRating});
  }
  if (item.CriticRating != null) {
    entries.push({kind: 'criticRating', value: item.CriticRating});
  }
  if (item.Type === BaseItemKind.Episode) {
    addText(seasonEpisodeName(item));
  }
  addText(infoRowDate(item, now));
  if (item.Type === BaseItemKind.Series) {
    addText(seriesStatusText(item.Status));
  }
  if (item.Type === BaseItemKind.Person) {
    const died = parseDate(item.EndDate);
    addText(died && `Died ${mediumDate(died)}`);
    addText(nonBlank(item.ProductionLocations?.[0]));
  }
  if (item.OfficialRating) {
    entries.push({kind: 'text', text: item.OfficialRating});
  }
  const source = item.MediaSources?.[0];
  if (source) {
    entries.push(
      ...mediaBadges(source).map(
        (text): InfoRowEntry => ({kind: 'badge', text}),
      ),
    );
  }
  return entries;
}

/** androidtv's `canResume`: a saved position past the start. */
const resumeTicks = (item: BaseItemDto): number | undefined => {
  const ticks = item.UserData?.PlaybackPositionTicks ?? 0;
  return ticks > 0 ? ticks : undefined;
};

/** androidtv's `getRunTime`: whole minutes rounded up, `1h 42m` or `42m`. */
export function formatRunTime(ticks: number): string {
  const totalMinutes = Math.ceil(ticks / TICKS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** When playback would end: now plus the runtime, or what's left of it when resumable. */
export function endTime(item: BaseItemDto, now: Date = new Date()): Date {
  const remaining = (item.RunTimeTicks ?? 0) - (resumeTicks(item) ?? 0);
  return new Date(now.getTime() + ticksToMs(remaining));
}

export type DetailsInfoOptions = {now?: Date; use24Hour: boolean};

/**
 * androidtv's info items under the overview: Directed by (Seasons and their
 * count for a series), Runs and Ends. None for a person.
 */
export function detailsInfoItems(
  item: BaseItemDto,
  {now = new Date(), use24Hour}: DetailsInfoOptions,
): DetailsInfoItem[] {
  if (item.Type === BaseItemKind.Person) {
    return [];
  }
  const director = item.People?.find(
    (person) => person.Type === PersonKind.Director,
  );
  const items: DetailsInfoItem[] = [
    item.Type === BaseItemKind.Series
      ? {label: 'Seasons', value: `${item.ChildCount ?? 0}`}
      : {label: 'Directed by', value: director?.Name || 'Unknown'},
  ];
  const runTime = item.RunTimeTicks;
  if (runTime != null && runTime > 0) {
    items.push(
      {label: 'Runs', value: formatRunTime(runTime)},
      {label: 'Ends', value: formatClock(endTime(item, now), use24Hour)},
    );
  }
  return items;
}

/** Where Resume starts, in ms, minus the pre-roll; undefined when there's nothing to resume. */
export function resumePositionMs(
  item: BaseItemDto,
  prerollMs = 0,
): number | undefined {
  const ticks = resumeTicks(item);
  return ticks === undefined
    ? undefined
    : Math.max(0, ticksToMs(ticks) - prerollMs);
}

const pad2 = (value: number) => `${value}`.padStart(2, '0');

/** androidtv's `TimeUtils.formatMillis`: `1:02:10` or `2:10`. */
export function formatMillis(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const hours = Math.floor(total / MS_PER_HOUR);
  const minutes = Math.floor((total % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((total % MS_PER_MINUTE) / 1000);
  return hours > 0
    ? `${hours}:${pad2(minutes)}:${pad2(seconds)}`
    : `${minutes}:${pad2(seconds)}`;
}

/** The Resume button label, e.g. `Resume from 1:02:10`. */
export const resumeLabel = (ms: number): string =>
  `Resume from ${formatMillis(ms)}`;

/**
 * Cast & crew cards, in the server's order: the name, then the role (or the
 * kind, e.g. Director, when there's no role) and the person's primary image.
 * With `kinds`, only those people (an episode's guest stars).
 */
export function peopleToCards(
  item: BaseItemDto,
  api: Api,
  kinds?: readonly PersonKind[],
): CardItem[] {
  const people = (item.People ?? []).filter(
    (person) => !kinds || (person.Type != null && kinds.includes(person.Type)),
  );
  return people.map((person) => {
    const id = person.Id ?? '';
    return {
      id,
      title: person.Name ?? '',
      subtitle: nonBlank(person.Role) ?? person.Type,
      imageUri:
        id && person.PrimaryImageTag
          ? imageUrl(
              api,
              {
                itemId: id,
                type: ImageType.Primary,
                tag: person.PrimaryImageTag,
              },
              cardImageSize('poster'),
            )
          : undefined,
      placeholderColor: placeholderColor(id),
    };
  });
}

/**
 * The details header's title and subtitle: an episode's name over
 * `Lost S1 E2`, a season's name over its series' name, else just the name.
 */
export function detailsTitles(item: BaseItemDto): {
  title: string;
  subtitle?: string;
} {
  const title = item.Name ?? '';
  switch (item.Type) {
    case BaseItemKind.Episode:
      return {title, subtitle: episodeFullName(item) || undefined};
    case BaseItemKind.Season:
      return {title, subtitle: nonBlank(item.SeriesName)};
    default:
      return {title};
  }
}

/**
 * The player overlay's heading, as androidtv's `updateDisplay`: an episode
 * shows its series name over `S1:E2 · Episode name` (androidtv's
 * `getDisplayName`, which joins with ` — `); anything else just its name.
 * Without a series name the episode's name becomes the title, over `S1:E2`.
 */
export function playerTitle(item: BaseItemDto): PlayerTitle {
  const name = item.Name ?? '';
  if (item.Type !== BaseItemKind.Episode) {
    return {title: name};
  }
  const seasonEpisode = seasonEpisodeName(item);
  const series = nonBlank(item.SeriesName);
  if (!series) {
    return {title: name, subtitle: seasonEpisode || undefined};
  }
  const subtitle = [seasonEpisode, nonBlank(name)]
    .filter((part) => !!part)
    .join(' · ');
  return {title: series, subtitle: subtitle || undefined};
}

/**
 * What a season's Play/Resume plays: its first unwatched episode, else (all
 * watched) the first one. `resumePositionMs(target)` then picks Resume or Play.
 */
export const seasonPlayTarget = (
  episodes: readonly BaseItemDto[],
): BaseItemDto | undefined =>
  episodes.find((episode) => episode.UserData?.Played !== true) ?? episodes[0];

/**
 * androidtv's `handleResumeButtonAndFocus` for a series: Resume shows when
 * the series is started and not finished, where started means partly played
 * or a next-up episode with a saved position.
 */
export function seriesShowsResume(
  series: BaseItemDto,
  nextUp?: BaseItemDto | null,
): boolean {
  const finished = series.UserData?.Played === true;
  const started =
    (series.UserData?.PlayedPercentage ?? 0) > 0 ||
    (nextUp?.UserData?.PlaybackPositionTicks ?? 0) > 0;
  return (started && !finished) || resumeTicks(series) !== undefined;
}

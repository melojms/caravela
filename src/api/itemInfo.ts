import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {ImageType} from '@jellyfin/sdk/lib/generated-client/models/image-type';
import type {MediaSourceInfo} from '@jellyfin/sdk/lib/generated-client/models/media-source-info';
import type {MediaStream} from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import {MediaStreamType} from '@jellyfin/sdk/lib/generated-client/models/media-stream-type';
import {PersonKind} from '@jellyfin/sdk/lib/generated-client/models/person-kind';
import {VideoRangeType} from '@jellyfin/sdk/lib/generated-client/models/video-range-type';

import {formatClock} from '../components/ToolbarClock';
import type {
  CardItem,
  DetailsInfoItem,
  InfoRowEntry,
} from '../components/types';
import {cardImageSize, imageUrl, placeholderColor} from './items';

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

/** androidtv's `InfoRowDate` for a movie: the premiere date, else the production year. */
const infoRowDate = (item: BaseItemDto): string | undefined => {
  if (item.PremiereDate) {
    const date = new Date(item.PremiereDate);
    if (!Number.isNaN(date.getTime())) {
      return mediumDate(date);
    }
  }
  return item.ProductionYear != null ? `${item.ProductionYear}` : undefined;
};

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
 * androidtv's `BaseItemInfoRow` for a movie on the details page (no runtime):
 * community rating, critic rating, date, age rating, then the default media
 * source's badges.
 */
export function infoRowEntries(item: BaseItemDto): InfoRowEntry[] {
  const entries: InfoRowEntry[] = [];
  if (item.CommunityRating != null) {
    entries.push({kind: 'communityRating', value: item.CommunityRating});
  }
  if (item.CriticRating != null) {
    entries.push({kind: 'criticRating', value: item.CriticRating});
  }
  const date = infoRowDate(item);
  if (date) {
    entries.push({kind: 'text', text: date});
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

/** androidtv's info items under the overview: Directed by, Runs and Ends. */
export function detailsInfoItems(
  item: BaseItemDto,
  {now = new Date(), use24Hour}: DetailsInfoOptions,
): DetailsInfoItem[] {
  const director = item.People?.find(
    (person) => person.Type === PersonKind.Director,
  );
  const items: DetailsInfoItem[] = [
    {label: 'Directed by', value: director?.Name || 'Unknown'},
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
 */
export function peopleToCards(item: BaseItemDto, api: Api): CardItem[] {
  return (item.People ?? []).map((person) => {
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

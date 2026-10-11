import {MediaSource} from '@amazon-devices/react-native-w3cmedia';
import {CodecType} from '@jellyfin/sdk/lib/generated-client/models/codec-type';
import type {CodecProfile} from '@jellyfin/sdk/lib/generated-client/models/codec-profile';
import type {DeviceProfile} from '@jellyfin/sdk/lib/generated-client/models/device-profile';
import type {DirectPlayProfile} from '@jellyfin/sdk/lib/generated-client/models/direct-play-profile';
import {DlnaProfileType} from '@jellyfin/sdk/lib/generated-client/models/dlna-profile-type';
import {EncodingContext} from '@jellyfin/sdk/lib/generated-client/models/encoding-context';
import {MediaStreamProtocol} from '@jellyfin/sdk/lib/generated-client/models/media-stream-protocol';
import type {ProfileCondition} from '@jellyfin/sdk/lib/generated-client/models/profile-condition';
import {ProfileConditionType} from '@jellyfin/sdk/lib/generated-client/models/profile-condition-type';
import {ProfileConditionValue} from '@jellyfin/sdk/lib/generated-client/models/profile-condition-value';
import {SubtitleDeliveryMethod} from '@jellyfin/sdk/lib/generated-client/models/subtitle-delivery-method';
import type {SubtitleProfile} from '@jellyfin/sdk/lib/generated-client/models/subtitle-profile';
import type {TranscodingProfile} from '@jellyfin/sdk/lib/generated-client/models/transcoding-profile';
import {VideoRangeType} from '@jellyfin/sdk/lib/generated-client/models/video-range-type';

/** Same as androidtv's default "Max streaming bitrate" (100 Mbit/s). */
export const DEFAULT_MAX_BITRATE = 100_000_000;

export type IsTypeSupported = (type: string) => boolean;

/**
 * Every MIME string we ask Vega about, in one place so the TV and the
 * simulator can be compared. Vega's `isTypeSupported` matches audio codec ids
 * exactly (case-insensitive) and passes video codec strings, profile and level
 * included, to the platform decoder query.
 *
 * Vega can't express HDR10 or HLG here: the MIME parser takes no transfer
 * function or `eotf` parameter. Dolby Vision has its own codec id (`dvh1`).
 */
export const PROBES = {
  // Video, 8-bit
  h264: 'video/mp4; codecs="avc1.640028"', // High, level 4.0
  h264High10: 'video/mp4; codecs="avc1.6E0028"', // High 10, level 4.0
  hevc: 'video/mp4; codecs="hvc1.1.6.L120.B0"', // Main, level 4.0
  hevcMain10: 'video/mp4; codecs="hvc1.2.4.L120.B0"', // Main 10, level 4.0
  hevcDolbyVision: 'video/mp4; codecs="dvh1.05.06"', // Profile 5, 4K24
  vp9: 'video/webm; codecs="vp09.00.40.08"', // Profile 0, level 4.0
  av1: 'video/mp4; codecs="av01.0.08M.08"', // Main, level 4.0, 8-bit
  av1Main10: 'video/mp4; codecs="av01.0.08M.10"', // Main, level 4.0, 10-bit
  av1DolbyVision: 'video/mp4; codecs="dav1.10.06"', // Profile 10, 4K24
  // Audio
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  mp3: 'audio/mp4; codecs="mp3"',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"',
  opus: 'audio/mp4; codecs="Opus"',
  flac: 'audio/mp4; codecs="fLaC"',
  dts: 'audio/mp4; codecs="dtsc"',
  truehd: 'audio/mp4; codecs="mlpa"',
} as const;

export type ProbeName = keyof typeof PROBES;
export type ProbeResults = Record<ProbeName, boolean>;

/**
 * Level probes, highest first; the first supported one is the max level.
 * The values are ffprobe's (AVC × 10, HEVC × 30), as in androidtv.
 */
const AVC_LEVELS: [codec: string, level: number][] = [
  ['avc1.640034', 52],
  ['avc1.640033', 51],
  ['avc1.640032', 50],
  ['avc1.64002A', 42],
  ['avc1.640029', 41],
  ['avc1.640028', 40],
];
const AVC_HIGH10_LEVELS: [string, number][] = AVC_LEVELS.map(
  ([codec, level]) => [codec.replace('avc1.64', 'avc1.6E'), level],
);
const HEVC_LEVELS: [string, number][] = [
  ['hvc1.1.6.L186.B0', 186],
  ['hvc1.1.6.L183.B0', 183],
  ['hvc1.1.6.L180.B0', 180],
  ['hvc1.1.6.L156.B0', 156],
  ['hvc1.1.6.L153.B0', 153],
  ['hvc1.1.6.L150.B0', 150],
  ['hvc1.1.6.L123.B0', 123],
  ['hvc1.1.6.L120.B0', 120],
];
const HEVC_MAIN10_LEVELS: [string, number][] = HEVC_LEVELS.map(
  ([codec, level]) => [codec.replace('hvc1.1.6', 'hvc1.2.4'), level],
);

/** What the device can decode, from the probes. */
export type DeviceCapabilities = ProbeResults & {
  /** ffprobe levels; 0 when the codec (or profile) isn't supported. */
  avcLevel: number;
  avcHigh10Level: number;
  hevcLevel: number;
  hevcMain10Level: number;
};

const probeLevel = (
  isTypeSupported: IsTypeSupported,
  supported: boolean,
  levels: [string, number][],
): number => {
  if (!supported) {
    return 0;
  }
  const found = levels.find(([codec]) =>
    isTypeSupported(`video/mp4; codecs="${codec}"`),
  );
  // The base probe passed at level 4.0, so never report less than that.
  return found ? found[1] : levels[levels.length - 1][1];
};

const safeProbe = (isTypeSupported: IsTypeSupported, type: string) => {
  try {
    return isTypeSupported(type) === true;
  } catch {
    return false;
  }
};

/** Runs every probe once. */
export function probeCapabilities(
  isTypeSupported: IsTypeSupported,
): DeviceCapabilities {
  const probe: IsTypeSupported = (type) => safeProbe(isTypeSupported, type);
  const results = Object.fromEntries(
    Object.entries(PROBES).map(([name, type]) => [name, probe(type)]),
  ) as ProbeResults;
  return {
    ...results,
    avcLevel: probeLevel(probe, results.h264, AVC_LEVELS),
    avcHigh10Level: probeLevel(probe, results.h264High10, AVC_HIGH10_LEVELS),
    hevcLevel: probeLevel(probe, results.hevc, HEVC_LEVELS),
    hevcMain10Level: probeLevel(probe, results.hevcMain10, HEVC_MAIN10_LEVELS),
  };
}

// Jellyfin's codec names for each probe.
const AUDIO_CODECS: [ProbeName, string[]][] = [
  ['aac', ['aac']],
  ['mp3', ['mp3']],
  ['ac3', ['ac3']],
  ['eac3', ['eac3']],
  ['opus', ['opus']],
  ['flac', ['flac']],
  ['dts', ['dts', 'dca']],
  ['truehd', ['truehd', 'mlp']],
];

/**
 * Direct play containers and the codecs Vega's demuxer takes in each (from
 * the w3cmedia container registry). androidtv uses one profile for every
 * container because ExoPlayer demuxes them all; Vega's demuxers differ.
 * TS leaves out AC-3: Vega's TS demuxer drops AC-3 audio silently.
 * No mkv: in URL mode the Fire TV can't seek in it (`Seek failed. Internal
 * error 0`, code 50004), so the server remuxes it to HLS instead.
 */
const DIRECT_PLAY_CONTAINERS: {
  container: string;
  video: string[];
  audio: string[];
}[] = [
  {
    container: 'mp4,m4v,mov',
    video: ['h264', 'hevc', 'vp9', 'av1'],
    audio: [
      'aac',
      'mp3',
      'ac3',
      'eac3',
      'opus',
      'flac',
      'dts',
      'dca',
      'truehd',
      'mlp',
    ],
  },
  {
    container: 'webm',
    video: ['vp9', 'av1'],
    audio: ['opus'],
  },
  {
    container: 'ts',
    video: ['h264', 'hevc'],
    audio: ['aac', 'mp3', 'eac3', 'opus', 'dts', 'dca'],
  },
];

// Same lists as androidtv, filtered by what the device decodes.
const HLS_TS_AUDIO = ['aac', 'ac3', 'eac3', 'mp3'];
const HLS_FMP4_AUDIO = [
  'aac',
  'ac3',
  'eac3',
  'mp3',
  'alac',
  'flac',
  'opus',
  'dts',
];

const condition = (
  Condition: ProfileConditionType,
  Property: ProfileConditionValue,
  Value: string | number,
): ProfileCondition => ({
  Condition,
  Property,
  Value: String(Value),
  IsRequired: false,
});

const videoCodecProfile = (
  Codec: string,
  Conditions: ProfileCondition[],
  ApplyConditions?: ProfileCondition[],
): CodecProfile => ({
  Type: CodecType.Video,
  Codec,
  Conditions,
  ...(ApplyConditions ? {ApplyConditions} : {}),
});

const {Equals, NotEquals, LessThanEqual, GreaterThanEqual, EqualsAny} =
  ProfileConditionType;

function codecProfiles(caps: DeviceCapabilities): CodecProfile[] {
  const profiles: CodecProfile[] = [];
  const avcProfiles = ['high', 'main', 'baseline', 'constrained baseline'];

  // H.264 profiles and levels
  profiles.push(
    videoCodecProfile('h264', [
      caps.h264
        ? condition(
            EqualsAny,
            ProfileConditionValue.VideoProfile,
            [...avcProfiles, ...(caps.h264High10 ? ['high 10'] : [])].join('|'),
          )
        : condition(Equals, ProfileConditionValue.VideoProfile, 'none'),
    ]),
  );
  if (caps.h264) {
    profiles.push(
      videoCodecProfile(
        'h264',
        [
          condition(
            LessThanEqual,
            ProfileConditionValue.VideoLevel,
            caps.avcLevel,
          ),
        ],
        [
          condition(
            EqualsAny,
            ProfileConditionValue.VideoProfile,
            avcProfiles.join('|'),
          ),
        ],
      ),
    );
  }
  if (caps.h264High10) {
    profiles.push(
      videoCodecProfile(
        'h264',
        [
          condition(
            LessThanEqual,
            ProfileConditionValue.VideoLevel,
            caps.avcHigh10Level,
          ),
        ],
        [condition(Equals, ProfileConditionValue.VideoProfile, 'high 10')],
      ),
    );
  }
  // H.264 reference frames
  profiles.push(
    videoCodecProfile(
      'h264',
      [condition(LessThanEqual, ProfileConditionValue.RefFrames, 12)],
      [condition(GreaterThanEqual, ProfileConditionValue.Width, 1200)],
    ),
    videoCodecProfile(
      'h264',
      [condition(LessThanEqual, ProfileConditionValue.RefFrames, 4)],
      [condition(GreaterThanEqual, ProfileConditionValue.Width, 1900)],
    ),
  );

  // HEVC profiles and levels; Main 10 only when probed
  profiles.push(
    videoCodecProfile('hevc', [
      caps.hevc
        ? condition(
            EqualsAny,
            ProfileConditionValue.VideoProfile,
            ['main', ...(caps.hevcMain10 ? ['main 10'] : [])].join('|'),
          )
        : condition(Equals, ProfileConditionValue.VideoProfile, 'none'),
    ]),
  );
  if (caps.hevc) {
    profiles.push(
      videoCodecProfile(
        'hevc',
        [
          condition(
            LessThanEqual,
            ProfileConditionValue.VideoLevel,
            caps.hevcLevel,
          ),
        ],
        [condition(Equals, ProfileConditionValue.VideoProfile, 'main')],
      ),
    );
  }
  if (caps.hevcMain10) {
    profiles.push(
      videoCodecProfile(
        'hevc',
        [
          condition(
            LessThanEqual,
            ProfileConditionValue.VideoLevel,
            caps.hevcMain10Level,
          ),
        ],
        [condition(Equals, ProfileConditionValue.VideoProfile, 'main 10')],
      ),
    );
  }

  // AV1
  profiles.push(
    videoCodecProfile('av1', [
      !caps.av1
        ? condition(Equals, ProfileConditionValue.VideoProfile, 'none')
        : !caps.av1Main10
        ? condition(NotEquals, ProfileConditionValue.VideoProfile, 'main 10')
        : condition(NotEquals, ProfileConditionValue.VideoProfile, 'none'),
    ]),
  );

  // HDR exclude lists. Like androidtv, the NotEquals condition always fails,
  // so ApplyConditions limits it to the unsupported range types and the
  // server builds a tone-mapping transcode for those.
  const av1Unsupported = unsupportedRangeTypesAv1(caps);
  const hevcUnsupported = unsupportedRangeTypesHevc(caps);
  if (av1Unsupported.length > 0) {
    profiles.push(rangeTypeProfile('av1', av1Unsupported));
  }
  if (hevcUnsupported.length > 0) {
    profiles.push(rangeTypeProfile('hevc', hevcUnsupported));
  }

  // Audio channels (no downmix setting yet)
  profiles.push({
    Type: CodecType.VideoAudio,
    Conditions: [
      condition(LessThanEqual, ProfileConditionValue.AudioChannels, 8),
    ],
  });
  // 7.1 AAC: the Fire TV's AAC parser rejects it ("Not a known sample
  // rate"), and the start hangs with no error event. `isTypeSupported`
  // ignores channel counts, so this can't be probed. The server copies AAC
  // only up to 5.1 and caps an AAC transcode at 6 channels (the lower of
  // this and the limit above).
  profiles.push({
    Type: CodecType.VideoAudio,
    Codec: 'aac',
    Conditions: [
      condition(LessThanEqual, ProfileConditionValue.AudioChannels, 6),
    ],
  });

  return profiles;
}

const rangeTypeProfile = (codec: string, types: VideoRangeType[]) =>
  videoCodecProfile(
    codec,
    [
      condition(
        NotEquals,
        ProfileConditionValue.VideoRangeType,
        types.join('|'),
      ),
    ],
    [
      condition(
        EqualsAny,
        ProfileConditionValue.VideoRangeType,
        types.join('|'),
      ),
    ],
  );

// HDR10 and HDR10+ can't be probed on Vega, so they count as unsupported and
// the server tone-maps them to SDR. HLG is left to the decoder, as in androidtv.
const HDR10_SUPPORTED = false;
const HDR10_PLUS_SUPPORTED = false;

function unsupportedRangeTypesAv1(caps: DeviceCapabilities): VideoRangeType[] {
  const types = new Set<VideoRangeType>([VideoRangeType.DoviInvalid]);
  if (!caps.av1DolbyVision) {
    types.add(VideoRangeType.Dovi);
    if (!HDR10_SUPPORTED) types.add(VideoRangeType.DoviWithHdr10);
    if (!HDR10_PLUS_SUPPORTED) types.add(VideoRangeType.DoviWithHdr10Plus);
  }
  if (!HDR10_PLUS_SUPPORTED) {
    types.add(VideoRangeType.Hdr10Plus);
    if (!HDR10_SUPPORTED) types.add(VideoRangeType.Hdr10);
  }
  return [...types];
}

function unsupportedRangeTypesHevc(caps: DeviceCapabilities): VideoRangeType[] {
  const types = new Set<VideoRangeType>([VideoRangeType.DoviInvalid]);
  // Enhancement-layer Dolby Vision (profile 7) needs a dual-layer decoder,
  // which the probes can't show.
  types.add(VideoRangeType.DoviWithEl);
  if (!HDR10_PLUS_SUPPORTED) types.add(VideoRangeType.DoviWithElhdr10Plus);
  if (!caps.hevcDolbyVision) {
    types.add(VideoRangeType.Dovi);
    if (!HDR10_SUPPORTED) types.add(VideoRangeType.DoviWithHdr10);
    if (!HDR10_PLUS_SUPPORTED) types.add(VideoRangeType.DoviWithHdr10Plus);
  }
  if (!HDR10_PLUS_SUPPORTED) {
    types.add(VideoRangeType.Hdr10Plus);
    if (!HDR10_SUPPORTED) types.add(VideoRangeType.Hdr10);
  }
  return [...types];
}

const subtitle = (
  formats: string[],
  Method: SubtitleDeliveryMethod,
): SubtitleProfile[] => formats.map((Format) => ({Format, Method}));

function subtitleProfiles(): SubtitleProfile[] {
  return [
    // Text formats: the app fetches them as WebVTT and draws them.
    ...subtitle(
      ['vtt', 'webvtt', 'srt', 'subrip', 'ttml'],
      SubtitleDeliveryMethod.External,
    ),
    // Vega has no libass or bitmap subtitle renderer: the server burns them in.
    ...subtitle(
      ['ass', 'ssa', 'pgs', 'pgssub', 'dvdsub', 'dvbsub', 'idx'],
      SubtitleDeliveryMethod.Encode,
    ),
  ];
}

/** Builds the device profile from probe results. */
export function createDeviceProfile(
  caps: DeviceCapabilities,
  maxBitrate: number = DEFAULT_MAX_BITRATE,
): DeviceProfile {
  const audioCodecs = AUDIO_CODECS.filter(([probe]) => caps[probe]).flatMap(
    ([, names]) => names,
  );
  const videoCodecs = [
    ...(caps.h264 ? ['h264'] : []),
    ...(caps.hevc ? ['hevc'] : []),
    ...(caps.vp9 ? ['vp9'] : []),
    ...(caps.av1 ? ['av1'] : []),
  ];

  const directPlayProfiles: DirectPlayProfile[] = DIRECT_PLAY_CONTAINERS.map(
    ({container, video, audio}) => ({
      Type: DlnaProfileType.Video,
      Container: container,
      VideoCodec: video
        .filter((codec) => videoCodecs.includes(codec))
        .join(','),
      AudioCodec: audio
        .filter((codec) => audioCodecs.includes(codec))
        .join(','),
    }),
  ).filter((profile) => profile.VideoCodec !== '');
  directPlayProfiles.push({
    Type: DlnaProfileType.Audio,
    AudioCodec: audioCodecs.join(','),
  });

  const hlsVideoCodecs = [...(caps.hevc ? ['hevc'] : []), 'h264'].join(',');
  const hlsVideo = (
    container: string,
    audio: string[],
  ): TranscodingProfile => ({
    Type: DlnaProfileType.Video,
    Context: EncodingContext.Streaming,
    Protocol: MediaStreamProtocol.Hls,
    Container: container,
    VideoCodec: hlsVideoCodecs,
    AudioCodec: audio.filter((codec) => audioCodecs.includes(codec)).join(','),
    CopyTimestamps: false,
    // The app fetches text subtitles as WebVTT and draws them itself, so Shaka
    // must not load them from the manifest.
    EnableSubtitlesInManifest: false,
  });

  return {
    Name: 'Caravela',
    MaxStaticBitrate: maxBitrate,
    MaxStreamingBitrate: maxBitrate,
    DirectPlayProfiles: directPlayProfiles,
    TranscodingProfiles: [
      hlsVideo('ts', HLS_TS_AUDIO),
      hlsVideo('mp4', HLS_FMP4_AUDIO),
      {
        Type: DlnaProfileType.Audio,
        Context: EncodingContext.Streaming,
        Protocol: MediaStreamProtocol.Hls,
        Container: 'ts',
        AudioCodec: 'aac',
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: codecProfiles(caps),
    SubtitleProfiles: subtitleProfiles(),
  };
}

export type DeviceProfileOptions = {
  /** Defaults to Vega's `MediaSource.isTypeSupported`. */
  isTypeSupported?: IsTypeSupported;
  /** In bits per second; defaults to {@link DEFAULT_MAX_BITRATE}. */
  maxStreamingBitrate?: number;
};

let defaultCapabilities: DeviceCapabilities | undefined;
let defaultProfile: DeviceProfile | undefined;

/** The device's capabilities, probed once per app run. */
export function getDeviceCapabilities(): DeviceCapabilities {
  if (!defaultCapabilities) {
    defaultCapabilities = probeCapabilities((type) =>
      MediaSource.isTypeSupported(type),
    );
  }
  return defaultCapabilities;
}

/**
 * The profile sent with every PlaybackInfo request. Without an injected
 * `isTypeSupported` the probes run once per app run, and without options the
 * same profile object comes back each time.
 */
export function buildDeviceProfile(
  options: DeviceProfileOptions = {},
): DeviceProfile {
  const {isTypeSupported, maxStreamingBitrate} = options;
  if (isTypeSupported) {
    return createDeviceProfile(
      probeCapabilities(isTypeSupported),
      maxStreamingBitrate,
    );
  }
  if (maxStreamingBitrate !== undefined) {
    return createDeviceProfile(getDeviceCapabilities(), maxStreamingBitrate);
  }
  if (!defaultProfile) {
    defaultProfile = createDeviceProfile(getDeviceCapabilities());
  }
  return defaultProfile;
}

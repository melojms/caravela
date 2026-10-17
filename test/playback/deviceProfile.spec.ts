import type {MediaSource} from '@amazon-devices/react-native-w3cmedia';
import type {CodecProfile} from '@jellyfin/sdk/lib/generated-client/models/codec-profile';
import type {DeviceProfile} from '@jellyfin/sdk/lib/generated-client/models/device-profile';

import {
  buildDeviceProfile,
  DEFAULT_MAX_BITRATE,
  PROBES,
  probeCapabilities,
  supportsDolby,
} from '../../src/playback/deviceProfile';
import type {ProbeName} from '../../src/playback/deviceProfile';

const ALL = Object.keys(PROBES) as ProbeName[];

/** An isTypeSupported that accepts the named probes (and their level ladders). */
const supporting = (...names: ProbeName[]) => {
  const accepted = new Set(names.map((name) => PROBES[name]));
  return jest.fn((type: string) => {
    if (accepted.has(type as (typeof PROBES)[ProbeName])) {
      return true;
    }
    // Level probes: accept every level of a supported codec family.
    if (/avc1\.64/.test(type)) return names.includes('h264');
    if (/avc1\.6E/.test(type)) return names.includes('h264High10');
    if (/hvc1\.1\.6/.test(type)) return names.includes('hevc');
    if (/hvc1\.2\.4/.test(type)) return names.includes('hevcMain10');
    return false;
  });
};

const profileFor = (...names: ProbeName[]) =>
  buildDeviceProfile({isTypeSupported: supporting(...names)});

const directPlay = (profile: DeviceProfile, container: string) =>
  profile.DirectPlayProfiles?.find((p) => p.Container === container);

const codecProfiles = (profile: DeviceProfile, codec: string) =>
  (profile.CodecProfiles ?? []).filter((p) => p.Codec === codec);

const conditionOf = (p: CodecProfile) => p.Conditions?.[0];

describe('probeCapabilities', () => {
  it('runs every probe in the table and reports each result', () => {
    const isTypeSupported = supporting('h264', 'aac');
    const caps = probeCapabilities(isTypeSupported);
    for (const name of ALL) {
      expect(isTypeSupported).toHaveBeenCalledWith(PROBES[name]);
      expect(caps[name]).toBe(name === 'h264' || name === 'aac');
    }
  });

  it('finds the highest supported level', () => {
    const caps = probeCapabilities(
      jest.fn(
        (type: string) =>
          type === PROBES.h264 ||
          type === PROBES.hevc ||
          type.includes('avc1.640029') ||
          type.includes('hvc1.1.6.L153'),
      ),
    );
    expect(caps.avcLevel).toBe(41);
    expect(caps.hevcLevel).toBe(153);
    expect(caps.avcHigh10Level).toBe(0);
    expect(caps.hevcMain10Level).toBe(0);
  });

  it('treats a throwing probe as unsupported', () => {
    const caps = probeCapabilities(
      jest.fn((type: string) => {
        if (type === PROBES.av1) throw new Error('boom');
        return type === PROBES.h264;
      }),
    );
    expect(caps.av1).toBe(false);
    expect(caps.h264).toBe(true);
  });
});

describe('buildDeviceProfile', () => {
  it('is named Caravela', () => {
    expect(profileFor().Name).toBe('Caravela');
  });

  it('lists only supported codecs in direct play', () => {
    const profile = profileFor('h264', 'aac', 'eac3');
    expect(directPlay(profile, 'mp4,m4v,mov')).toEqual({
      Type: 'Video',
      Container: 'mp4,m4v,mov',
      VideoCodec: 'h264',
      AudioCodec: 'aac,eac3',
    });
    // No VP9 or AV1, so nothing in WebM can be direct played.
    expect(directPlay(profile, 'webm')).toBeUndefined();
  });

  it('adds every supported codec, with Jellyfin aliases', () => {
    const profile = buildDeviceProfile({isTypeSupported: () => true});
    expect(directPlay(profile, 'mp4,m4v,mov')).toMatchObject({
      VideoCodec: 'h264,hevc,vp9,av1',
      AudioCodec: 'aac,mp3,ac3,eac3,opus,flac,dts,dca,truehd,mlp',
    });
    expect(directPlay(profile, 'webm')).toMatchObject({
      VideoCodec: 'vp9,av1',
      AudioCodec: 'opus',
    });
    // Vega's TS demuxer drops AC-3.
    expect(directPlay(profile, 'ts')).toMatchObject({
      VideoCodec: 'h264,hevc',
      AudioCodec: 'aac,mp3,eac3,opus,dts,dca',
    });
    expect(
      profile.DirectPlayProfiles?.find((p) => p.Type === 'Audio')?.AudioCodec,
    ).toBe('aac,mp3,ac3,eac3,opus,flac,dts,dca,truehd,mlp');
  });

  it('leaves mkv out of direct play so the server remuxes it to HLS', () => {
    const profile = buildDeviceProfile({isTypeSupported: () => true});
    expect(
      profile.DirectPlayProfiles?.filter((p) => p.Type === 'Video').map(
        (p) => p.Container,
      ),
    ).toEqual(['mp4,m4v,mov', 'webm', 'ts']);
    expect(
      profile.DirectPlayProfiles?.some((p) => p.Container?.includes('mkv')),
    ).toBe(false);
  });

  it('allows HEVC Main 10 only when probed', () => {
    const main = codecProfiles(profileFor('hevc'), 'hevc');
    expect(conditionOf(main[0])).toMatchObject({
      Condition: 'EqualsAny',
      Property: 'VideoProfile',
      Value: 'main',
    });
    expect(main.some((p) => p.ApplyConditions?.[0]?.Value === 'main 10')).toBe(
      false,
    );

    const main10 = codecProfiles(profileFor('hevc', 'hevcMain10'), 'hevc');
    expect(conditionOf(main10[0])?.Value).toBe('main|main 10');
    expect(
      main10.find((p) => p.ApplyConditions?.[0]?.Value === 'main 10'),
    ).toMatchObject({
      Conditions: [
        expect.objectContaining({Property: 'VideoLevel', Value: '186'}),
      ],
    });
  });

  it('rejects every HEVC and H.264 profile when the codec is missing', () => {
    const profile = profileFor('aac');
    for (const codec of ['h264', 'hevc', 'av1']) {
      expect(conditionOf(codecProfiles(profile, codec)[0])).toMatchObject({
        Condition: 'Equals',
        Property: 'VideoProfile',
        Value: 'none',
      });
    }
    expect(directPlay(profile, 'mp4,m4v,mov')).toBeUndefined();
  });

  it('sets the H.264 profiles, level and reference frame limits', () => {
    const h264 = codecProfiles(profileFor('h264', 'h264High10'), 'h264');
    expect(conditionOf(h264[0])?.Value).toBe(
      'high|main|baseline|constrained baseline|high 10',
    );
    expect(h264.map(conditionOf)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({Property: 'VideoLevel', Value: '52'}),
        expect.objectContaining({Property: 'RefFrames', Value: '12'}),
        expect.objectContaining({Property: 'RefFrames', Value: '4'}),
      ]),
    );
  });

  it('limits AV1 to 8-bit unless Main 10 is probed', () => {
    expect(
      conditionOf(codecProfiles(profileFor('av1'), 'av1')[0]),
    ).toMatchObject({Condition: 'NotEquals', Value: 'main 10'});
    expect(
      conditionOf(codecProfiles(profileFor('av1', 'av1Main10'), 'av1')[0]),
    ).toMatchObject({Condition: 'NotEquals', Value: 'none'});
  });

  describe('HDR', () => {
    const rangeTypes = (profile: DeviceProfile, codec: string) =>
      codecProfiles(profile, codec)
        .find((p) => p.ApplyConditions?.[0]?.Property === 'VideoRangeType')
        ?.ApplyConditions?.[0]?.Value?.split('|');

    it('tone-maps HDR10 and Dolby Vision when only SDR is known', () => {
      const types = rangeTypes(profileFor('hevc', 'hevcMain10'), 'hevc');
      expect(types).toEqual(
        expect.arrayContaining(['HDR10', 'HDR10Plus', 'DOVI', 'DOVIWithEL']),
      );
      expect(types).not.toContain('HLG');
      expect(types).not.toContain('SDR');
    });

    it('lets Dolby Vision through when dvh1 is supported', () => {
      const types = rangeTypes(
        profileFor('hevc', 'hevcMain10', 'hevcDolbyVision'),
        'hevc',
      );
      expect(types).not.toContain('DOVI');
      expect(types).toContain('DOVIWithEL');
      expect(types).toContain('HDR10');
    });

    it('handles AV1 Dolby Vision separately', () => {
      expect(rangeTypes(profileFor('av1'), 'av1')).toContain('DOVI');
      expect(
        rangeTypes(profileFor('av1', 'av1DolbyVision'), 'av1'),
      ).not.toContain('DOVI');
    });

    it('pairs the always-failing NotEquals with ApplyConditions', () => {
      const profile = codecProfiles(profileFor('hevc'), 'hevc').find(
        (p) => p.ApplyConditions?.[0]?.Property === 'VideoRangeType',
      );
      expect(conditionOf(profile!)).toMatchObject({
        Condition: 'NotEquals',
        Property: 'VideoRangeType',
        Value: profile!.ApplyConditions![0].Value,
      });
    });
  });

  describe('audio channels', () => {
    const audioProfiles = (profile: DeviceProfile) =>
      (profile.CodecProfiles ?? []).filter((p) => p.Type === 'VideoAudio');
    const atMost = (Value: string) => [
      {
        Condition: 'LessThanEqual',
        Property: 'AudioChannels',
        Value,
        IsRequired: false,
      },
    ];

    it('caps every codec at 8 and AAC at 6 (the TV fails on 7.1 AAC)', () => {
      expect(audioProfiles(profileFor('aac', 'eac3', 'ac3'))).toEqual([
        {Type: 'VideoAudio', Conditions: atMost('8')},
        {Type: 'VideoAudio', Codec: 'aac', Conditions: atMost('6')},
      ]);
    });

    it('limits only AAC: no other codec has its own channel profile', () => {
      const profile = buildDeviceProfile({isTypeSupported: () => true});
      const codecs = audioProfiles(profile).map((p) => p.Codec);
      expect(codecs).toEqual([undefined, 'aac']);
    });

    it('caps AAC even when the probes found no AAC decoder', () => {
      expect(audioProfiles(profileFor())).toHaveLength(2);
    });

    it("leaves the transcoding profiles' channels to the codec profiles", () => {
      const profile = buildDeviceProfile({isTypeSupported: () => true});
      for (const p of profile.TranscodingProfiles ?? []) {
        expect(p.MaxAudioChannels).toBeUndefined();
      }
    });
  });

  describe('transcoding profiles', () => {
    it('keeps subtitles out of the HLS manifest (the app draws them)', () => {
      const profile = buildDeviceProfile({isTypeSupported: () => true});
      const hls = (profile.TranscodingProfiles ?? []).filter(
        (p) => p.Type === 'Video' && p.Protocol === 'hls',
      );
      expect(hls).toHaveLength(2);
      for (const p of hls) {
        expect(p.EnableSubtitlesInManifest).toBe(false);
      }
    });

    it('offers HLS in TS and fMP4, with HEVC when supported', () => {
      const profile = buildDeviceProfile({isTypeSupported: () => true});
      const [ts, fmp4, audio] = profile.TranscodingProfiles ?? [];
      const common = {
        Type: 'Video',
        Context: 'Streaming',
        Protocol: 'hls',
        VideoCodec: 'hevc,h264',
        CopyTimestamps: false,
        EnableSubtitlesInManifest: false,
      };
      expect(ts).toEqual({
        ...common,
        Container: 'ts',
        AudioCodec: 'aac,ac3,eac3,mp3',
      });
      expect(fmp4).toEqual({
        ...common,
        Container: 'mp4',
        AudioCodec: 'aac,ac3,eac3,mp3,flac,opus,dts',
      });
      expect(audio).toEqual({
        Type: 'Audio',
        Context: 'Streaming',
        Protocol: 'hls',
        Container: 'ts',
        AudioCodec: 'aac',
      });
    });

    it('uses only H.264 and the supported audio otherwise', () => {
      const [ts, fmp4] = profileFor('h264', 'aac', 'ac3').TranscodingProfiles!;
      expect(ts).toMatchObject({VideoCodec: 'h264', AudioCodec: 'aac,ac3'});
      expect(fmp4).toMatchObject({VideoCodec: 'h264', AudioCodec: 'aac,ac3'});
    });
  });

  it('sets the subtitle delivery method for every format', () => {
    const methods = Object.fromEntries(
      profileFor().SubtitleProfiles!.map((p) => [p.Format, p.Method]),
    );
    expect(methods).toEqual({
      vtt: 'External',
      webvtt: 'External',
      srt: 'External',
      subrip: 'External',
      ttml: 'External',
      ass: 'Encode',
      ssa: 'Encode',
      pgs: 'Encode',
      pgssub: 'Encode',
      dvdsub: 'Encode',
      dvbsub: 'Encode',
      idx: 'Encode',
    });
  });

  it('uses the bitrate option for static and streaming limits', () => {
    expect(profileFor()).toMatchObject({
      MaxStaticBitrate: DEFAULT_MAX_BITRATE,
      MaxStreamingBitrate: DEFAULT_MAX_BITRATE,
    });
    expect(
      buildDeviceProfile({
        isTypeSupported: () => false,
        maxStreamingBitrate: 8e6,
      }),
    ).toMatchObject({MaxStaticBitrate: 8e6, MaxStreamingBitrate: 8e6});
  });

  describe('default profile', () => {
    // A fresh module registry per test, so the cached video probes start empty.
    let mod: typeof import('../../src/playback/deviceProfile');
    let isTypeSupported: jest.MockedFunction<
      typeof MediaSource.isTypeSupported
    >;

    const AUDIO: ProbeName[] = [
      'aac',
      'mp3',
      'ac3',
      'eac3',
      'opus',
      'flac',
      'dts',
      'truehd',
    ];
    const VIDEO = ALL.filter((name) => !AUDIO.includes(name));
    const callsFor = (type: string) =>
      isTypeSupported.mock.calls.filter(([t]) => t === type).length;

    beforeEach(() => {
      jest.isolateModules(() => {
        mod = require('../../src/playback/deviceProfile');
        isTypeSupported = require('@amazon-devices/react-native-w3cmedia')
          .MediaSource.isTypeSupported;
      });
      isTypeSupported.mockReset();
      isTypeSupported.mockImplementation((type) => type === PROBES.h264);
    });

    it('probes with Vega MediaSource', () => {
      const profile = mod.buildDeviceProfile();
      expect(isTypeSupported).toHaveBeenCalled();
      expect(directPlay(profile, 'mp4,m4v,mov')?.VideoCodec).toBe('h264');
      expect(mod.buildDeviceProfile({maxStreamingBitrate: 1e6})).toMatchObject({
        MaxStreamingBitrate: 1e6,
      });
    });

    it('probes video once per app run and audio on every call', () => {
      mod.buildDeviceProfile();
      const firstVideo = new Map(
        VIDEO.map((name) => [name, callsFor(PROBES[name])]),
      );
      const firstLevel = callsFor('video/mp4; codecs="avc1.640034"');
      mod.buildDeviceProfile();
      mod.buildDeviceProfile({maxStreamingBitrate: 1e6});
      mod.getDeviceCapabilities();
      for (const name of VIDEO) {
        expect(firstVideo.get(name)).toBeGreaterThan(0);
        expect(callsFor(PROBES[name])).toBe(firstVideo.get(name));
      }
      // The level ladders run with their codec's probe, so once per run too.
      expect(firstLevel).toBe(1);
      expect(callsFor('video/mp4; codecs="avc1.640034"')).toBe(1);
      for (const name of AUDIO) {
        expect(callsFor(PROBES[name])).toBe(4);
      }
    });

    it('follows the current audio output from one play to the next', () => {
      let eac3 = true;
      isTypeSupported.mockImplementation(
        (type) =>
          type === PROBES.h264 ||
          type === PROBES.aac ||
          (eac3 && type === PROBES.eac3),
      );
      const hls = (profile: DeviceProfile, container: string) =>
        profile.TranscodingProfiles?.find(
          (p) => p.Type === 'Video' && p.Container === container,
        )?.AudioCodec;

      const hdmi = mod.buildDeviceProfile();
      expect(directPlay(hdmi, 'mp4,m4v,mov')?.AudioCodec).toBe('aac,eac3');
      expect(hls(hdmi, 'ts')).toBe('aac,eac3');
      expect(hls(hdmi, 'mp4')).toBe('aac,eac3');

      eac3 = false; // e.g. switched to a Bluetooth headset
      const bluetooth = mod.buildDeviceProfile();
      expect(directPlay(bluetooth, 'mp4,m4v,mov')?.AudioCodec).toBe('aac');
      expect(hls(bluetooth, 'ts')).toBe('aac');
      expect(hls(bluetooth, 'mp4')).toBe('aac');
      expect(mod.getDeviceCapabilities().eac3).toBe(false);

      eac3 = true;
      expect(hls(mod.buildDeviceProfile(), 'ts')).toBe('aac,eac3');
    });

    it('re-probes when isTypeSupported is injected', () => {
      mod.buildDeviceProfile();
      const injected = jest.fn(() => true);
      mod.buildDeviceProfile({isTypeSupported: injected});
      expect(injected).toHaveBeenCalled();
    });
  });
});

describe('supportsDolby', () => {
  it.each([
    [['ac3'], true],
    [['eac3'], true],
    [['ac3', 'eac3'], true],
    [['aac', 'h264'], false],
  ] as [ProbeName[], boolean][])('with %j supported is %s', (names, dolby) => {
    expect(supportsDolby(supporting(...names))).toBe(dolby);
  });

  it('only probes AC-3 and E-AC-3', () => {
    const isTypeSupported = supporting();
    supportsDolby(isTypeSupported);
    expect(isTypeSupported.mock.calls.map(([type]) => type).sort()).toEqual(
      [PROBES.ac3, PROBES.eac3].sort(),
    );
  });

  it('is false when the probe throws', () => {
    expect(
      supportsDolby(() => {
        throw new Error('boom');
      }),
    ).toBe(false);
  });

  describe('by default', () => {
    let isTypeSupported: jest.MockedFunction<
      typeof MediaSource.isTypeSupported
    >;
    let dolby: typeof supportsDolby;

    beforeEach(() => {
      jest.isolateModules(() => {
        dolby = require('../../src/playback/deviceProfile').supportsDolby;
        isTypeSupported = require('@amazon-devices/react-native-w3cmedia')
          .MediaSource.isTypeSupported;
      });
      isTypeSupported.mockReset();
    });

    it('asks Vega MediaSource afresh on every call', () => {
      isTypeSupported.mockImplementation((type) => type === PROBES.eac3);
      expect(dolby()).toBe(true);
      isTypeSupported.mockImplementation(() => false);
      expect(dolby()).toBe(false);
      isTypeSupported.mockImplementation((type) => type === PROBES.ac3);
      expect(dolby()).toBe(true);
    });
  });
});

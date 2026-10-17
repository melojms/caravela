/* eslint-env jest */
// Stand-in for @amazon-devices/keplerscript-audio-lib, which loads native
// turbo modules when imported. jest.config.json maps the package here.

export const AudioStatus = {
  STATUS_NO_ERROR: 0,
  STATUS_BAD_VALUE: -2,
  STATUS_ALREADY_EXISTS: -4,
  STATUS_DEAD_OBJECT: -5,
  STATUS_INVALID_OPERATION: -8,
} as const;

export const AudioRole = {
  ROLE_SOURCE: 0,
  ROLE_SINK: 1,
  ROLE_SOURCE_SINK: 2,
} as const;

export const AudioEvent = {
  DEVICE_STATE_UPDATE: 0,
  VOLUME_UPDATE: 1,
  GLOBAL_VOLUME_MUTE_UPDATE: 2,
  SERVER_DOWN: 3,
  SERVER_UP: 4,
} as const;

/** The callback the app registered last, until it unregisters. */
let observer: ((event: unknown) => void) | undefined;

/**
 * The event observer calls the app makes. Registering keeps the callback for
 * {@link emitAudioEvent}; tests change the answers with `mockResolvedValueOnce`
 * / `mockRejectedValueOnce`.
 */
export const AudioManager = {
  registerAudioEventObserverAsync: jest.fn(
    async (callback: (event: unknown) => void): Promise<number> => {
      observer = callback;
      return AudioStatus.STATUS_NO_ERROR;
    },
  ),
  unregisterAudioEventObserverAsync: jest.fn(
    async (): Promise<number> => {
      observer = undefined;
      return AudioStatus.STATUS_NO_ERROR;
    },
  ),
};

/** Sends an event to the registered observer, as the audio server would. */
export const emitAudioEvent = (event: unknown) => observer?.(event);

/** A Bluetooth headset (A2DP) connecting or going away, as the TV sent it. */
export const headsetEvent = (connect: boolean) => ({
  audioEvent: AudioEvent.DEVICE_STATE_UPDATE,
  device: 8,
  role: AudioRole.ROLE_SINK,
  connect,
});

/** Forgets the observer and restores the default answers. */
export const resetAudioManager = () => {
  observer = undefined;
  AudioManager.registerAudioEventObserverAsync.mockClear();
  AudioManager.unregisterAudioEventObserverAsync.mockClear();
};

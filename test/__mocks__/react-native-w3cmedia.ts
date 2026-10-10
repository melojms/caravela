/* eslint-env jest */
// Stand-in for @amazon-devices/react-native-w3cmedia, which needs native
// turbo modules. jest.config.json maps the package here. Add the player
// pieces (VideoPlayer, KeplerVideoSurfaceView, …) next to MediaSource.

/** Supports nothing unless a test says otherwise. */
export const MediaSource = {
  isTypeSupported: jest.fn((_type: string): boolean => false),
};

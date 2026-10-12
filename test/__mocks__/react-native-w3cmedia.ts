/* eslint-env jest */
// Stand-in for @amazon-devices/react-native-w3cmedia, which needs native
// turbo modules. jest.config.json maps the package here.
import React from 'react';
import {View, type ViewProps} from 'react-native';

/** Supports nothing unless a test says otherwise. */
export const MediaSource = {
  isTypeSupported: jest.fn((_type: string): boolean => false),
};

type Listener = (event?: {type: string; target: unknown}) => void;

/**
 * A fake `VideoPlayer`: an event target with spies for the calls the app
 * makes. Tests read `VideoPlayer.instances`, set `currentTime` / `duration` /
 * `paused` / `error` directly and call `fire(type)` to send media events.
 * `play()` / `pause()` / setting `currentTime` only record the call; the
 * test fires the events that would follow. Setting `src` resets
 * `playbackRate` to `defaultPlaybackRate`, as Vega's `load()` does.
 */
export class VideoPlayer {
  static instances: VideoPlayer[] = [];
  /**
   * What every instance's `initialize()` returns. The app calls it right
   * after `new`, so tests hold it open or fail it here:
   * `VideoPlayer.initializeResult.mockReturnValueOnce(promise)`.
   */
  static initializeResult = jest.fn(() => Promise.resolve());

  src = '';
  autoplay = false;
  currentTime = 0;
  duration = NaN;
  paused = true;
  ended = false;
  defaultPlaybackRate = 1;
  playbackRate = 1;
  error: {code: number; message: string} | null = null;

  private listeners = new Map<string, Set<Listener>>();
  /** Every value assigned to `src` / `currentTime`, in order. */
  srcSets: string[] = [];
  seeks: number[] = [];

  initialize = jest.fn(() => VideoPlayer.initializeResult());
  deinitialize = jest.fn(() => Promise.resolve());
  deinitializeSync = jest.fn(() => 'success');
  setSurfaceHandle = jest.fn((_handle: string): void => undefined);
  clearSurfaceHandle = jest.fn((_handle: string): void => undefined);
  play = jest.fn(() => Promise.resolve());
  pause = jest.fn((): void => undefined);
  load = jest.fn((): void => undefined);

  addEventListener = jest.fn((type: string, listener: Listener) => {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  });
  removeEventListener = jest.fn((type: string, listener: Listener) => {
    this.listeners.get(type)?.delete(listener);
  });

  constructor() {
    VideoPlayer.instances.push(this);
    // Record assignments while keeping plain property reads.
    let src = '';
    let currentTime = 0;
    Object.defineProperty(this, 'src', {
      get: () => src,
      set: (value: string) => {
        src = value;
        this.srcSets.push(value);
        this.playbackRate = this.defaultPlaybackRate;
      },
    });
    Object.defineProperty(this, 'currentTime', {
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
        this.seeks.push(value);
      },
    });
  }

  /** Sets `currentTime` without recording it as a seek. */
  setPosition(seconds: number) {
    const seeks = this.seeks.length;
    this.currentTime = seconds;
    this.seeks.length = seeks;
  }

  /** Dispatches a media event to the listeners added for it. */
  fire(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({type, target: this});
    }
  }

  listenerCount(type?: string): number {
    if (type) {
      return this.listeners.get(type)?.size ?? 0;
    }
    let count = 0;
    this.listeners.forEach((set) => (count += set.size));
    return count;
  }
}

type SurfaceViewProps = ViewProps & {
  onSurfaceViewCreated?: (handle: string) => void;
  onSurfaceViewDestroyed?: (handle: string) => void;
  scalingmode?: string;
};

/**
 * A fake surface view. Tests call `KeplerVideoSurfaceView.create(handle)` to
 * send `onSurfaceViewCreated` to the mounted view; unmounting sends
 * `onSurfaceViewDestroyed` with the last created handle, like the native view.
 */
export class KeplerVideoSurfaceView extends React.Component<SurfaceViewProps> {
  static mounted: KeplerVideoSurfaceView[] = [];

  static create(handle: string) {
    const view = KeplerVideoSurfaceView.mounted.at(-1);
    if (!view) {
      throw new Error('No KeplerVideoSurfaceView is mounted.');
    }
    view.handle = handle;
    view.props.onSurfaceViewCreated?.(handle);
  }

  static destroy() {
    const view = KeplerVideoSurfaceView.mounted.at(-1);
    if (view?.handle) {
      const handle = view.handle;
      view.handle = undefined;
      view.props.onSurfaceViewDestroyed?.(handle);
    }
  }

  private handle?: string;

  componentDidMount() {
    KeplerVideoSurfaceView.mounted.push(this);
  }

  componentWillUnmount() {
    if (this.handle) {
      this.props.onSurfaceViewDestroyed?.(this.handle);
    }
    KeplerVideoSurfaceView.mounted = KeplerVideoSurfaceView.mounted.filter(
      (view) => view !== this,
    );
  }

  render() {
    // Keeps the callbacks as props, so tests can also read them off the View.
    return React.createElement(View, this.props as ViewProps);
  }
}

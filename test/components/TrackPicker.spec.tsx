import 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {act, fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';
import {BackHandler} from 'react-native';

import {
  TRACK_OFF_INDEX,
  TrackPicker,
  type TrackPickerProps,
} from '../../src/components/TrackPicker';
import type {MediaTrack} from '../../src/playback/types';
import {colors, focus} from '../../src/theme';

// The Vega Jest preset's StyleSheet.flatten mock returns arrays untouched,
// so toHaveStyle can't read them. Flatten by hand.
const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const TRACKS: MediaTrack[] = [
  {index: 1, label: 'English - AAC - Stereo', language: 'eng', isDefault: true},
  {index: 2, label: 'Portuguese - AC3 - 5.1', language: 'por'},
  {index: 5, label: 'Commentary'},
];

const addListener = BackHandler.addEventListener as jest.Mock;

const renderPicker = (props: Partial<TrackPickerProps> = {}) => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const screen = render(
    <TrackPicker
      title="Audio"
      tracks={TRACKS}
      onSelect={onSelect}
      onClose={onClose}
      {...props}
    />,
  );
  return {screen, onSelect, onClose};
};

const rowIds = (screen: ReturnType<typeof render>) =>
  screen.getAllByRole('radio').map((row) => row.props.testID as string);

describe('TrackPicker', () => {
  beforeEach(() => addListener.mockClear());

  it('shows the title and one row per track, in order', () => {
    const {screen} = renderPicker();

    expect(screen.getByText('Audio')).toBeTruthy();
    expect(rowIds(screen)).toEqual([
      'track-picker-row-1',
      'track-picker-row-2',
      'track-picker-row-5',
    ]);
    expect(screen.getByText('English - AAC - Stereo')).toBeTruthy();
    expect(screen.getByText('Portuguese - AC3 - 5.1')).toBeTruthy();
    expect(screen.getByText('Commentary')).toBeTruthy();
  });

  it('has no Off row without offLabel', () => {
    const {screen} = renderPicker();
    expect(screen.queryByTestId('track-picker-row--1')).toBeNull();
  });

  it('puts the Off row first with index -1 when offLabel is set', () => {
    const {screen, onSelect} = renderPicker({
      title: 'Subtitles',
      offLabel: 'None',
    });

    expect(TRACK_OFF_INDEX).toBe(-1);
    expect(rowIds(screen)[0]).toBe('track-picker-row--1');
    expect(screen.getByText('None')).toBeTruthy();
    fireEvent.press(screen.getByTestId('track-picker-row--1'));
    expect(onSelect).toHaveBeenCalledWith(-1);
  });

  it('checks only the selected row', () => {
    const {screen} = renderPicker({selectedIndex: 2});

    expect(screen.getByTestId('track-picker-row-2-check')).toBeTruthy();
    expect(screen.queryByTestId('track-picker-row-1-check')).toBeNull();
    expect(screen.queryByTestId('track-picker-row-5-check')).toBeNull();
    expect(
      screen.getByTestId('track-picker-row-2').props.accessibilityState,
    ).toMatchObject({checked: true});
    expect(
      screen.getByTestId('track-picker-row-1').props.accessibilityState,
    ).toMatchObject({checked: false});
  });

  it('checks the Off row when subtitles are off', () => {
    const {screen} = renderPicker({offLabel: 'None', selectedIndex: -1});

    expect(screen.getByTestId('track-picker-row--1-check')).toBeTruthy();
    expect(screen.queryByTestId('track-picker-row-1-check')).toBeNull();
  });

  it('checks nothing when the selected index matches no row', () => {
    const {screen} = renderPicker({selectedIndex: 9});
    expect(screen.queryByTestId(/-check$/)).toBeNull();
  });

  it('outlines the selected row in violet and rings the focused one', () => {
    const {screen} = renderPicker({selectedIndex: 2});
    const selected = screen.getByTestId('track-picker-row-2');
    const other = screen.getByTestId('track-picker-row-5');

    expect(flatStyle(selected.props.style)).toMatchObject({
      borderColor: colors.violet,
      backgroundColor: colors.surfaceRaised,
    });
    expect(flatStyle(other.props.style).borderColor).toBe(colors.transparent);

    fireEvent(other, 'focus');
    expect(flatStyle(other.props.style)).toMatchObject({
      borderColor: colors.focus,
      backgroundColor: colors.violet,
      transform: [{scale: focus.scale}],
    });
    fireEvent(other, 'blur');
    expect(flatStyle(other.props.style).borderColor).toBe(colors.transparent);
  });

  it('starts focus on the selected row', () => {
    const {screen} = renderPicker({selectedIndex: 5});
    const preferred = screen
      .getAllByRole('radio')
      .filter((row) => row.props.hasTVPreferredFocus)
      .map((row) => row.props.testID);
    expect(preferred).toEqual(['track-picker-row-5']);
  });

  it('starts focus on the Off row when it is selected', () => {
    const {screen} = renderPicker({offLabel: 'None', selectedIndex: -1});
    expect(
      screen.getByTestId('track-picker-row--1').props.hasTVPreferredFocus,
    ).toBe(true);
    expect(
      screen.getByTestId('track-picker-row-1').props.hasTVPreferredFocus,
    ).toBe(false);
  });

  it.each([
    ['no selection', undefined],
    ['an unknown selection', 9],
  ])('starts focus on the first row with %s', (_, selectedIndex) => {
    const {screen} = renderPicker({selectedIndex});
    const preferred = screen
      .getAllByRole('radio')
      .filter((row) => row.props.hasTVPreferredFocus)
      .map((row) => row.props.testID);
    expect(preferred).toEqual(['track-picker-row-1']);
  });

  it('starts focus on Off when nothing matches and Off is shown', () => {
    const {screen} = renderPicker({offLabel: 'None', selectedIndex: 9});
    expect(
      screen.getByTestId('track-picker-row--1').props.hasTVPreferredFocus,
    ).toBe(true);
  });

  it('traps focus inside the panel in every direction', () => {
    const {screen} = renderPicker();
    expect(screen.UNSAFE_getByType(TVFocusGuideView).props).toMatchObject({
      trapFocusUp: true,
      trapFocusDown: true,
      trapFocusLeft: true,
      trapFocusRight: true,
    });
  });

  it('calls onSelect with the pressed row index', () => {
    const {screen, onSelect, onClose} = renderPicker({selectedIndex: 1});

    fireEvent.press(screen.getByTestId('track-picker-row-5'));
    expect(onSelect).toHaveBeenCalledWith(5);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onSelect for the row that is already selected', () => {
    const {screen, onSelect} = renderPicker({selectedIndex: 1});

    fireEvent.press(screen.getByTestId('track-picker-row-1'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('closes on Back and reports it handled', () => {
    const {onClose} = renderPicker();

    expect(addListener).toHaveBeenCalledTimes(1);
    const [eventName, handler] = addListener.mock.calls[0];
    expect(eventName).toBe('hardwareBackPress');
    let handled: unknown;
    act(() => {
      handled = handler();
    });
    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls the latest onClose without re-registering', () => {
    const first = jest.fn();
    const second = jest.fn();
    const screen = render(
      <TrackPicker
        title="Audio"
        tracks={TRACKS}
        onSelect={jest.fn()}
        onClose={first}
      />,
    );
    screen.rerender(
      <TrackPicker
        title="Audio"
        tracks={TRACKS}
        onSelect={jest.fn()}
        onClose={second}
      />,
    );

    expect(addListener).toHaveBeenCalledTimes(1);
    addListener.mock.calls[0][1]();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('removes the Back listener on unmount', () => {
    const {screen} = renderPicker();
    const subscription = addListener.mock.results[0].value;

    expect(subscription.remove).not.toHaveBeenCalled();
    screen.unmount();
    expect(subscription.remove).toHaveBeenCalledTimes(1);
  });

  it('shows only the Off row for no tracks with offLabel', () => {
    const {screen, onSelect} = renderPicker({
      tracks: [],
      offLabel: 'None',
      selectedIndex: -1,
    });

    expect(rowIds(screen)).toEqual(['track-picker-row--1']);
    expect(screen.getByTestId('track-picker-row--1-check')).toBeTruthy();
    expect(
      screen.getByTestId('track-picker-row--1').props.hasTVPreferredFocus,
    ).toBe(true);
    expect(screen.queryByTestId('track-picker-empty')).toBeNull();
    fireEvent.press(screen.getByTestId('track-picker-row--1'));
    expect(onSelect).toHaveBeenCalledWith(-1);
  });

  it('shows a focusable empty note for no tracks without offLabel', () => {
    const {screen, onSelect, onClose} = renderPicker({tracks: []});

    const empty = screen.getByTestId('track-picker-empty');
    expect(screen.getByText('No tracks available')).toBeTruthy();
    expect(empty.props.hasTVPreferredFocus).toBe(true);
    expect(screen.queryByTestId(/-check$/)).toBeNull();
    fireEvent.press(empty);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('uses the given testID as the prefix', () => {
    const {screen} = renderPicker({testID: 'subs'});
    expect(screen.getByTestId('subs')).toBeTruthy();
    expect(screen.getByTestId('subs-row-1')).toBeTruthy();
  });
});

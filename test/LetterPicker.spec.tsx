import 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {act, fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';
import {BackHandler} from 'react-native';

import {LIBRARY_LETTERS} from '../src/api/libraryTypes';
import {
  LetterPicker,
  type LetterPickerProps,
} from '../src/components/LetterPicker';
import {colors} from '../src/theme';

const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const addListener = BackHandler.addEventListener as jest.Mock;

const renderPicker = (props: Partial<LetterPickerProps> = {}) => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const screen = render(
    <LetterPicker onSelect={onSelect} onClose={onClose} {...props} />,
  );
  return {screen, onSelect, onClose};
};

const preferred = (screen: ReturnType<typeof render>) =>
  screen
    .getAllByRole('button')
    .filter((key) => key.props.hasTVPreferredFocus)
    .map((key) => key.props.testID);

describe('LetterPicker', () => {
  beforeEach(() => addListener.mockClear());

  it('shows # and A to Z, in order', () => {
    const {screen} = renderPicker();
    const labels = screen
      .getAllByRole('button')
      .map((key) => key.props.accessibilityLabel);

    expect(labels).toHaveLength(27);
    expect(labels).toEqual(LIBRARY_LETTERS);
    expect(labels[0]).toBe('#');
    expect(labels[26]).toBe('Z');
  });

  it('starts focus on the selected letter', () => {
    const {screen} = renderPicker({selected: 'M'});
    expect(preferred(screen)).toEqual(['letter-picker-M']);
  });

  it.each([
    ['no selection', undefined],
    ['an unknown selection', 'Ä'],
    ['an empty selection', ''],
  ])('starts focus on # with %s', (_, selected) => {
    const {screen} = renderPicker({selected});
    expect(preferred(screen)).toEqual(['letter-picker-#']);
  });

  it('keeps the initial focus when the selection changes while open', () => {
    const {screen} = renderPicker({selected: 'B'});
    screen.rerender(
      <LetterPicker selected="C" onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(preferred(screen)).toEqual(['letter-picker-B']);
  });

  it('marks only the selected letter', () => {
    const {screen} = renderPicker({selected: 'M'});
    const marked = screen
      .getAllByRole('button')
      .filter((key) => key.props.accessibilityState.selected)
      .map((key) => key.props.testID);

    expect(marked).toEqual(['letter-picker-M']);
    expect(
      flatStyle(screen.getByTestId('letter-picker-M').props.style),
    ).toMatchObject({borderColor: colors.violet});
    expect(
      flatStyle(screen.getByTestId('letter-picker-N').props.style).borderColor,
    ).toBe(colors.transparent);
  });

  it('rings the focused letter', () => {
    const {screen} = renderPicker();
    const key = screen.getByTestId('letter-picker-Q');

    fireEvent(key, 'focus');
    expect(flatStyle(key.props.style)).toMatchObject({
      borderColor: colors.focus,
      backgroundColor: colors.violet,
    });
    fireEvent(key, 'blur');
    expect(flatStyle(key.props.style).borderColor).toBe(colors.transparent);
  });

  it('traps focus in the strip in every direction', () => {
    const {screen} = renderPicker();
    expect(screen.UNSAFE_getByType(TVFocusGuideView).props).toMatchObject({
      trapFocusUp: true,
      trapFocusDown: true,
      trapFocusLeft: true,
      trapFocusRight: true,
    });
  });

  it('calls onSelect with the pressed letter and does not close', () => {
    const {screen, onSelect, onClose} = renderPicker();

    fireEvent.press(screen.getByTestId('letter-picker-K'));
    expect(onSelect).toHaveBeenCalledWith('K');
    fireEvent.press(screen.getByTestId('letter-picker-#'));
    expect(onSelect).toHaveBeenLastCalledWith('#');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onSelect for the letter that is already selected', () => {
    const {screen, onSelect} = renderPicker({selected: 'K'});

    fireEvent.press(screen.getByTestId('letter-picker-K'));
    expect(onSelect).toHaveBeenCalledWith('K');
  });

  it('closes on Back and reports it handled', () => {
    const {onClose, onSelect} = renderPicker();

    expect(addListener).toHaveBeenCalledTimes(1);
    const [eventName, handler] = addListener.mock.calls[0];
    expect(eventName).toBe('hardwareBackPress');
    let handled: unknown;
    act(() => {
      handled = handler();
    });
    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls the latest onClose without re-registering', () => {
    const first = jest.fn();
    const second = jest.fn();
    const screen = render(
      <LetterPicker onSelect={jest.fn()} onClose={first} />,
    );
    screen.rerender(<LetterPicker onSelect={jest.fn()} onClose={second} />);

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
});

import 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';

import {
  DetailsActions,
  DetailsActionsProps,
} from '../../src/components/DetailsActions';
import {DetailsAction} from '../../src/components/types';
import {colors, focus} from '../../src/theme';

// The Vega Jest preset's StyleSheet.flatten mock returns arrays untouched.
const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const makeActions = (
  overrides: Partial<Record<string, Partial<DetailsAction>>> = {},
): DetailsAction[] =>
  (
    [
      {key: 'resume', label: 'Resume from 0:42:10', icon: 'resume'},
      {key: 'play', label: 'Play from beginning', icon: 'play'},
      {key: 'watched', label: 'Watched', icon: 'watched'},
      {key: 'favorite', label: 'Favorite', icon: 'favorite'},
    ] as const
  ).map((action) => ({
    ...action,
    onPress: jest.fn(),
    ...overrides[action.key],
  }));

const setup = (props: Partial<DetailsActionsProps> = {}) => {
  const actions = props.actions ?? makeActions();
  const screen = render(<DetailsActions {...props} actions={actions} />);
  return {screen, actions};
};

const iconFill = (screen: ReturnType<typeof render>, key: string) =>
  screen
    .getByTestId(`details-actions-${key}-icon`)
    .findAll((node) => typeof node.props.d === 'string')[0].props.fill;

describe('DetailsActions', () => {
  it('renders the labels in order', () => {
    const {screen} = setup();
    const labels = screen
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel);
    expect(labels).toEqual([
      'Resume from 0:42:10',
      'Play from beginning',
      'Watched',
      'Favorite',
    ]);
    expect(screen.getByText('Play from beginning')).toBeTruthy();
  });

  it('gives each button a testID and an icon', () => {
    const {screen} = setup({testID: 'row'});
    for (const key of ['resume', 'play', 'watched', 'favorite']) {
      expect(screen.getByTestId(`row-${key}`)).toContainElement(
        screen.getByTestId(`row-${key}-icon`),
      );
    }
  });

  it('calls onPress of the pressed button', () => {
    const {screen, actions} = setup();
    fireEvent.press(screen.getByTestId('details-actions-play'));
    expect(actions[1].onPress).toHaveBeenCalledTimes(1);
    expect(actions[0].onPress).not.toHaveBeenCalled();
  });

  it('ignores presses on a disabled button, which stays focusable', () => {
    const {screen, actions} = setup({
      actions: makeActions({watched: {disabled: true}}),
    });
    const button = screen.getByTestId('details-actions-watched');
    fireEvent.press(button);
    expect(actions[2].onPress).not.toHaveBeenCalled();
    expect(button.props.focusable).not.toBe(false);
    expect(button.props.accessibilityState).toMatchObject({disabled: true});
    expect(flatStyle(button.props.style).opacity).toBe(0.5);
  });

  it('gives preferred focus to the first button only', () => {
    const {screen} = setup({hasTVPreferredFocus: true});
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].props.hasTVPreferredFocus).toBe(true);
    for (const button of buttons.slice(1)) {
      expect(button.props.hasTVPreferredFocus).toBe(false);
    }
  });

  it('asks for no focus by default', () => {
    const {screen} = setup();
    for (const button of screen.getAllByRole('button')) {
      expect(button.props.hasTVPreferredFocus).toBe(false);
    }
  });

  it('shows an active toggle as on', () => {
    const {screen} = setup({
      actions: makeActions({favorite: {active: true}}),
    });
    const favorite = screen.getByTestId('details-actions-favorite');
    expect(favorite.props.accessibilityState).toMatchObject({selected: true});
    expect(
      flatStyle(
        screen.getByTestId('details-actions-favorite-circle').props.style,
      ),
    ).toMatchObject({
      borderColor: colors.violet,
      backgroundColor: colors.surfaceRaised,
    });
    expect(iconFill(screen, 'favorite')).toBe(colors.violetLight);

    const watched = screen.getByTestId('details-actions-watched');
    expect(watched.props.accessibilityState).toMatchObject({selected: false});
    expect(iconFill(screen, 'watched')).toBe(colors.textMuted);
  });

  it('shows the focus ring on focus and drops it on blur', () => {
    const {screen} = setup({
      actions: makeActions({favorite: {active: true}}),
    });
    const button = screen.getByTestId('details-actions-favorite');
    const circleStyle = () =>
      flatStyle(
        screen.getByTestId('details-actions-favorite-circle').props.style,
      );

    fireEvent(button, 'focus');
    expect(circleStyle()).toMatchObject({
      borderColor: colors.focus,
      backgroundColor: colors.violet,
      transform: [{scale: focus.scale}],
    });
    expect(iconFill(screen, 'favorite')).toBe(colors.text);

    fireEvent(button, 'blur');
    expect(circleStyle()).toMatchObject({borderColor: colors.violet});
    expect(circleStyle().transform).toBeUndefined();
  });

  it('renders an empty row without crashing', () => {
    const {screen} = setup({actions: []});
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

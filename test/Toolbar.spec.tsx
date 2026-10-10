import 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';

import {Toolbar, ToolbarProps} from '../src/components/Toolbar';
import {colors} from '../src/theme';

// The Vega Jest preset's StyleSheet.flatten mock returns arrays untouched.
const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const setup = (props: Partial<ToolbarProps> = {}) => {
  const handlers = {
    onUserPress: jest.fn(),
    onHomePress: jest.fn(),
    onSearchPress: jest.fn(),
    onSettingsPress: jest.fn(),
    onFocusChange: jest.fn(),
  };
  const screen = render(
    <Toolbar
      active={undefined}
      user={{name: 'José Melo'}}
      {...handlers}
      {...props}
    />,
  );
  return {screen, ...handlers};
};

describe('Toolbar', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders the user, the Home/Search group and Settings with the clock', () => {
    const {screen} = setup();
    expect(screen.getByTestId('toolbar-start')).toContainElement(
      screen.getByLabelText('Switch user'),
    );
    const center = screen.getByTestId('toolbar-center');
    expect(center).toContainElement(screen.getByLabelText('Home'));
    expect(center).toContainElement(screen.getByLabelText('Search'));
    const end = screen.getByTestId('toolbar-end');
    expect(end).toContainElement(screen.getByLabelText('Settings'));
    expect(end).toContainElement(screen.getByTestId('toolbar-clock'));
    expect(screen.getByLabelText('Settings')).toContainElement(
      screen.getByTestId('toolbar-settings-icon'),
    );
  });

  it('calls each handler on press', () => {
    const {screen, onUserPress, onHomePress, onSearchPress, onSettingsPress} =
      setup();
    fireEvent.press(screen.getByLabelText('Switch user'));
    fireEvent.press(screen.getByLabelText('Home'));
    fireEvent.press(screen.getByLabelText('Search'));
    fireEvent.press(screen.getByLabelText('Settings'));
    expect(onUserPress).toHaveBeenCalledTimes(1);
    expect(onHomePress).toHaveBeenCalledTimes(1);
    expect(onSearchPress).toHaveBeenCalledTimes(1);
    expect(onSettingsPress).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['home', true, false],
    ['search', false, true],
    [undefined, false, false],
  ] as const)('highlights the active button (%s)', (active, home, search) => {
    const {screen} = setup({active});
    const homeButton = screen.getByTestId('toolbar-home');
    const searchButton = screen.getByTestId('toolbar-search');
    expect(homeButton.props.accessibilityState).toMatchObject({selected: home});
    expect(searchButton.props.accessibilityState).toMatchObject({
      selected: search,
    });
    if (active) {
      const button = active === 'home' ? homeButton : searchButton;
      expect(flatStyle(button.props.style).borderColor).toBe(colors.violet);
    }
  });

  it('shows the focus ring on a focused button', () => {
    const {screen} = setup({active: 'home'});
    const home = screen.getByTestId('toolbar-home');
    fireEvent(home, 'focus');
    expect(flatStyle(home.props.style).borderColor).toBe(colors.focus);
    fireEvent(home, 'blur');
    expect(flatStyle(home.props.style).borderColor).toBe(colors.violet);
  });

  it('shows initials when there is no image', () => {
    const {screen} = setup();
    expect(screen.getByTestId('toolbar-user-initials')).toHaveTextContent(
      'JM',
    );
    expect(screen.queryByTestId('toolbar-user-image')).toBeNull();
  });

  it('shows the image, then initials after it fails to load', () => {
    const {screen} = setup({
      user: {name: 'melojms', imageUri: 'https://server/a.jpg'},
    });
    const image = screen.getByTestId('toolbar-user-image');
    expect(image.props.source).toEqual({uri: 'https://server/a.jpg'});
    expect(screen.queryByTestId('toolbar-user-initials')).toBeNull();

    fireEvent(image, 'error');
    expect(screen.getByTestId('toolbar-user-initials')).toHaveTextContent('M');
    expect(screen.queryByTestId('toolbar-user-image')).toBeNull();
  });

  it('retries the image when the URI changes after an error', () => {
    const {screen, ...handlers} = setup({
      user: {name: 'melojms', imageUri: 'https://server/a.jpg'},
    });
    fireEvent(screen.getByTestId('toolbar-user-image'), 'error');
    screen.rerender(
      <Toolbar
        active={undefined}
        user={{name: 'melojms', imageUri: 'https://server/b.jpg'}}
        {...handlers}
      />,
    );
    expect(screen.getByTestId('toolbar-user-image').props.source).toEqual({
      uri: 'https://server/b.jpg',
    });
  });

  it('reports focus entering and leaving, not moves inside it', () => {
    const {screen, onFocusChange} = setup();
    const user = screen.getByTestId('toolbar-user');
    const home = screen.getByTestId('toolbar-home');

    fireEvent(user, 'focus');
    expect(onFocusChange).toHaveBeenCalledTimes(1);
    expect(onFocusChange).toHaveBeenLastCalledWith(true);

    // Moving to Home blurs the avatar first; that isn't leaving the toolbar.
    fireEvent(user, 'blur');
    fireEvent(home, 'focus');
    act(() => jest.runOnlyPendingTimers());
    expect(onFocusChange).toHaveBeenCalledTimes(1);

    fireEvent(home, 'blur');
    act(() => jest.runOnlyPendingTimers());
    expect(onFocusChange).toHaveBeenCalledTimes(2);
    expect(onFocusChange).toHaveBeenLastCalledWith(false);
  });

  it("doesn't report a pending blur after unmount", () => {
    const {screen, onFocusChange} = setup();
    const home = screen.getByTestId('toolbar-home');
    fireEvent(home, 'focus');
    fireEvent(home, 'blur');
    screen.unmount();
    act(() => jest.runOnlyPendingTimers());
    expect(onFocusChange).toHaveBeenCalledTimes(1);
  });
});

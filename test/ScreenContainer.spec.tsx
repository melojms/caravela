import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {fireEvent, render, screen, within} from '@testing-library/react-native';
import React from 'react';
import {Text, View} from 'react-native';
import type {ReactTestRendererJSON} from 'react-test-renderer';

import type {SessionContextValue} from '../src/auth/SessionContext';
import {useSession} from '../src/auth/SessionContext';
import {ScreenContainer} from '../src/screens/ScreenContainer';
import {sessionFor} from './auth/fakes';

jest.mock('../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

const mockNavigation = {popTo: jest.fn(), navigate: jest.fn()};
jest.mock('@amazon-devices/react-navigation__native', () => ({
  ...jest.requireActual('@amazon-devices/react-navigation__native'),
  useNavigation: () => mockNavigation,
}));

let session: jest.Mocked<Pick<SessionContextValue, 'session' | 'switchUser'>>;

beforeEach(() => {
  mockNavigation.popTo.mockClear();
  mockNavigation.navigate.mockClear();
  session = {session: sessionFor(), switchUser: jest.fn()};
  jest.mocked(useSession).mockReturnValue(session as any);
});

const selected = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.selected;

const preferred = (testID: string) =>
  screen.getByTestId(testID).props.hasTVPreferredFocus;

/** The buttons the toolbar's focus guide sends incoming focus to. */
const toolbarDestinations = () =>
  screen
    .UNSAFE_getAllByType(TVFocusGuideView)
    .find((guide) => guide.props.testID === 'toolbar')
    ?.props.destinations?.map(
      (destination: {props: {testID: string}}) => destination.props.testID,
    );

describe('ScreenContainer', () => {
  it('has no toolbar without the prop', () => {
    render(
      <ScreenContainer title="Movies" testID="screen">
        <Text>content</Text>
      </ScreenContainer>,
    );

    expect(screen.getByTestId('screen')).toBeTruthy();
    expect(screen.getByText('Movies')).toBeTruthy();
    expect(screen.getByText('content')).toBeTruthy();
    expect(screen.queryByTestId('toolbar')).toBeNull();
  });

  it.each([
    ['home', true, false],
    ['search', false, true],
  ] as const)('highlights %s in the toolbar', (toolbar, home, search) => {
    render(
      <ScreenContainer toolbar={toolbar} testID="screen">
        <Text>content</Text>
      </ScreenContainer>,
    );

    expect(screen.getByTestId('toolbar')).toBeTruthy();
    expect(selected('toolbar-home')).toBe(home);
    expect(selected('toolbar-search')).toBe(search);
    expect(screen.getByText('content')).toBeTruthy();
  });

  it("shows the signed-in user's picture with the token", () => {
    render(
      <ScreenContainer toolbar="home">
        <Text>content</Text>
      </ScreenContainer>,
    );

    expect(screen.getByTestId('toolbar-user-image').props.source).toEqual({
      uri:
        'https://srv1.example.com/Users/u1/Images/Primary' +
        '?maxHeight=100&quality=90&ApiKey=token-1',
    });
  });

  it('shows initials when there is no session', () => {
    session.session = undefined;
    render(
      <ScreenContainer toolbar="home">
        <Text>content</Text>
      </ScreenContainer>,
    );

    expect(screen.queryByTestId('toolbar-user-image')).toBeNull();
    expect(screen.getByTestId('toolbar-user-initials')).toHaveTextContent('?');
  });

  it('wires each toolbar button', () => {
    render(
      <ScreenContainer toolbar="search">
        <Text>content</Text>
      </ScreenContainer>,
    );

    fireEvent.press(screen.getByTestId('toolbar-user'));
    expect(session.switchUser).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('toolbar-home'));
    expect(mockNavigation.popTo).toHaveBeenCalledWith('Home');

    fireEvent.press(screen.getByTestId('toolbar-search'));
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith(
      'Search',
      undefined,
      {
        pop: true,
      },
    );

    fireEvent.press(screen.getByTestId('toolbar-settings'));
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith(
      'Settings',
      undefined,
      {pop: true},
    );
  });

  it.each([
    ['home', 'toolbar-home', 'toolbar-search'],
    ['search', 'toolbar-search', 'toolbar-home'],
  ] as const)(
    'sends focus entering the toolbar to the active button on %s',
    (toolbar, active, other) => {
      render(
        <ScreenContainer toolbar={toolbar}>
          <Text>content</Text>
        </ScreenContainer>,
      );

      expect(toolbarDestinations()).toEqual([active]);
      // The active button is also the initial focus.
      expect(preferred(active)).toBe(true);
      expect(preferred(other)).toBe(false);
      expect(preferred('toolbar-user')).toBeFalsy();
    },
  );

  it('moves the destination when the active entry changes', () => {
    const {rerender} = render(
      <ScreenContainer toolbar="home">
        <Text>content</Text>
      </ScreenContainer>,
    );
    rerender(
      <ScreenContainer toolbar="search">
        <Text>content</Text>
      </ScreenContainer>,
    );

    expect(toolbarDestinations()).toEqual(['toolbar-search']);
  });

  it('leaves the initial focus to the content with focusToolbar off', () => {
    render(
      <ScreenContainer toolbar="home" focusToolbar={false}>
        <Text>content</Text>
      </ScreenContainer>,
    );

    expect(preferred('toolbar-home')).toBe(false);
    expect(toolbarDestinations()).toEqual(['toolbar-home']);
  });

  it('draws the background behind the toolbar, across the whole screen', () => {
    render(
      <ScreenContainer
        toolbar="home"
        background={<View testID="background" />}
        testID="screen">
        <Text>content</Text>
      </ScreenContainer>,
    );

    // The background is the screen's first child, so the toolbar and the
    // content draw over it; it isn't inside the content area.
    const tree = screen.toJSON() as ReactTestRendererJSON;
    const order = tree.children?.map(
      (child) => (child as ReactTestRendererJSON).props.testID,
    );
    expect(order).toEqual(['background', 'toolbar', 'screen']);
    expect(
      within(screen.getByTestId('screen')).queryByTestId('background'),
    ).toBeNull();
    expect(screen.getByTestId('toolbar')).toBeTruthy();
  });
});

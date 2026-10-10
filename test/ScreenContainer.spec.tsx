import {fireEvent, render, screen} from '@testing-library/react-native';
import React from 'react';
import {Text} from 'react-native';

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
        '?maxHeight=100&quality=90&api_key=token-1',
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
});

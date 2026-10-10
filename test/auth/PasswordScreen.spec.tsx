import {act, fireEvent, render, screen} from '@testing-library/react-native';
import React from 'react';

import {AuthError} from '../../src/auth/authService';
import type {Session} from '../../src/auth/authService';
import type {SessionContextValue} from '../../src/auth/SessionContext';
import {useSession} from '../../src/auth/SessionContext';
import {
  PasswordScreen,
  QUICK_CONNECT_OFF,
} from '../../src/screens/auth/PasswordScreen';
import {
  fakeService,
  fakeStore,
  networkError,
  sessionFor,
  signedInState,
} from './fakes';

jest.mock('../../src/auth/SessionContext', () => ({useSession: jest.fn()}));

type Params = {
  serverId: string;
  userId?: string;
  username?: string;
  notice?: string;
};

let session: jest.Mocked<Pick<SessionContextValue, 'signIn'>>;
let service: ReturnType<typeof fakeService>;
let navigation: {navigate: jest.Mock};

const renderScreen = async (
  params: Params = {serverId: 'srv1', userId: 'u1', username: 'melojms'},
) => {
  const result = render(
    <PasswordScreen
      {...({
        route: {key: 'Password', name: 'Password', params},
        navigation,
      } as any)}
      authService={service}
      authStore={fakeStore(signedInState())}
    />,
  );
  // Let the server name load.
  await act(async () => {});
  return result;
};

const submit = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId('password-sign-in'));
  });
};

beforeEach(() => {
  session = {signIn: jest.fn()};
  (useSession as jest.Mock).mockImplementation(() => session);
  service = fakeService();
  service.loginWithPassword.mockResolvedValue(sessionFor());
  navigation = {navigate: jest.fn()};
});

describe('PasswordScreen', () => {
  it('shows a given username read-only and focuses the password', async () => {
    await renderScreen();

    expect(screen.getByTestId('password-username')).toHaveTextContent(
      'melojms',
    );
    expect(screen.queryByTestId('password-username-input')).toBeNull();
    const password = screen.getByTestId('password-input');
    expect(password.props.secureTextEntry).toBe(true);
    expect(password.props.returnKeyType).toBe('go');
    expect(password.props.hasTVPreferredFocus).toBe(true);
  });

  it('asks for a username when none is given', async () => {
    await renderScreen({serverId: 'srv1'});

    expect(screen.queryByTestId('password-username')).toBeNull();
    const username = screen.getByTestId('password-username-input');
    expect(username.props.returnKeyType).toBe('next');
    expect(username.props.hasTVPreferredFocus).toBe(true);
    expect(
      screen.getByTestId('password-input').props.hasTVPreferredFocus,
    ).toBeFalsy();

    fireEvent.changeText(username, '  alice  ');
    fireEvent.changeText(screen.getByTestId('password-input'), 'secret');
    await submit();

    expect(service.loginWithPassword).toHaveBeenCalledWith(
      'srv1',
      'alice',
      'secret',
    );
  });

  it('asks for a username before submitting without one', async () => {
    await renderScreen({serverId: 'srv1'});
    await submit();

    expect(service.loginWithPassword).not.toHaveBeenCalled();
    expect(screen.getByTestId('password-error')).toHaveTextContent(
      'Enter a username.',
    );
  });

  it('submits an empty password and signs in', async () => {
    const signedIn = sessionFor();
    service.loginWithPassword.mockResolvedValue(signedIn);
    await renderScreen();
    await submit();

    expect(service.loginWithPassword).toHaveBeenCalledWith(
      'srv1',
      'melojms',
      '',
    );
    expect(session.signIn).toHaveBeenCalledWith(signedIn);
  });

  it('submits from the password return key', async () => {
    await renderScreen();
    await act(async () => {
      fireEvent(screen.getByTestId('password-input'), 'submitEditing', {
        nativeEvent: {text: '', submitAction: 'go'},
      });
    });
    expect(service.loginWithPassword).toHaveBeenCalledTimes(1);
  });

  it("ignores the Vega keyboard's own actions on the password field", async () => {
    await renderScreen();
    await act(async () => {
      fireEvent(screen.getByTestId('password-input'), 'submitEditing', {
        nativeEvent: {text: '', submitAction: 'showPassword'},
      });
    });
    expect(service.loginWithPassword).not.toHaveBeenCalled();
  });

  it('shows wrong credentials', async () => {
    service.loginWithPassword.mockRejectedValue(
      new AuthError('invalid-credentials', 'Nope.'),
    );
    await renderScreen();
    await submit();

    expect(screen.getByTestId('password-error')).toHaveTextContent(
      'Wrong username or password.',
    );
    expect(session.signIn).not.toHaveBeenCalled();
  });

  it('shows a network error with the server name', async () => {
    service.loginWithPassword.mockRejectedValue(networkError());
    await renderScreen();
    await submit();

    expect(screen.getByTestId('password-error')).toHaveTextContent(
      "Can't reach Home.",
    );
  });

  it('shows a generic message for anything else', async () => {
    service.loginWithPassword.mockRejectedValue(new Error('boom'));
    await renderScreen();
    await submit();

    expect(screen.getByTestId('password-error')).toHaveTextContent(
      'Something went wrong. Try again.',
    );
  });

  it('ignores repeat submits while signing in', async () => {
    let resolve!: (value: Session) => void;
    service.loginWithPassword.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByTestId('password-sign-in'));
      fireEvent.press(screen.getByTestId('password-sign-in'));
      fireEvent(screen.getByTestId('password-input'), 'submitEditing', {
        nativeEvent: {text: '', submitAction: 'go'},
      });
    });

    const button = screen.getByTestId('password-sign-in');
    expect(button).toHaveTextContent('Signing in…');
    expect(service.loginWithPassword).toHaveBeenCalledTimes(1);

    const signedIn = sessionFor();
    await act(async () => resolve(signedIn));
    expect(session.signIn).toHaveBeenCalledTimes(1);
  });

  it('does not sign in when the login resolves after unmount', async () => {
    let resolve!: (value: Session) => void;
    service.loginWithPassword.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const {unmount} = await renderScreen();
    await submit();

    unmount();
    await act(async () => resolve(sessionFor()));
    expect(session.signIn).not.toHaveBeenCalled();
  });

  it('shows the notice and hides Use Quick Connect when it is off', async () => {
    await renderScreen({
      serverId: 'srv1',
      userId: 'u1',
      username: 'melojms',
      notice: QUICK_CONNECT_OFF,
    });

    expect(screen.getByTestId('password-notice')).toHaveTextContent(
      'Quick Connect is turned off on this server.',
    );
    expect(screen.queryByTestId('password-use-quick-connect')).toBeNull();
  });

  it('shows no notice by default', async () => {
    await renderScreen();
    expect(screen.queryByTestId('password-notice')).toBeNull();
  });

  it('opens Quick Connect for the same user', async () => {
    await renderScreen();

    fireEvent.press(screen.getByTestId('password-use-quick-connect'));

    expect(navigation.navigate).toHaveBeenCalledWith('QuickConnect', {
      serverId: 'srv1',
      userId: 'u1',
    });
  });
});

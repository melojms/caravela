import {act, fireEvent, render, screen} from '@testing-library/react-native';
import React from 'react';

import {AuthError} from '../../src/auth/authService';
import type {QuickConnectAttempt} from '../../src/auth/authService';
import type {SessionContextValue} from '../../src/auth/SessionContext';
import {useSession} from '../../src/auth/SessionContext';
import {QUICK_CONNECT_OFF} from '../../src/screens/auth/PasswordScreen';
import {QuickConnectScreen} from '../../src/screens/auth/QuickConnectScreen';
import {
  fakeAttempt,
  fakeService,
  fakeStore,
  networkError,
  sessionFor,
  signedInState,
} from './fakes';

jest.mock('../../src/auth/SessionContext', () => ({useSession: jest.fn()}));

let session: jest.Mocked<Pick<SessionContextValue, 'signIn'>>;
let service: ReturnType<typeof fakeService>;
let navigation: {goBack: jest.Mock; replace: jest.Mock};

const renderScreen = async (
  params: {serverId: string; userId?: string} = {
    serverId: 'srv1',
    userId: 'u1',
  },
) => {
  const result = render(
    <QuickConnectScreen
      {...({
        route: {key: 'QuickConnect', name: 'QuickConnect', params},
        navigation,
      } as any)}
      authService={service}
      authStore={fakeStore(signedInState())}
    />,
  );
  // Let the attempt, the server and the user load.
  await act(async () => {});
  return result;
};

beforeEach(() => {
  session = {signIn: jest.fn()};
  (useSession as jest.Mock).mockImplementation(() => session);
  service = fakeService();
  navigation = {goBack: jest.fn(), replace: jest.fn()};
});

afterEach(() => {
  jest.useRealTimers();
});

describe('QuickConnectScreen', () => {
  it('starts an attempt and shows the code and instructions', async () => {
    const {attempt} = fakeAttempt('482913');
    service.startQuickConnect.mockResolvedValue(attempt);
    await renderScreen();

    expect(service.startQuickConnect).toHaveBeenCalledWith('srv1');
    expect(screen.getByText('Sign in with Quick Connect')).toBeTruthy();
    expect(screen.getByTestId('quick-connect-code')).toHaveTextContent(
      '482913',
    );
    expect(screen.getByTestId('quick-connect-instructions')).toHaveTextContent(
      'On another device signed in to Home, open Settings → Quick Connect and enter this code.',
    );
  });

  it('focuses Cancel first', async () => {
    service.startQuickConnect.mockResolvedValue(fakeAttempt().attempt);
    await renderScreen();
    expect(
      screen.getByTestId('quick-connect-cancel').props.hasTVPreferredFocus,
    ).toBe(true);
  });

  it("counts down to the attempt's expiresAt", async () => {
    jest.useFakeTimers({now: 1_000_000});
    service.startQuickConnect.mockResolvedValue(
      fakeAttempt('123456', 1_000_000 + 2 * 60 * 1000).attempt,
    );
    await renderScreen();

    expect(screen.getByTestId('quick-connect-countdown')).toHaveTextContent(
      'Expires in 2:00',
    );
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('quick-connect-countdown')).toHaveTextContent(
      'Expires in 1:59',
    );
    await act(async () => {
      jest.advanceTimersByTime(60 * 1000);
    });
    expect(screen.getByTestId('quick-connect-countdown')).toHaveTextContent(
      'Expires in 0:59',
    );
  });

  it('signs in once the code is approved', async () => {
    const {attempt, resolve} = fakeAttempt();
    service.startQuickConnect.mockResolvedValue(attempt);
    await renderScreen();

    const approved = sessionFor();
    await act(async () => resolve(approved));

    expect(session.signIn).toHaveBeenCalledWith(approved);
  });

  it('cancels and goes back on Cancel', async () => {
    const {attempt} = fakeAttempt();
    service.startQuickConnect.mockResolvedValue(attempt);
    await renderScreen();

    fireEvent.press(screen.getByTestId('quick-connect-cancel'));

    expect(attempt.cancel).toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('cancels the attempt on unmount', async () => {
    const {attempt} = fakeAttempt();
    service.startQuickConnect.mockResolvedValue(attempt);
    const {unmount} = await renderScreen();

    unmount();

    expect(attempt.cancel).toHaveBeenCalled();
  });

  it('cancels an attempt that starts after unmount', async () => {
    const {attempt} = fakeAttempt();
    let start!: (value: QuickConnectAttempt) => void;
    service.startQuickConnect.mockReturnValue(
      new Promise((done) => {
        start = done;
      }),
    );
    const {unmount} = await renderScreen();

    unmount();
    await act(async () => start(attempt));

    expect(attempt.cancel).toHaveBeenCalled();
  });

  it('does not sign in when the session resolves after unmount', async () => {
    // The race from HANDOFF: the code was approved and the login request is
    // in flight when the screen goes away, so the session still resolves.
    const {attempt, resolve} = fakeAttempt();
    service.startQuickConnect.mockResolvedValue(attempt);
    const {unmount} = await renderScreen();

    unmount();
    await act(async () => resolve(sessionFor()));

    expect(attempt.cancel).toHaveBeenCalled();
    expect(session.signIn).not.toHaveBeenCalled();
  });

  it('switches to Password with a notice when Quick Connect is off', async () => {
    service.startQuickConnect.mockRejectedValue(
      new AuthError('quick-connect-disabled', 'Off.'),
    );
    await renderScreen();

    expect(navigation.replace).toHaveBeenCalledWith('Password', {
      serverId: 'srv1',
      userId: 'u1',
      username: 'melojms',
      notice: QUICK_CONNECT_OFF,
    });
    expect(QUICK_CONNECT_OFF).toBe(
      'Quick Connect is turned off on this server.',
    );
  });

  it('shows Try again when the code expires, which starts a new attempt', async () => {
    const first = fakeAttempt('111111');
    const second = fakeAttempt('222222');
    service.startQuickConnect
      .mockResolvedValueOnce(first.attempt)
      .mockResolvedValueOnce(second.attempt);
    await renderScreen();

    await act(async () =>
      first.reject(new AuthError('quick-connect-timeout', 'Expired.')),
    );
    expect(screen.getByTestId('quick-connect-error')).toHaveTextContent(
      'The code expired.',
    );
    expect(screen.queryByTestId('quick-connect-code')).toBeNull();
    const retry = screen.getByTestId('quick-connect-retry');
    expect(retry.props.hasTVPreferredFocus).toBe(true);

    await act(async () => {
      fireEvent.press(retry);
    });

    expect(service.startQuickConnect).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('quick-connect-code')).toHaveTextContent(
      '222222',
    );
    expect(screen.queryByTestId('quick-connect-error')).toBeNull();
  });

  it('keeps Try again focused but disabled while the new code loads', async () => {
    const first = fakeAttempt('111111');
    let startSecond!: (value: QuickConnectAttempt) => void;
    service.startQuickConnect
      .mockResolvedValueOnce(first.attempt)
      .mockReturnValueOnce(
        new Promise((done) => {
          startSecond = done;
        }),
      );
    await renderScreen();
    await act(async () =>
      first.reject(new AuthError('quick-connect-timeout', 'Expired.')),
    );
    expect(
      screen.getByTestId('quick-connect-retry').props.accessibilityState,
    ).toMatchObject({disabled: false});

    await act(async () => {
      fireEvent.press(screen.getByTestId('quick-connect-retry'));
    });

    const retry = screen.getByTestId('quick-connect-retry');
    expect(retry.props.accessibilityState).toMatchObject({disabled: true});
    expect(retry.props.hasTVPreferredFocus).toBe(true);
    expect(
      screen.getByTestId('quick-connect-cancel').props.hasTVPreferredFocus,
    ).toBe(false);
    expect(screen.getByTestId('quick-connect-loading')).toBeTruthy();

    // Pressing it again does nothing while the code loads.
    fireEvent.press(retry);
    expect(service.startQuickConnect).toHaveBeenCalledTimes(2);

    await act(async () => startSecond(fakeAttempt('222222').attempt));
    expect(screen.queryByTestId('quick-connect-retry')).toBeNull();
    expect(screen.getByTestId('quick-connect-code')).toHaveTextContent(
      '222222',
    );
  });

  it('shows other errors with Try again', async () => {
    service.startQuickConnect.mockRejectedValueOnce(networkError());
    await renderScreen();

    expect(screen.getByTestId('quick-connect-error')).toHaveTextContent(
      "Can't reach Home.",
    );
    expect(screen.getByTestId('quick-connect-retry')).toBeTruthy();

    const failed = fakeAttempt();
    service.startQuickConnect.mockResolvedValueOnce(failed.attempt);
    await act(async () => {
      fireEvent.press(screen.getByTestId('quick-connect-retry'));
    });
    await act(async () =>
      failed.reject(new AuthError('bad-response', 'Incomplete response.')),
    );
    expect(screen.getByTestId('quick-connect-error')).toHaveTextContent(
      'Incomplete response.',
    );
  });

  it('cancels and replaces with Password on Use password', async () => {
    const {attempt} = fakeAttempt();
    service.startQuickConnect.mockResolvedValue(attempt);
    await renderScreen();

    fireEvent.press(screen.getByTestId('quick-connect-use-password'));

    expect(attempt.cancel).toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('Password', {
      serverId: 'srv1',
      userId: 'u1',
      username: 'melojms',
    });
  });

  it('takes the username from the public users when it is not saved', async () => {
    service.startQuickConnect.mockResolvedValue(fakeAttempt().attempt);
    service.getPublicUsers.mockResolvedValue([
      {id: 'u7', name: 'alice', hasPassword: true},
    ]);
    await renderScreen({serverId: 'srv1', userId: 'u7'});

    fireEvent.press(screen.getByTestId('quick-connect-use-password'));

    expect(navigation.replace).toHaveBeenCalledWith('Password', {
      serverId: 'srv1',
      userId: 'u7',
      username: 'alice',
    });
  });

  it('leaves the username out when the user is unknown', async () => {
    service.startQuickConnect.mockResolvedValue(fakeAttempt().attempt);
    await renderScreen({serverId: 'srv1'});

    fireEvent.press(screen.getByTestId('quick-connect-use-password'));

    expect(service.getPublicUsers).not.toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('Password', {
      serverId: 'srv1',
    });
  });
});

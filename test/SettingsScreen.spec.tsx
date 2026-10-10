import {act, fireEvent, render, screen} from '@testing-library/react-native';
import React from 'react';

import type {SessionContextValue} from '../src/auth/SessionContext';
import {useSession} from '../src/auth/SessionContext';
import type {AuthState, AutoLogin} from '../src/auth/store';
import {SettingsScreen} from '../src/screens/SettingsScreen';
import {
  HOME,
  fakeStore,
  networkError,
  sessionFor,
  signedInState,
} from './auth/fakes';

jest.mock('../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

let session: jest.Mocked<
  Pick<SessionContextValue, 'session' | 'switchUser' | 'signOut'>
>;
let warn: jest.SpyInstance;

const storeWith = (state: AuthState) => {
  const store = fakeStore(state);
  store.setAutoLogin = jest.fn(async (_autoLogin: AutoLogin) => undefined);
  return store;
};

const renderSettings = async (state = signedInState()) => {
  const store = storeWith(state);
  render(<SettingsScreen authStore={store} />);
  // Let the auto-login setting load.
  await act(async () => {});
  return store;
};

const stateWith = (autoLogin: AutoLogin) => {
  const state = signedInState();
  state.autoLogin = autoLogin;
  return state;
};

const activeOptions = () =>
  screen
    .getAllByTestId(/^settings-auto-login-/)
    .filter((option) => option.props.accessibilityState?.selected)
    .map((option) => option.props.testID);

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

beforeEach(() => {
  session = {
    session: sessionFor(),
    switchUser: jest.fn(),
    signOut: jest.fn(async () => undefined),
  };
  (useSession as jest.Mock).mockImplementation(() => session);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
});

describe('SettingsScreen', () => {
  it('shows the user, the server name and the address', async () => {
    await renderSettings();

    expect(screen.getByTestId('settings-screen')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByTestId('settings-user-name')).toHaveTextContent(
      'melojms',
    );
    expect(screen.getByTestId('settings-server')).toHaveTextContent(
      `Home · ${HOME.address}`,
    );
  });

  it('leaves the first focus to the screen container', async () => {
    await renderSettings();
    const focusable = screen.getAllByRole('button');
    expect(focusable[0].props.testID).toBe('settings-switch-user');
    for (const button of focusable) {
      expect(button.props.hasTVPreferredFocus).toBeFalsy();
    }
  });

  it('switches user', async () => {
    await renderSettings();
    await press('settings-switch-user');
    expect(session.switchUser).toHaveBeenCalledTimes(1);
    expect(session.signOut).not.toHaveBeenCalled();
  });

  it('signs out', async () => {
    await renderSettings();
    await press('settings-sign-out');
    expect(session.signOut).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('catches and logs a failed sign-out', async () => {
    const failure = networkError();
    session.signOut.mockRejectedValue(failure);
    await renderSettings();

    await press('settings-sign-out');

    expect(session.signOut).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Signing out failed', failure);
    // Not stuck: the button can be pressed again once it settled.
    expect(screen.getByTestId('settings-sign-out')).toHaveTextContent(
      'Sign out',
    );
    await press('settings-sign-out');
    expect(session.signOut).toHaveBeenCalledTimes(2);
  });

  it('ignores repeat sign-out presses while one runs', async () => {
    let finish!: () => void;
    session.signOut.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    await renderSettings();

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-sign-out'));
      fireEvent.press(screen.getByTestId('settings-sign-out'));
    });
    expect(screen.getByTestId('settings-sign-out')).toHaveTextContent(
      'Signing out…',
    );
    await press('settings-sign-out');
    expect(session.signOut).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(screen.getByTestId('settings-sign-out')).toHaveTextContent(
      'Sign out',
    );
  });

  it.each([
    [{mode: 'disabled'} as AutoLogin, 'settings-auto-login-disabled'],
    [{mode: 'lastUser'} as AutoLogin, 'settings-auto-login-lastUser'],
    [
      {mode: 'specificUser', serverId: 'srv1', userId: 'u1'} as AutoLogin,
      'settings-auto-login-specificUser',
    ],
  ])('loads auto-login %j from the store', async (autoLogin, testID) => {
    const store = await renderSettings(stateWith(autoLogin));
    expect(store.getState).toHaveBeenCalled();
    expect(activeOptions()).toEqual([testID]);
    expect(screen.queryByTestId('settings-auto-login-specificUser-other')).toBe(
      null,
    );
  });

  it('labels the specific-user option with the current user', async () => {
    await renderSettings();
    expect(
      screen.getByTestId('settings-auto-login-specificUser'),
    ).toHaveTextContent('Only melojms');
  });

  it.each([
    ['settings-auto-login-disabled', {mode: 'disabled'}],
    ['settings-auto-login-lastUser', {mode: 'lastUser'}],
    [
      'settings-auto-login-specificUser',
      {mode: 'specificUser', serverId: 'srv1', userId: 'u1'},
    ],
  ])('%s saves %j', async (testID, value) => {
    const store = await renderSettings(stateWith({mode: 'disabled'}));
    await press(testID);

    expect(store.setAutoLogin).toHaveBeenCalledWith(value);
    expect(activeOptions()).toEqual([testID]);
    expect(screen.queryByTestId('settings-error')).toBeNull();
  });

  it('shows a specificUser for another user as an extra, active option', async () => {
    const store = await renderSettings(
      stateWith({mode: 'specificUser', serverId: 'srv1', userId: 'u2'}),
    );

    const other = screen.getByTestId('settings-auto-login-specificUser-other');
    expect(other).toHaveTextContent('Only guest');
    expect(activeOptions()).toEqual(['settings-auto-login-specificUser-other']);

    // Moving away keeps the option, so it can be picked again.
    await press('settings-auto-login-disabled');
    expect(activeOptions()).toEqual(['settings-auto-login-disabled']);
    await press('settings-auto-login-specificUser-other');
    expect(store.setAutoLogin).toHaveBeenLastCalledWith({
      mode: 'specificUser',
      serverId: 'srv1',
      userId: 'u2',
    });
    expect(activeOptions()).toEqual(['settings-auto-login-specificUser-other']);
  });

  it('falls back to a generic label when the other user is unknown', async () => {
    await renderSettings(
      stateWith({mode: 'specificUser', serverId: 'gone', userId: 'u9'}),
    );
    expect(
      screen.getByTestId('settings-auto-login-specificUser-other'),
    ).toHaveTextContent('Only another user');
  });

  it('reverts the selection and shows a message when saving fails', async () => {
    const store = await renderSettings(stateWith({mode: 'lastUser'}));
    store.setAutoLogin.mockRejectedValueOnce(new Error('disk full'));

    await press('settings-auto-login-disabled');

    expect(store.setAutoLogin).toHaveBeenCalledWith({mode: 'disabled'});
    expect(activeOptions()).toEqual(['settings-auto-login-lastUser']);
    expect(screen.getByTestId('settings-error')).toHaveTextContent(
      "Couldn't save the setting.",
    );

    // The next successful save clears the message.
    await press('settings-auto-login-disabled');
    expect(activeOptions()).toEqual(['settings-auto-login-disabled']);
    expect(screen.queryByTestId('settings-error')).toBeNull();
  });

  it('lets only the latest save revert the selection', async () => {
    const store = await renderSettings(stateWith({mode: 'lastUser'}));
    let failFirst!: (reason: Error) => void;
    store.setAutoLogin
      .mockReturnValueOnce(
        new Promise<void>((_, reject) => {
          failFirst = reject;
        }),
      )
      .mockResolvedValueOnce(undefined);

    await press('settings-auto-login-disabled');
    await press('settings-auto-login-specificUser');
    await act(async () => failFirst(new Error('late failure')));

    expect(activeOptions()).toEqual(['settings-auto-login-specificUser']);
    expect(screen.queryByTestId('settings-error')).toBeNull();
  });

  it('shows a message when the setting cannot be loaded', async () => {
    const store = storeWith(signedInState());
    store.getState.mockRejectedValue(new Error('corrupt'));
    render(<SettingsScreen authStore={store} />);
    await act(async () => {});

    expect(activeOptions()).toEqual([]);
    expect(screen.getByTestId('settings-error')).toHaveTextContent(
      "Couldn't load the setting.",
    );
  });
});

import {act, fireEvent, render} from '@testing-library/react-native';
import React from 'react';

import {
  DiscoveredServer,
  ServerDiscoveryError,
  ServerDiscoveryErrorCode,
} from '../../src/api/serverDiscovery';
import {useSession} from '../../src/auth/SessionContext';
import type {AuthStore, ServerInput} from '../../src/auth/store';
import {AddServerScreen} from '../../src/screens/auth/AddServerScreen';

jest.mock('../../src/auth/SessionContext', () => ({useSession: jest.fn()}));

const found: DiscoveredServer = {
  address: 'https://jellyfin.example.com',
  systemInfo: {Id: 'srv9', ServerName: 'Home', Version: '12.2.0'},
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return {promise, resolve};
};

describe('AddServerScreen', () => {
  let selectServer: jest.Mock;
  let discover: jest.Mock;
  let store: jest.Mocked<Pick<AuthStore, 'upsertServer'>>;

  beforeEach(() => {
    selectServer = jest.fn();
    (useSession as jest.Mock).mockReturnValue({selectServer});
    discover = jest.fn(async () => found);
    store = {
      upsertServer: jest.fn(async (server: ServerInput) => ({
        ...server,
        lastUsed: 1,
        users: {},
      })),
    };
  });

  const renderScreen = () =>
    render(<AddServerScreen discover={discover} store={store} />);

  const typeAndConnect = async (
    screen: ReturnType<typeof renderScreen>,
    text: string,
  ) => {
    fireEvent.changeText(screen.getByTestId('add-server-input'), text);
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-server-connect'));
    });
  };

  it('asks for an address when the input is empty', async () => {
    const screen = renderScreen();
    await typeAndConnect(screen, '   ');

    expect(screen.getByTestId('add-server-error')).toHaveTextContent(
      'Enter a server address.',
    );
    expect(discover).not.toHaveBeenCalled();
  });

  it('saves the server, then selects it', async () => {
    const screen = renderScreen();
    await typeAndConnect(screen, '  jellyfin.example.com ');

    expect(discover).toHaveBeenCalledWith('jellyfin.example.com');
    expect(store.upsertServer).toHaveBeenCalledWith({
      id: 'srv9',
      name: 'Home',
      address: 'https://jellyfin.example.com',
      version: '12.2.0',
    });
    expect(selectServer).toHaveBeenCalledWith('srv9');
    expect(store.upsertServer.mock.invocationCallOrder[0]).toBeLessThan(
      selectServer.mock.invocationCallOrder[0],
    );
  });

  it('names the server after its address when it has no name', async () => {
    discover.mockResolvedValueOnce({
      ...found,
      systemInfo: {Id: 'srv9', Version: '12.2.0'},
    });
    const screen = renderScreen();
    await typeAndConnect(screen, 'jellyfin.example.com');

    expect(store.upsertServer).toHaveBeenCalledWith(
      expect.objectContaining({name: 'https://jellyfin.example.com'}),
    );
  });

  it.each<[ServerDiscoveryErrorCode, string]>([
    ['invalid-address', '"a b" is not a valid server address.'],
    ['unreachable', 'Couldn\'t reach a Jellyfin server at "a b".'],
    [
      'unsupported-version',
      'This server runs Jellyfin 10.11.5. Caravela needs 12.0 or newer.',
    ],
    ['not-jellyfin', '"a b" doesn\'t look like a Jellyfin server.'],
  ])('shows the %s message', async (code, message) => {
    discover.mockRejectedValueOnce(new ServerDiscoveryError(code, message));
    const screen = renderScreen();
    await typeAndConnect(screen, 'a b');

    expect(screen.getByTestId('add-server-error')).toHaveTextContent(message);
    expect(store.upsertServer).not.toHaveBeenCalled();
    expect(selectServer).not.toHaveBeenCalled();
  });

  it('shows a generic message for other errors', async () => {
    store.upsertServer.mockRejectedValueOnce(new Error('disk full'));
    const screen = renderScreen();
    await typeAndConnect(screen, 'jellyfin.example.com');

    expect(screen.getByTestId('add-server-error')).toHaveTextContent(
      'Something went wrong. Try again.',
    );
    expect(selectServer).not.toHaveBeenCalled();
  });

  it('disables Connect while connecting', async () => {
    const pending = deferred<DiscoveredServer>();
    discover.mockReturnValueOnce(pending.promise);
    const screen = renderScreen();
    await typeAndConnect(screen, 'jellyfin.example.com');

    expect(screen.getByText('Connecting…')).toBeTruthy();
    expect(
      screen.getByTestId('add-server-connect').props.accessibilityState,
    ).toMatchObject({disabled: true});
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-server-connect'));
      fireEvent(screen.getByTestId('add-server-input'), 'submitEditing', {
        nativeEvent: {text: 'jellyfin.example.com'},
      });
    });
    expect(discover).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve(found));
    expect(screen.queryByText('Connecting…')).toBeNull();
    expect(selectServer).toHaveBeenCalledWith('srv9');
  });

  it('enables Connect again after a failed attempt', async () => {
    discover.mockRejectedValueOnce(new Error('boom'));
    const screen = renderScreen();
    const connectButton = () => screen.getByTestId('add-server-connect');
    expect(connectButton().props.accessibilityState).toMatchObject({
      disabled: false,
    });

    await typeAndConnect(screen, 'jellyfin.example.com');
    expect(connectButton().props.accessibilityState).toMatchObject({
      disabled: false,
    });

    await act(async () => {
      fireEvent.press(connectButton());
    });
    expect(discover).toHaveBeenCalledTimes(2);
  });

  it('titles the TV keyboard "Server address"', () => {
    const screen = renderScreen();
    expect(screen.getByTestId('add-server-input').props.auxOptions).toBe(
      'title:Server address',
    );
  });

  it('connects from the keyboard Go key', async () => {
    const screen = renderScreen();
    const input = screen.getByTestId('add-server-input');
    fireEvent.changeText(input, 'jellyfin.example.com');
    await act(async () => {
      fireEvent(input, 'submitEditing', {nativeEvent: {submitAction: 'go'}});
    });

    expect(discover).toHaveBeenCalledWith('jellyfin.example.com');
    expect(selectServer).toHaveBeenCalledWith('srv9');
  });

  it('ignores other keyboard actions', async () => {
    const screen = renderScreen();
    const input = screen.getByTestId('add-server-input');
    fireEvent.changeText(input, 'jellyfin.example.com');
    await act(async () => {
      fireEvent(input, 'submitEditing', {
        nativeEvent: {submitAction: 'show_password'},
      });
    });

    expect(discover).not.toHaveBeenCalled();
  });

  it('ignores a result that arrives after unmount', async () => {
    const pending = deferred<DiscoveredServer>();
    discover.mockReturnValueOnce(pending.promise);
    const screen = renderScreen();
    await typeAndConnect(screen, 'jellyfin.example.com');

    screen.unmount();
    await act(async () => pending.resolve(found));

    expect(store.upsertServer).not.toHaveBeenCalled();
    expect(selectServer).not.toHaveBeenCalled();
  });

  it('clears the error when the address changes', async () => {
    const screen = renderScreen();
    await typeAndConnect(screen, '');
    expect(screen.getByTestId('add-server-error')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('add-server-input'), 'j');
    expect(screen.queryByTestId('add-server-error')).toBeNull();
  });
});

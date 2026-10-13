import {act, fireEvent, render, screen} from '@testing-library/react-native';
import React from 'react';

import type {PublicUser, Session} from '../../src/auth/authService';
import type {
  SessionContextValue,
  SessionNotice,
} from '../../src/auth/SessionContext';
import {useSession} from '../../src/auth/SessionContext';
import {UserPickerScreen} from '../../src/screens/auth/UserPickerScreen';
import {colors, focus} from '../../src/theme';
import {
  HOME,
  fakeService,
  fakeStore,
  networkError,
  server,
  sessionFor,
  signedInState,
} from './fakes';

jest.mock('../../src/auth/SessionContext', () => ({
  useSession: jest.fn(),
}));

const PUBLIC: PublicUser[] = [
  {id: 'u4', name: 'Zed', hasPassword: true},
  {id: 'u2', name: 'guest', primaryImageTag: 'tag-2', hasPassword: false},
  {id: 'u3', name: 'alice', primaryImageTag: 'tag-3', hasPassword: true},
];

let session: jest.Mocked<
  Pick<SessionContextValue, 'signIn' | 'retry'> & {notice?: SessionNotice}
>;
let service: ReturnType<typeof fakeService>;
let navigation: {navigate: jest.Mock};

const renderPicker = async (state = signedInState()) => {
  const store = fakeStore(state);
  render(
    <UserPickerScreen
      {...({
        route: {
          key: 'UserPicker',
          name: 'UserPicker',
          params: {serverId: 'srv1'},
        },
        navigation,
      } as any)}
      authService={service}
      authStore={store}
    />,
  );
  // Let the server and the public users load.
  await act(async () => {});
  return store;
};

const tileIds = () =>
  screen
    .getAllByTestId(/^user-tile-\w+$/)
    .map((tile) => tile.props.testID.replace('user-tile-', ''));

type Node = ReturnType<typeof screen.getByTestId>;

/** Host views inside a node, depth first. */
const hostViews = (node: Node): Node[] =>
  node.children.flatMap((child) =>
    typeof child === 'string'
      ? []
      : [
          ...(String(child.type) === 'View' ? [child] : []),
          ...hostViews(child),
        ],
  );

// The Vega Jest preset's StyleSheet.flatten mock returns arrays untouched,
// so flatten by hand.
const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const tileViewStyles = (id: string) =>
  hostViews(screen.getByTestId(`user-tile-${id}`)).map((view) =>
    flatStyle(view.props.style),
  );

const isVisible = (color: unknown) =>
  color !== undefined && color !== colors.transparent;

/** Views of a tile that draw a coloured border. */
const rings = (id: string) =>
  tileViewStyles(id).filter(
    (style) => Number(style.borderWidth) > 0 && isVisible(style.borderColor),
  );

beforeEach(() => {
  session = {signIn: jest.fn(), retry: jest.fn(), notice: undefined};
  (useSession as jest.Mock).mockImplementation(() => session);
  service = fakeService();
  service.getPublicUsers.mockResolvedValue(PUBLIC);
  navigation = {navigate: jest.fn()};
});

describe('UserPickerScreen', () => {
  it('shows the server name and address', async () => {
    await renderPicker();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText(HOME.address)).toBeTruthy();
  });

  it('shows a spinner while the users load', async () => {
    service.getPublicUsers.mockReturnValue(new Promise(() => {}));
    await renderPicker();
    expect(screen.getByTestId('user-picker-loading')).toBeTruthy();
    expect(screen.queryByTestId(/^user-tile-/)).toBeNull();
  });

  it('merges saved and public users without duplicates, in order', async () => {
    const state = signedInState();
    state.servers.srv1.users.u5 = {id: 'u5', name: 'kid', lastUsed: 3};
    await renderPicker(state);

    expect(service.getPublicUsers).toHaveBeenCalledWith('srv1');
    // Saved by lastUsed (u5, u1, u2), then the public-only ones by name.
    expect(tileIds()).toEqual(['u5', 'u1', 'u2', 'u3', 'u4']);
    expect(screen.queryByTestId('user-picker-users-error')).toBeNull();
  });

  it('still shows the saved users when the public users fail', async () => {
    service.getPublicUsers.mockRejectedValue(networkError());
    await renderPicker();

    expect(tileIds()).toEqual(['u1', 'u2']);
    expect(screen.getByTestId('user-picker-users-error')).toHaveTextContent(
      "Couldn't load the server's users.",
    );
  });

  it('gives the first tile the initial focus', async () => {
    await renderPicker();
    expect(screen.getByTestId('user-tile-u1').props.hasTVPreferredFocus).toBe(
      true,
    );
    expect(
      screen.getByTestId('user-tile-u2').props.hasTVPreferredFocus,
    ).toBeFalsy();
  });

  it('signs in with a saved token', async () => {
    const restored = sessionFor();
    service.restoreSession.mockResolvedValue(restored);
    await renderPicker();

    await act(async () => {
      fireEvent.press(screen.getByTestId('user-tile-u1'));
    });

    expect(service.restoreSession).toHaveBeenCalledWith('srv1', 'u1');
    expect(session.signIn).toHaveBeenCalledWith(restored);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('goes to Quick Connect when the saved token expired', async () => {
    service.restoreSession.mockResolvedValue(undefined);
    await renderPicker();

    await act(async () => {
      fireEvent.press(screen.getByTestId('user-tile-u1'));
    });

    expect(session.signIn).not.toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('QuickConnect', {
      serverId: 'srv1',
      userId: 'u1',
    });

    // The token is gone, so the next press skips restoreSession.
    await act(async () => {
      fireEvent.press(screen.getByTestId('user-tile-u1'));
    });
    expect(service.restoreSession).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledTimes(2);
  });

  it('shows an inline message when the server is unreachable', async () => {
    service.restoreSession.mockRejectedValue(networkError());
    await renderPicker();

    await act(async () => {
      fireEvent.press(screen.getByTestId('user-tile-u1'));
    });

    expect(screen.getByTestId('user-picker-error')).toHaveTextContent(
      "Can't reach Home.",
    );
    expect(session.signIn).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('user-tile-u1-busy')).toBeNull();
  });

  it('goes to Quick Connect for a user without a token', async () => {
    await renderPicker();

    await act(async () => {
      fireEvent.press(screen.getByTestId('user-tile-u3'));
    });

    expect(service.restoreSession).not.toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('QuickConnect', {
      serverId: 'srv1',
      userId: 'u3',
    });
  });

  it('ignores presses while a sign-in is running', async () => {
    let resolve: (value: Session | undefined) => void = () => {};
    service.restoreSession.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await renderPicker();

    await act(async () => {
      fireEvent.press(screen.getByTestId('user-tile-u1'));
      fireEvent.press(screen.getByTestId('user-tile-u1'));
    });
    expect(screen.getByTestId('user-tile-u1-busy')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('user-tile-u3'));
    });
    expect(service.restoreSession).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();

    const restored = sessionFor();
    await act(async () => resolve(restored));
    expect(session.signIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('user-tile-u1-busy')).toBeNull();
  });

  it('opens Password from Add user and AddServer from Change server', async () => {
    await renderPicker();

    fireEvent.press(screen.getByTestId('user-picker-add-user'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Password', {
      serverId: 'srv1',
    });

    fireEvent.press(screen.getByTestId('user-picker-change-server'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('AddServer');
  });

  it('focuses Add user when there are no users', async () => {
    service.getPublicUsers.mockResolvedValue([]);
    await renderPicker({
      ...signedInState(),
      servers: {srv1: server('srv1', 'Home', 1)},
    });

    expect(screen.queryByTestId(/^user-tile-/)).toBeNull();
    expect(
      screen.getByTestId('user-picker-add-user').props.hasTVPreferredFocus,
    ).toBe(true);
  });

  it('shows the expired notice without Retry', async () => {
    session.notice = {kind: 'expired', message: 'Your login expired.'};
    await renderPicker();

    expect(screen.getByTestId('user-picker-notice')).toHaveTextContent(
      'Your login expired.',
    );
    expect(screen.queryByTestId('user-picker-retry')).toBeNull();
    expect(screen.getByTestId('user-tile-u1').props.hasTVPreferredFocus).toBe(
      true,
    );
  });

  it('shows the offline notice with a focused Retry', async () => {
    session.notice = {kind: 'offline', message: "Can't reach Home."};
    await renderPicker();

    expect(screen.getByTestId('user-picker-notice')).toHaveTextContent(
      /^Can't reach Home\./,
    );
    const retry = screen.getByTestId('user-picker-retry');
    expect(retry.props.hasTVPreferredFocus).toBe(true);
    expect(
      screen.getByTestId('user-tile-u1').props.hasTVPreferredFocus,
    ).toBeFalsy();

    fireEvent.press(retry);
    expect(session.retry).toHaveBeenCalled();
  });

  it('shows no notice when there is none', async () => {
    await renderPicker();
    expect(screen.queryByTestId('user-picker-notice')).toBeNull();
  });

  it('builds avatar URLs from the tag and the saved token', async () => {
    await renderPicker();

    // Saved token, no tag: requested with the token.
    expect(screen.getByTestId('user-tile-u1-image').props.source.uri).toBe(
      `${HOME.address}/Users/u1/Images/Primary?maxHeight=180&quality=90&ApiKey=token-1`,
    );
    // Tag, no token: requested without one.
    expect(screen.getByTestId('user-tile-u2-image').props.source.uri).toBe(
      `${HOME.address}/Users/u2/Images/Primary?maxHeight=180&quality=90&tag=tag-2`,
    );
    // Neither: initials straight away.
    expect(screen.queryByTestId('user-tile-u4-image')).toBeNull();
    expect(screen.getByTestId('user-tile-u4-initials')).toHaveTextContent('Z');
  });

  it('falls back to the initials when the avatar fails', async () => {
    await renderPicker();

    await act(async () => {
      fireEvent(screen.getByTestId('user-tile-u3-image'), 'error');
    });

    expect(screen.queryByTestId('user-tile-u3-image')).toBeNull();
    expect(screen.getByTestId('user-tile-u3-initials')).toHaveTextContent('A');
  });

  it('draws no ring or background around unfocused avatars', async () => {
    await renderPicker();

    // u1, u2 and u3 show an image; none of their views may paint a colour
    // around it, or it shows through the transparent focus border as a ring.
    for (const id of ['u1', 'u2', 'u3']) {
      for (const style of tileViewStyles(id)) {
        expect(isVisible(style.backgroundColor)).toBe(false);
        expect(isVisible(style.borderColor)).toBe(false);
      }
    }
    // u4 shows initials: the coloured circle sits inside the ring's box,
    // not under the ring's border.
    const bordered = tileViewStyles('u4').filter(
      (style) => Number(style.borderWidth) > 0,
    );
    expect(bordered.length).toBeGreaterThan(0);
    for (const style of bordered) {
      expect(isVisible(style.backgroundColor)).toBe(false);
      expect(isVisible(style.borderColor)).toBe(false);
    }
  });

  it('rings and scales only the focused tile', async () => {
    await renderPicker();

    fireEvent(screen.getByTestId('user-tile-u2'), 'focus');

    const focused = rings('u2');
    expect(focused).toHaveLength(1);
    expect(focused[0]).toMatchObject({
      borderColor: colors.focus,
      transform: [{scale: focus.scale}],
    });
    for (const id of ['u1', 'u3', 'u4']) {
      expect(rings(id)).toHaveLength(0);
    }

    fireEvent(screen.getByTestId('user-tile-u2'), 'blur');
    expect(rings('u2')).toHaveLength(0);
  });

  it('truncates long names to one line', async () => {
    const longName = 'Maria Joaquina de Albuquerque Sousa e Vasconcelos';
    service.getPublicUsers.mockResolvedValue([
      {id: 'u9', name: longName, hasPassword: true},
    ]);
    await renderPicker();

    const name = screen.getByTestId('user-tile-u9-name');
    expect(name).toHaveTextContent(longName);
    expect(name.props.numberOfLines).toBe(1);
    expect(name.props.ellipsizeMode).toBe('tail');
    expect(screen.getByTestId('user-tile-u9-initials')).toHaveTextContent('MJ');
  });
});

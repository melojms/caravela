import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {getAuthService} from './authService';
import type {AuthService, Session} from './authService';
import {getAuthStore} from './store';
import type {AuthState, AuthStore, StoredServer} from './store';

export type SessionStatus =
  | 'loading'
  | 'error'
  | 'signedIn'
  | 'needsServer'
  | 'needsUser';

export interface SessionNotice {
  kind: 'expired' | 'offline';
  message: string;
}

export interface SessionState {
  status: SessionStatus;
  session?: Session;
  /** The server the user picker should show. */
  serverId?: string;
  notice?: SessionNotice;
  /** Set with status `error`, when the saved logins couldn't be read. */
  error?: string;
}

export interface SessionContextValue extends SessionState {
  signIn(session: Session): void;
  /**
   * Ends the session on the server, then shows the picker for that server.
   * The picker is shown even when logout fails; the error is rethrown.
   */
  signOut(): Promise<void>;
  /** Shows the picker for the current server and keeps the saved token. */
  switchUser(): void;
  /**
   * Ends a session the server rejected (a 401): shows the picker for that
   * server with the expired notice and drops the saved token, without logging
   * out. Only the first call per session does anything.
   */
  expireSession(): void;
  /** Runs the startup flow again, e.g. after the server was offline. */
  retry(): void;
  selectServer(serverId: string): void;
  /** Hides the notice, e.g. once the user moves to another screen. */
  clearNotice(): void;
}

const SessionContext = createContext<SessionContextValue | undefined>(
  undefined,
);

const expiredNotice = (userName: string): SessionNotice => ({
  kind: 'expired',
  message: `Your saved login for ${userName} has expired. Sign in again.`,
});

const mostRecentServer = (state: AuthState): StoredServer | undefined =>
  Object.values(state.servers).sort((a, b) => b.lastUsed - a.lastUsed)[0];

/** Works out where the app should start from the saved logins. */
export async function resolveStartup(
  service: AuthService,
  store: AuthStore,
): Promise<SessionState> {
  const state = await store.getState();
  const fallback =
    (state.lastServerId && state.servers[state.lastServerId]) ||
    mostRecentServer(state);
  if (!fallback) {
    return {status: 'needsServer'};
  }
  const picker: SessionState = {status: 'needsUser', serverId: fallback.id};

  const {autoLogin} = state;
  if (autoLogin.mode === 'disabled') {
    return picker;
  }
  const [serverId, userId] =
    autoLogin.mode === 'specificUser'
      ? [autoLogin.serverId, autoLogin.userId]
      : [state.lastServerId, state.lastUserId];
  const server = serverId ? state.servers[serverId] : undefined;
  const user = userId ? server?.users[userId] : undefined;
  if (!server || !user) {
    return picker;
  }
  const userPicker: SessionState = {status: 'needsUser', serverId: server.id};
  if (!user.accessToken) {
    return userPicker;
  }

  try {
    const session = await service.restoreSession(server.id, user.id);
    if (session) {
      return {status: 'signedIn', session, serverId: server.id};
    }
    return {...userPicker, notice: expiredNotice(user.name)};
  } catch {
    return {
      ...userPicker,
      notice: {kind: 'offline', message: `Can't reach ${server.name}.`},
    };
  }
}

type SessionProviderProps = {
  children: ReactNode;
  authService?: AuthService;
  authStore?: AuthStore;
};

export const SessionProvider = ({
  children,
  authService,
  authStore,
}: SessionProviderProps) => {
  const service = useMemo(() => authService ?? getAuthService(), [authService]);
  const store = useMemo(() => authStore ?? getAuthStore(), [authStore]);
  const [state, setState] = useState<SessionState>({status: 'loading'});
  // Bumped by every state change so a stale startup can't overwrite it.
  const generation = useRef(0);

  const update = useCallback((next: SessionState) => {
    generation.current += 1;
    setState(next);
  }, []);

  const startup = useCallback(() => {
    update({status: 'loading'});
    const run = generation.current;
    resolveStartup(service, store)
      .catch(
        (): SessionState => ({
          status: 'error',
          error: "Couldn't load saved logins.",
        }),
      )
      .then((next) => {
        if (generation.current === run) {
          update(next);
        }
      });
  }, [service, store, update]);

  useEffect(() => {
    startup();
    return () => {
      // Drops the result of a startup that finishes after unmount.
      generation.current += 1;
    };
  }, [startup]);

  const sessionRef = useRef(state.session);
  sessionRef.current = state.session;

  const signIn = useCallback(
    (session: Session) =>
      update({status: 'signedIn', session, serverId: session.server.id}),
    [update],
  );

  const signOut = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    try {
      await service.logout(session);
    } finally {
      update({status: 'needsUser', serverId: session.server.id});
    }
  }, [service, update]);

  const switchUser = useCallback(() => {
    const session = sessionRef.current;
    update({status: 'needsUser', serverId: session?.server.id});
  }, [update]);

  const expireSession = useCallback(() => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    // Cleared now, not on the next render, so queries failing together only
    // expire the session once.
    sessionRef.current = undefined;
    update({
      status: 'needsUser',
      serverId: session.server.id,
      notice: expiredNotice(session.user.Name),
    });
    // The store queues this write before any later read, so the next startup
    // or picker sees the token gone. Nothing to show if it fails.
    store.clearToken(session.server.id, session.user.Id).catch(() => undefined);
  }, [store, update]);

  const selectServer = useCallback(
    (serverId: string) => update({status: 'needsUser', serverId}),
    [update],
  );

  // Not via update(): hiding the notice must not drop a pending startup.
  const clearNotice = useCallback(
    () =>
      setState((current) =>
        current.notice ? {...current, notice: undefined} : current,
      ),
    [],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      signIn,
      signOut,
      switchUser,
      expireSession,
      retry: startup,
      selectServer,
      clearNotice,
    }),
    [
      state,
      signIn,
      signOut,
      switchUser,
      expireSession,
      startup,
      selectServer,
      clearNotice,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
};

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside a SessionProvider.');
  }
  return value;
}

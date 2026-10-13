import {
  focusManager,
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import React, {ReactNode, useEffect, useMemo, useRef} from 'react';
import {AppState} from 'react-native';

import {useSession} from '../auth/SessionContext';
import {isUnauthorized} from './home';

const STALE_TIME_MS = 30 * 1000;

/**
 * Tells TanStack Query the app is focused while it is in the foreground, so
 * coming back from the background refetches the stale queries on screen (and
 * on the screens under it). focusManager is global: call this once. Returns
 * a function that stops listening.
 */
export const listenToAppState = () => {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) =>
      handleFocus(state === 'active'),
    );
    return () => subscription.remove();
  });
  return () => {
    focusManager.setEventListener(() => undefined);
    focusManager.setFocused(undefined);
  };
};

/**
 * Retries a failed query once, except on a 401: the token is gone, so the
 * first 401 from any query or mutation calls `onUnauthorized` (once per
 * client) instead. Stale queries refetch when the app returns to the
 * foreground (see `listenToAppState`); screens also refetch when they regain
 * focus.
 */
export const createQueryClient = (onUnauthorized?: () => void) => {
  let expired = false;
  const onError = (error: unknown) => {
    if (!expired && isUnauthorized(error)) {
      expired = true;
      onUnauthorized?.();
    }
  };
  return new QueryClient({
    queryCache: new QueryCache({onError}),
    mutationCache: new MutationCache({onError}),
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        retry: (failureCount, error) =>
          !isUnauthorized(error) && failureCount < 1,
      },
    },
  });
};

type SessionQueryClientProviderProps = {
  children: ReactNode;
};

/**
 * Gives each signed-in server and user its own QueryClient, so one user's
 * data never shows for another. Signing out, switching user or server makes
 * a new, empty client and remounts the children (useQuery keeps the client it
 * was first rendered with); the old client is cleared. A 401 expires the
 * session, unless it comes from an old client after the scope moved on.
 */
export const SessionQueryClientProvider = ({
  children,
}: SessionQueryClientProviderProps) => {
  const {status, session, expireSession} = useSession();
  // Once for the app's life; it outlives the per-scope clients below.
  useEffect(listenToAppState, []);
  const scope =
    status === 'signedIn' && session
      ? `${session.server.id}:${session.user.Id}`
      : '';
  // Read through refs, so the client only changes with the scope.
  const expireRef = useRef(expireSession);
  expireRef.current = expireSession;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  // A new scope means a new client.
  const client = useMemo(
    () =>
      createQueryClient(() => {
        if (scope && scopeRef.current === scope) {
          expireRef.current();
        }
      }),
    [scope],
  );
  // Cleared on the next tick: React runs this cleanup before the children's
  // queries unsubscribe, and each unsubscribe starts a garbage-collection
  // timer that clear() then cancels.
  useEffect(
    () => () => {
      setTimeout(() => client.clear(), 0);
    },
    [client],
  );
  return (
    <QueryClientProvider key={scope} client={client}>
      {children}
    </QueryClientProvider>
  );
};

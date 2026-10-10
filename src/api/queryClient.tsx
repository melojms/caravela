import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import React, {ReactNode, useEffect, useMemo, useRef} from 'react';

import {useSession} from '../auth/SessionContext';
import {isUnauthorized} from './home';

const STALE_TIME_MS = 30 * 1000;

/**
 * Retries a failed query once, except on a 401: the token is gone, so the
 * first 401 from any query or mutation calls `onUnauthorized` (once per
 * client) instead. There is no window to refocus on a TV; screens refetch
 * when they regain focus.
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
        refetchOnWindowFocus: false,
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

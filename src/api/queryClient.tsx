import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import React, {ReactNode, useEffect, useMemo} from 'react';

import {useSession} from '../auth/SessionContext';
import {isUnauthorized} from './home';

const STALE_TIME_MS = 30 * 1000;

/**
 * Retries a failed query once, except on a 401: the token is gone, so the
 * screen sends the user to the picker instead. There is no window to refocus
 * on a TV; screens refetch when they regain focus.
 */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        retry: (failureCount, error) =>
          !isUnauthorized(error) && failureCount < 1,
        refetchOnWindowFocus: false,
      },
    },
  });

type SessionQueryClientProviderProps = {
  children: ReactNode;
};

/**
 * Gives each signed-in server and user its own QueryClient, so one user's
 * data never shows for another. Signing out, switching user or server makes
 * a new, empty client and remounts the children (useQuery keeps the client it
 * was first rendered with); the old client is cleared.
 */
export const SessionQueryClientProvider = ({
  children,
}: SessionQueryClientProviderProps) => {
  const {status, session} = useSession();
  const scope =
    status === 'signedIn' && session
      ? `${session.server.id}:${session.user.Id}`
      : '';
  // A new scope means a new client.
  const client = useMemo(createQueryClient, [scope]);
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

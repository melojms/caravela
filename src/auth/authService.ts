import type {Api} from '@jellyfin/sdk';
import {getAuthenticationApi} from '@jellyfin/sdk/lib/utils/api/authentication-api';
import {getSessionApi} from '@jellyfin/sdk/lib/utils/api/session-api';
import {getUserApi} from '@jellyfin/sdk/lib/utils/api/user-api';
import type {AuthenticationResult} from '@jellyfin/sdk/lib/generated-client/models/authentication-result';
import type {UserDto} from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import {isAxiosError} from 'axios';

import {createApi as defaultCreateApi} from '../api/client';
import {getAuthStore} from './store';
import type {AuthStore, StoredServer} from './store';

export interface Session {
  server: StoredServer;
  user: UserDto & {Id: string; Name: string};
  accessToken: string;
  api: Api;
}

export type AuthErrorCode =
  | 'invalid-credentials'
  | 'quick-connect-disabled'
  | 'quick-connect-timeout'
  | 'quick-connect-cancelled'
  | 'unknown-server'
  | 'bad-response';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/** A user the server lists on its login screen. */
export interface PublicUser {
  id: string;
  name: string;
  primaryImageTag?: string;
  hasPassword: boolean;
}

export interface UserImageOptions {
  /** The image tag from the server; it busts the cache when the image changes. */
  tag?: string;
  /** A saved token, for servers that hide images from anonymous requests. */
  accessToken?: string;
  maxHeight: number;
}

/** URL of a user's primary image (avatar). */
export function getUserImageUrl(
  server: Pick<StoredServer, 'address'>,
  userId: string,
  {tag, accessToken, maxHeight}: UserImageOptions,
): string {
  let url =
    `${server.address}/Users/${encodeURIComponent(userId)}/Images/Primary` +
    `?maxHeight=${Math.round(maxHeight)}&quality=90`;
  if (tag) {
    url += `&tag=${encodeURIComponent(tag)}`;
  }
  if (accessToken) {
    url += `&api_key=${encodeURIComponent(accessToken)}`;
  }
  return url;
}

export interface QuickConnectOptions {
  /** How often to ask the server whether the code was approved. */
  pollIntervalMs?: number;
  /** Give up after this long; the server expires codes after 10 minutes. */
  timeoutMs?: number;
}

export interface QuickConnectAttempt {
  /** Code the user enters in another Jellyfin client. */
  code: string;
  /** Resolves with the new session once approved. */
  session: Promise<Session>;
  /** Stops polling; `session` rejects with `quick-connect-cancelled`. */
  cancel(): void;
}

export interface AuthService {
  loginWithPassword(
    serverId: string,
    username: string,
    password: string,
  ): Promise<Session>;
  startQuickConnect(
    serverId: string,
    options?: QuickConnectOptions,
  ): Promise<QuickConnectAttempt>;
  /** Ends the server session (best effort) and forgets the local token. */
  logout(session: Session): Promise<void>;
  /**
   * Checks a saved token with `getCurrentUser`. Returns the session, or
   * `undefined` when there is no token or the server rejected it (401), in
   * which case the token is cleared. Network errors are rethrown.
   */
  restoreSession(
    serverId: string,
    userId: string,
  ): Promise<Session | undefined>;
  /**
   * The users the server shows on its login screen, fetched without a token.
   * Entries without an ID or name are skipped. Network errors are rethrown.
   */
  getPublicUsers(serverId: string): Promise<PublicUser[]>;
}

export interface AuthServiceDeps {
  store?: AuthStore;
  createApi?: (serverUrl: string, accessToken?: string) => Promise<Api>;
}

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_QUICK_CONNECT_TIMEOUT_MS = 5 * 60 * 1000;

const httpStatus = (error: unknown) =>
  isAxiosError(error) ? error.response?.status : undefined;

export function createAuthService({
  store = getAuthStore(),
  createApi = defaultCreateApi,
}: AuthServiceDeps = {}): AuthService {
  const requireServer = async (serverId: string) => {
    const server = await store.getServer(serverId);
    if (!server) {
      throw new AuthError('unknown-server', `Unknown server ${serverId}.`);
    }
    return server;
  };

  const completeLogin = async (
    server: StoredServer,
    result: AuthenticationResult,
  ): Promise<Session> => {
    const token = result.AccessToken;
    const user = result.User;
    if (!token || !user?.Id || !user.Name) {
      throw new AuthError(
        'bad-response',
        'The server sent an incomplete login response.',
      );
    }
    await store.saveLogin(server.id, {id: user.Id, name: user.Name}, token);
    return {
      server,
      user: {...user, Id: user.Id, Name: user.Name},
      accessToken: token,
      api: await createApi(server.address, token),
    };
  };

  return {
    async loginWithPassword(serverId, username, password) {
      const server = await requireServer(serverId);
      const api = await createApi(server.address);
      try {
        const {data} = await getAuthenticationApi(api).authenticateUserByName({
          authenticateUserByName: {Username: username, Pw: password},
        });
        return await completeLogin(server, data);
      } catch (error) {
        if (httpStatus(error) === 401) {
          throw new AuthError(
            'invalid-credentials',
            'Wrong username or password.',
          );
        }
        throw error;
      }
    },

    async startQuickConnect(serverId, options = {}) {
      const {
        pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
        timeoutMs = DEFAULT_QUICK_CONNECT_TIMEOUT_MS,
      } = options;
      const server = await requireServer(serverId);
      const api = await createApi(server.address);
      const authentication = getAuthenticationApi(api);

      let initiated;
      try {
        ({data: initiated} = await authentication.initiateQuickConnect());
      } catch (error) {
        if (httpStatus(error) === 401) {
          throw new AuthError(
            'quick-connect-disabled',
            'Quick Connect is turned off on this server.',
          );
        }
        throw error;
      }
      const {Code: code, Secret: secret} = initiated;
      if (!code || !secret) {
        throw new AuthError(
          'bad-response',
          'The server did not return a Quick Connect code.',
        );
      }

      let settled = false;
      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      let rejectSession: (error: Error) => void = () => {};

      const stop = () => {
        settled = true;
        if (pollTimer !== undefined) {
          clearTimeout(pollTimer);
        }
        if (timeoutTimer !== undefined) {
          clearTimeout(timeoutTimer);
        }
      };

      const session = new Promise<Session>((resolve, reject) => {
        rejectSession = (error) => {
          if (!settled) {
            stop();
            reject(error);
          }
        };

        const poll = async () => {
          try {
            let authenticated = false;
            try {
              const {data} = await authentication.getQuickConnectState({
                secret,
              });
              authenticated = data.Authenticated === true;
            } catch (error) {
              // Retry network blips; an HTTP error means the code is gone.
              if (httpStatus(error) !== undefined) {
                throw error;
              }
            }
            if (settled) {
              return;
            }
            if (!authenticated) {
              pollTimer = setTimeout(poll, pollIntervalMs);
              return;
            }
            const {data: result} =
              await authentication.authenticateWithQuickConnect({
                quickConnectDto: {Secret: secret},
              });
            if (settled) {
              return;
            }
            const newSession = await completeLogin(server, result);
            stop();
            resolve(newSession);
          } catch (error) {
            rejectSession(error as Error);
          }
        };

        timeoutTimer = setTimeout(
          () =>
            rejectSession(
              new AuthError(
                'quick-connect-timeout',
                'The Quick Connect code expired.',
              ),
            ),
          timeoutMs,
        );
        pollTimer = setTimeout(poll, pollIntervalMs);
      });

      return {
        code,
        session,
        cancel: () =>
          rejectSession(
            new AuthError(
              'quick-connect-cancelled',
              'Quick Connect was cancelled.',
            ),
          ),
      };
    },

    async logout(session) {
      try {
        await getSessionApi(session.api).reportSessionEnded();
      } catch {
        // The token is dropped locally either way.
      }
      await store.clearToken(session.server.id, session.user.Id);
    },

    async restoreSession(serverId, userId) {
      const server = await store.getServer(serverId);
      const token = await store.getToken(serverId, userId);
      if (!server || !token) {
        return undefined;
      }
      const api = await createApi(server.address, token);
      try {
        const {data: user} = await getUserApi(api).getCurrentUser();
        if (!user.Id || !user.Name) {
          throw new AuthError(
            'bad-response',
            'The server sent an incomplete user.',
          );
        }
        return {
          server,
          user: {...user, Id: user.Id, Name: user.Name},
          accessToken: token,
          api,
        };
      } catch (error) {
        if (httpStatus(error) === 401) {
          await store.clearToken(serverId, userId);
          return undefined;
        }
        throw error;
      }
    },

    async getPublicUsers(serverId) {
      const server = await requireServer(serverId);
      const api = await createApi(server.address);
      const {data} = await getUserApi(api).getPublicUsers();
      return data.flatMap((user) =>
        user.Id && user.Name
          ? [
              {
                id: user.Id,
                name: user.Name,
                primaryImageTag: user.PrimaryImageTag ?? undefined,
                hasPassword: user.HasPassword ?? true,
              },
            ]
          : [],
      );
    },
  };
}

let defaultService: AuthService | undefined;

export function getAuthService(): AuthService {
  defaultService ??= createAuthService();
  return defaultService;
}

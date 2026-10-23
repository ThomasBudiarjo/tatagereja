import {
  CSRF_HEADER,
  apiErrorSchema,
  authResponseSchema,
  currentSessionSchema,
  type ErrorCode,
  type ValidationIssue,
} from '@tatagereja/shared';
import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import type { z } from 'zod';
import { currentLocale, t, type MessageKey } from '@/lib/i18n';
import {
  forgetSession,
  memoryCredentials,
  sessionOf,
  setMemoryCredentials,
  signOutLocally,
  storeSession,
  useAuthStore,
} from '@/stores/auth';
import { useServerStore } from '@/stores/server';

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'INVALID_RESPONSE' | 'UNKNOWN';

export class ApiClientError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly issues: ValidationIssue[];

  constructor(
    code: ClientErrorCode,
    message: string,
    status: number,
    issues: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.issues = issues;
  }
}

export const isApiClientError = (error: unknown): error is ApiClientError =>
  error instanceof ApiClientError;

/** Codes whose message is the same whatever the request, so the interface translates them. */
const GENERIC_MESSAGES: Partial<Record<ClientErrorCode, MessageKey>> = {
  NETWORK: 'common.errorNetwork',
  INVALID_RESPONSE: 'common.errorInvalidResponse',
  UNKNOWN: 'common.errorUnknown',
  UNAUTHORIZED: 'common.errorUnauthorized',
  RATE_LIMITED: 'common.errorRateLimited',
  MODULE_DISABLED: 'common.errorModuleDisabled',
  MEMBERSHIP_SUSPENDED: 'common.errorSuspended',
  PAYLOAD_TOO_LARGE: 'common.errorPayloadTooLarge',
  INTERNAL: 'common.errorInternal',
};

/** Server messages are English sentences; these get a translated generic message instead. */
const TRANSLATED_IN_INDONESIAN: Partial<Record<ClientErrorCode, MessageKey>> = {
  FORBIDDEN: 'common.errorForbidden',
  NOT_FOUND: 'common.errorNotFound',
};

/**
 * A message for an error, in the interface language where the server message is generic.
 * Specific server messages (validation, conflicts) are shown as sent.
 */
export const getErrorMessage = (error: unknown, fallback?: string): string => {
  if (isApiClientError(error)) {
    const generic = GENERIC_MESSAGES[error.code];
    if (generic) return t(generic);
    const indonesian = TRANSLATED_IN_INDONESIAN[error.code];
    if (indonesian && currentLocale() === 'id') return t(indonesian);
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback ?? t('common.errorUnknown');
};

export const api = axios.create({ timeout: 20_000 });

/** Requests that start a session (or need none): no credentials are added or renewed. */
const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/password-reset'];
const isPublicPath = (url: string) => PUBLIC_PATHS.some((path) => url.startsWith(path));
const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

/** Runs `task` while holding a lock shared by every tab of this origin (when supported). */
const withTabLock = <T>(name: string, task: () => Promise<T>): Promise<T> =>
  typeof navigator !== 'undefined' && navigator.locks
    ? (navigator.locks.request(name, task) as Promise<T>)
    : task();

const refreshing = new Map<string, Promise<string | undefined>>();

/**
 * A fresh access token for a bearer session, exchanging the refresh token when the one in
 * memory is missing, about to expire or was refused (`stale`). One exchange at a time across
 * tabs: the server ends the whole session if a refresh token is ever used twice.
 */
export function refreshAccessToken(serverUrl: string, stale?: string): Promise<string | undefined> {
  const running = refreshing.get(serverUrl);
  if (running) return running;
  const usable = () => {
    const { accessToken, accessExpiresAt } = memoryCredentials(serverUrl);
    return accessToken && accessToken !== stale && (accessExpiresAt ?? 0) - 30_000 > Date.now()
      ? accessToken
      : undefined;
  };
  const run = withTabLock(`tatagereja.refresh:${serverUrl}`, async () => {
    const known = sessionOf(serverUrl)?.refreshToken;
    // Another tab may have refreshed while this one waited for the lock.
    await useAuthStore.persist.rehydrate();
    const session = sessionOf(serverUrl);
    if (session?.refreshToken && session.refreshToken !== known) {
      for (let attempt = 0; attempt < 10 && !usable(); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    const ready = usable();
    if (ready) return ready;
    if (!session?.refreshToken) return undefined;
    try {
      const response = await axios.post<unknown>(
        `${serverUrl}/api/auth/refresh`,
        { refreshToken: session.refreshToken },
        { timeout: 20_000 },
      );
      const parsed = authResponseSchema.safeParse(response.data);
      if (!parsed.success) return undefined;
      storeSession(serverUrl, parsed.data);
      return parsed.data.token ?? undefined;
    } catch (error) {
      // Refused (expired, revoked, reused): the session is over. Offline: try again later.
      if (axios.isAxiosError(error) && error.response?.status === 401) forgetSession(serverUrl);
      return undefined;
    }
  }).finally(() => refreshing.delete(serverUrl));
  refreshing.set(serverUrl, run);
  return run;
}

/** The CSRF token of a cookie session, asked from the server once per page load. */
async function csrfTokenFor(serverUrl: string): Promise<string | undefined> {
  const known = memoryCredentials(serverUrl).csrfToken;
  if (known) return known;
  try {
    const response = await axios.get<unknown>(`${serverUrl}/api/auth/session`, {
      timeout: 20_000,
    });
    const parsed = currentSessionSchema.safeParse(response.data);
    if (!parsed.success || !parsed.data.csrfToken) return undefined;
    setMemoryCredentials(serverUrl, { csrfToken: parsed.data.csrfToken });
    return parsed.data.csrfToken;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) forgetSession(serverUrl);
    return undefined;
  }
}

api.interceptors.request.use(async (config) => {
  const serverUrl = useServerStore.getState().currentUrl;
  config.baseURL = `${serverUrl}/api`;
  // Server-written text (notifications) comes back in the interface language.
  config.headers.set('Accept-Language', currentLocale());
  const session = sessionOf(serverUrl);
  if (!session || isPublicPath(config.url ?? '')) return config;
  if (session.transport === 'bearer') {
    const { accessToken, accessExpiresAt } = memoryCredentials(serverUrl);
    const token =
      accessToken && (accessExpiresAt ?? 0) - 30_000 > Date.now()
        ? accessToken
        : await refreshAccessToken(serverUrl);
    if (token && !config.headers.has('Authorization')) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
  } else if (UNSAFE_METHODS.has((config.method ?? 'get').toLowerCase())) {
    const csrf = await csrfTokenFor(serverUrl);
    if (csrf) config.headers.set(CSRF_HEADER, csrf);
  }
  return config;
});

/**
 * A 401 answering a request that re-confirms the password (change password, transfer
 * ownership, delete church) means a wrong password, not an ended session.
 */
const confirmsPassword = (data: unknown) =>
  typeof data === 'string' && /"(password|currentPassword)"\s*:/.test(data);

/** A request that may be sent again once with renewed credentials. */
async function retryWithFreshCredentials(config: RetriableConfig, code: string, status: number) {
  if (config._retried) return null;
  const serverUrl = useServerStore.getState().currentUrl;
  const session = sessionOf(serverUrl);
  if (!session) return null;
  if (status === 401 && session.transport === 'bearer' && code !== 'SESSION_REVOKED') {
    const used = config.headers
      .get('Authorization')
      ?.toString()
      .replace(/^Bearer /, '');
    const token = await refreshAccessToken(serverUrl, used);
    if (!token) return null;
    config.headers.set('Authorization', `Bearer ${token}`);
    return api.request({ ...config, _retried: true } as RetriableConfig);
  }
  if (status === 403 && code === 'CSRF_FAILED' && session.transport === 'cookie') {
    setMemoryCredentials(serverUrl, { csrfToken: undefined });
    config.headers.delete(CSRF_HEADER);
    return api.request({ ...config, _retried: true } as RetriableConfig);
  }
  return null;
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      const parsed = apiErrorSchema.safeParse(error.response?.data);
      if (parsed.success) {
        const config = error.config as RetriableConfig | undefined;
        const url = config?.url ?? '';
        const authFailure =
          status === 401 || (status === 403 && parsed.data.error.code === 'CSRF_FAILED');
        if (
          config &&
          authFailure &&
          !isPublicPath(url) &&
          !(status === 401 && confirmsPassword(config.data))
        ) {
          const retried = await retryWithFreshCredentials(config, parsed.data.error.code, status);
          if (retried) return retried;
          if (status === 401) signOutLocally();
        }
        throw new ApiClientError(
          parsed.data.error.code,
          parsed.data.error.message,
          status,
          parsed.data.error.issues ?? [],
        );
      }
      if (!error.response) {
        throw new ApiClientError(
          'NETWORK',
          'Could not reach the server. Check your connection.',
          0,
        );
      }
      throw new ApiClientError('UNKNOWN', `Unexpected server error (${status})`, status);
    }
    throw error;
  },
);

/** Performs a request and validates the response body against a schema. */
export async function request<T>(schema: z.ZodType<T>, config: AxiosRequestConfig): Promise<T> {
  const response = await api.request<unknown>(config);
  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    console.error(
      'Invalid API response for',
      config.method ?? 'GET',
      config.url,
      parsed.error.issues,
    );
    throw new ApiClientError(
      'INVALID_RESPONSE',
      'The server returned an unexpected response',
      response.status,
    );
  }
  return parsed.data;
}

/** Fetches server metadata from an arbitrary server URL (used before the server is selected). */
export async function probeServer<T>(serverUrl: string, schema: z.ZodType<T>): Promise<T> {
  const response = await axios.get<unknown>(`${serverUrl}/api/meta`, { timeout: 10_000 });
  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiClientError('INVALID_RESPONSE', 'This address is not a TataGereja server', 200);
  }
  return parsed.data;
}

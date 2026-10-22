import { apiErrorSchema, type ErrorCode, type ValidationIssue } from '@tatagereja/shared';
import axios, { type AxiosRequestConfig } from 'axios';
import type { z } from 'zod';
import { currentLocale, t, type MessageKey } from '@/lib/i18n';
import { currentToken, signOutLocally } from '@/stores/auth';
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

api.interceptors.request.use((config) => {
  const serverUrl = useServerStore.getState().currentUrl;
  config.baseURL = `${serverUrl}/api`;
  const token = currentToken();
  if (token && !config.headers.has('Authorization')) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

const PUBLIC_401_PATHS = ['/auth/login', '/auth/register'];

/**
 * A 401 answering a request that re-confirms the password (change password, transfer
 * ownership, delete church) means a wrong password, not an ended session.
 */
const confirmsPassword = (data: unknown) =>
  typeof data === 'string' && /"(password|currentPassword)"\s*:/.test(data);

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      const parsed = apiErrorSchema.safeParse(error.response?.data);
      if (parsed.success) {
        const url = error.config?.url ?? '';
        if (
          status === 401 &&
          !PUBLIC_401_PATHS.some((path) => url.includes(path)) &&
          !confirmsPassword(error.config?.data)
        ) {
          signOutLocally();
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

import { apiErrorSchema, type ErrorCode, type ValidationIssue } from '@tatagereja/shared';
import axios, { type AxiosRequestConfig } from 'axios';
import type { z } from 'zod';
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

export const getErrorMessage = (error: unknown, fallback = 'Something went wrong'): string => {
  if (isApiClientError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
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

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      const parsed = apiErrorSchema.safeParse(error.response?.data);
      if (parsed.success) {
        const url = error.config?.url ?? '';
        if (status === 401 && !PUBLIC_401_PATHS.some((path) => url.includes(path))) {
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

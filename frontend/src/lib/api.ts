import * as v from "valibot";

// ApiError carries the HTTP status and a human-readable message parsed from the
// server's {"error": "..."} body when present.
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// UnauthorizedError is thrown on 401 so callers (and TanStack Query) can treat
// "not logged in" distinctly from other failures.
export class UnauthorizedError extends ApiError {
  constructor(message = "unauthorized") {
    super(401, message);
    this.name = "UnauthorizedError";
  }
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

// apiFetch performs a same-origin JSON request with session cookies, maps error
// statuses to typed errors, and validates the success body with a Valibot
// schema. CSRF is handled by the server's CrossOriginProtection, so no token is
// sent.
export async function apiFetch<TSchema extends v.GenericSchema>(
  path: string,
  schema: TSchema,
  options: ApiRequestOptions = {},
): Promise<v.InferOutput<TSchema>> {
  const { method = "GET", body, signal } = options;

  const headers: Record<string, string> = {};
  let payload: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(path, {
    method,
    headers,
    body: payload,
    credentials: "include",
    signal,
  });

  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res));
  }

  const data = await res.json();
  return v.parse(schema, data);
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === "object" && "error" in data) {
      const { error } = data as { error?: unknown };
      if (typeof error === "string") {
        return error;
      }
    }
  } catch {
    // fall through to a generic message
  }
  return `request failed with status ${res.status}`;
}

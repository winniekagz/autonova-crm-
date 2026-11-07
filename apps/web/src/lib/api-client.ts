import type { ApiErrorBody, ApiErrorDetail } from '@autonova/contracts';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

/** Normalised API failure. Components branch on `code`, never on message text. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'string' &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

/** Turns any failed response into an ApiError. */
export async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (isErrorBody(body)) {
    return new ApiError(response.status, body.code, body.message, body.details ?? []);
  }
  return new ApiError(response.status, 'HTTP_ERROR', `Request failed (${response.status})`);
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

async function send(path: string, options: ApiRequestOptions): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
    );
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

/**
 * Every successful JSON response goes through a parser, so a server/contract mismatch fails loudly
 * here instead of surfacing as `undefined` deep inside a component.
 */
export async function apiRequest<T>(
  path: string,
  parse: (json: unknown) => T,
  options: ApiRequestOptions = {},
): Promise<T> {
  const response = await send(path, options);
  return parse(await response.json());
}

/** For endpoints that answer 204 No Content. */
export async function apiRequestVoid(path: string, options: ApiRequestOptions = {}): Promise<void> {
  await send(path, options);
}

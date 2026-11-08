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

/** Custom header the API requires on every cookie-authenticated request (CSRF defence, docs/06). */
export const CSRF_HEADER = 'x-autonova-csrf';

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  /**
   * Set only on calls that read or set the HttpOnly refresh cookie (login, refresh, logout,
   * revoking a session). Sends credentials cross-origin plus the CSRF header; every other request
   * is sent without cookies.
   */
  cookies?: boolean;
}

async function send(path: string, options: ApiRequestOptions): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(options.cookies ? { [CSRF_HEADER]: '1' } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      credentials: options.cookies ? 'include' : 'omit',
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

export interface UploadOptions {
  token: string;
  /** Called with 0..1 as bytes leave the browser. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Uploads a multipart form and reports progress. `fetch` cannot report upload progress, so this one
 * call uses XMLHttpRequest. Failures become the same ApiError as every other request, so retry and
 * message handling stay uniform.
 */
export function apiUpload<T>(
  path: string,
  form: FormData,
  parse: (json: unknown) => T,
  options: UploadOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_BASE_URL}/api/v1${path}`);
    request.setRequestHeader('authorization', `Bearer ${options.token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && options.onProgress)
        options.onProgress(event.loaded / event.total);
    };
    request.onerror = () =>
      reject(
        new ApiError(
          0,
          'NETWORK_ERROR',
          'Could not reach the server. Check your connection and try again.',
        ),
      );
    request.onabort = () =>
      reject(new ApiError(0, 'UPLOAD_CANCELLED', 'The upload was cancelled.'));
    request.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(request.responseText);
      } catch {
        body = undefined;
      }
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(parse(body));
        } catch (error) {
          reject(error);
        }
        return;
      }
      if (isErrorBody(body))
        reject(new ApiError(request.status, body.code, body.message, body.details ?? []));
      else reject(new ApiError(request.status, 'HTTP_ERROR', `Request failed (${request.status})`));
    };
    options.signal?.addEventListener('abort', () => request.abort(), { once: true });
    request.send(form);
  });
}

/** Downloads a file with the bearer token and returns it as a Blob (a plain link cannot send the token). */
export async function apiDownload(
  path: string,
  token: string,
): Promise<{ blob: Blob; fileName: string | null }> {
  const response = await send(path, { token });
  const disposition = response.headers.get('content-disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  let fileName: string | null = null;
  if (encoded) {
    try {
      fileName = decodeURIComponent(encoded);
    } catch {
      fileName = null;
    }
  }
  return { blob: await response.blob(), fileName };
}

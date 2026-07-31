import { API_URL } from './config';

export class ApiClientError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
  requestId?: string;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
  }
}

interface ErrorBody {
  message?: string | string[];
  error?: string;
  details?: unknown;
  requestId?: string;
  statusCode?: number;
}

function buildUrl(path: string): string {
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? ((await response.json()) as T | ErrorBody) : null;

  if (!response.ok) {
    const errorBody = body as ErrorBody | null;
    const message = errorBody?.message;
    const text = Array.isArray(message) ? message.join('\n') : (message ?? `Request failed with status ${response.status}`);
    const error = new ApiClientError(text, response.status);
    error.code = typeof message === 'string' ? message : errorBody?.error;
    error.details = errorBody?.details;
    error.requestId = errorBody?.requestId;
    throw error;
  }

  return body as T;
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const isAuthPath = path.startsWith('/auth/');
  const response = await fetch(buildUrl(path), {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401 && !isAuthPath && !retried) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      return apiFetch<T>(path, options, true);
    }
  }

  return parseResponse<T>(response);
}

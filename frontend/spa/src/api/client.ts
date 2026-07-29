const API_ROOT = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function getToken(): string | null {
  try {
    return localStorage.getItem('token') || localStorage.getItem('access_token');
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, headers: extraHeaders, ...rest } = options;
  const headers = new Headers(extraHeaders || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  if (!skipAuth) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const url = path.startsWith('http')
    ? path
    : `${API_ROOT}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    credentials: 'include',
    ...rest,
    headers,
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data as { message?: string })?.message ||
      (typeof data === 'string' ? data : `HTTP ${res.status}`);
    throw new ApiError(String(msg), res.status, data);
  }

  return data as T;
}

export { API_ROOT };

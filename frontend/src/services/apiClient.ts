export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
  requestId?: string;
}

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    code = 'REQUEST_FAILED',
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  preferences: {
    currency: string;
    dateFormat: string;
  };
  createdAt: string;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

// Session expiration listener registry
type SessionExpiredHandler = () => void;
const sessionExpiredHandlers: SessionExpiredHandler[] = [];

export const onSessionExpired = (handler: SessionExpiredHandler): (() => void) => {
  sessionExpiredHandlers.push(handler);
  return () => {
    const idx = sessionExpiredHandlers.indexOf(handler);
    if (idx !== -1) sessionExpiredHandlers.splice(idx, 1);
  };
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Required custom header for CSRF defense-in-depth on state-changing requests
  headers.set('X-Requested-With', 'moneylens');

  // Include credentials by default for httpOnly cookies (NO localStorage auth tokens)
  const config: RequestInit = {
    ...options,
    credentials: 'include',
    headers,
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (networkError) {
    throw new ApiClientError(
      networkError instanceof Error
        ? networkError.message
        : 'Network connection failed. Backend service may be unreachable.',
      0,
      'NETWORK_ERROR',
    );
  }

  const requestId = response.headers.get('x-request-id') || undefined;

  if (!response.ok) {
    // Notify session expired handler if 401 on non-login/register routes
    if (
      response.status === 401 &&
      !endpoint.includes('/auth/login') &&
      !endpoint.includes('/auth/register')
    ) {
      sessionExpiredHandlers.forEach((handler) => handler());
    }

    let errorData: ApiErrorResponse | null = null;
    try {
      errorData = await response.json();
    } catch {
      // Non-JSON error body fallback
    }

    const code = errorData?.error?.code || `HTTP_${response.status}`;
    const message =
      errorData?.error?.message || response.statusText || 'An unexpected error occurred';
    const details = errorData?.error?.details;
    const finalRequestId = errorData?.requestId || requestId;

    throw new ApiClientError(message, response.status, code, details, finalRequestId);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),

  checkHealth: async (): Promise<{ status: string; requestId?: string }> => {
    return request<{ status: string }>('/health');
  },
};

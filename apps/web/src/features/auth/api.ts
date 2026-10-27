import type {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  User,
} from './types';
import { authSession } from './session';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export class AuthApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

async function request<T>(
  path: string,
  init: RequestInit,
  fallback: string,
  token?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(10000),
  });
  if (res.status === 401 && token) authSession.invalidate(token);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const raw = json?.error?.message ?? json?.error ?? json?.message;
    const code = json?.error?.code;
    const message = Array.isArray(raw)
      ? raw.filter((value) => typeof value === 'string').join('. ')
      : typeof raw === 'string'
        ? raw
        : '';
    throw new AuthApiError(message || fallback, res.status, code);
  }
  if (json === null)
    throw new AuthApiError(
      'Phản hồi máy chủ không hợp lệ. Vui lòng thử lại.',
      res.status,
    );
  return json.data ?? json;
}

export function registerApi(payload: RegisterPayload): Promise<AuthResponse> {
  return request(
    '/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Đăng ký tài khoản không thành công.',
  );
}

export function loginApi(payload: LoginPayload): Promise<AuthResponse> {
  return request(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Tài khoản hoặc mật khẩu không chính xác.',
  );
}

export function getMeApi(token: string): Promise<User> {
  return request(
    '/auth/me',
    {},
    'Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.',
    token,
  );
}

// Future protected Orders/Checkout requests should use this entry point too.
export function authenticatedRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = authSession.getToken();
  if (!token)
    return Promise.reject(
      new AuthApiError('Vui lòng đăng nhập để tiếp tục.', 401),
    );
  return request(
    path,
    init,
    'Không thể thực hiện yêu cầu. Vui lòng thử lại.',
    token,
  );
}

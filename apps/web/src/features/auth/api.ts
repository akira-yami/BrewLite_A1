import { AuthResponse, LoginPayload, RegisterPayload, User } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export async function registerApi(payload: RegisterPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Đăng ký tài khoản không thành công.');
  }

  return data;
}

export async function loginApi(payload: LoginPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Tài khoản hoặc mật khẩu không chính xác.');
  }

  return data;
}

export async function getMeApi(token: string): Promise<User> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Không thể lấy thông tin người dùng.');
  }

  return data;
}

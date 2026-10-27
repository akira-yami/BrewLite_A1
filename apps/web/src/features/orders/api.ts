import type { CreateOrderInput, OrderDetail, OrderListResponse } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export class OrdersApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OrdersApiError';
  }
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function unwrap<T>(json: unknown): T {
  if (json && typeof json === 'object' && 'data' in json) {
    return (json as { data: T }).data;
  }

  return json as T;
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = await readJson(response);

  if (!response.ok) {
    const message = (json as { error?: { message?: string }; message?: string } | null)?.error?.message
      ?? (json as { message?: string } | null)?.message
      ?? 'Không thể tải dữ liệu đơn hàng.';
    throw new OrdersApiError(message, response.status);
  }

  return unwrap<T>(json);
}

export function createOrderApi(token: string, input: CreateOrderInput) {
  return request<OrderDetail>('/orders', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getMyOrdersApi(token: string) {
  return request<OrderListResponse | OrderDetail[]>('/orders/me', token);
}

export function getOrderDetailApi(token: string, orderId: string) {
  return request<OrderDetail>(`/orders/${encodeURIComponent(orderId)}`, token);
}

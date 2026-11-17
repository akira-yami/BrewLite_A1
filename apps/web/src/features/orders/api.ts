import type { CreateOrderInput, OrderDetail, OrderListResponse, OrderRefundRequest, OrderSummary } from './types';
import { authSession } from '../auth/session';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export class OrdersApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
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

async function request<T>(path: string, token: string, init?: RequestInit, parse = unwrap<T>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = await readJson(response);
  if (response.status === 401) authSession.invalidate(token);

  if (!response.ok) {
    const payload = json as { error?: { message?: string; code?: string }; message?: string } | null;
    const message = payload?.error?.message
      ?? (json as { message?: string } | null)?.message
      ?? 'Không thể tải dữ liệu đơn hàng.';
    throw new OrdersApiError(message, response.status, payload?.error?.code);
  }

  return parse(json);
}

export function createOrderApi(token: string, input: CreateOrderInput) {
  return request<OrderDetail>('/orders', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getMyOrdersApi(token: string, cursor: string | null = null, signal?: AbortSignal) {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : '';
  return request<OrderListResponse>(`/orders/me${query}`, token, { cache: 'no-store', signal }, (json) => {
    const data = unwrap<OrderSummary[] | OrderListResponse | null>(json);
    if (Array.isArray(data)) {
      const envelope = json as { meta?: { nextCursor?: string | null } };
      return { items: data, nextCursor: envelope.meta?.nextCursor ?? null };
    }
    if (Array.isArray(data?.items)) return data;
    throw new Error('Phản hồi lịch sử đơn hàng không hợp lệ.');
  });
}

export function getOrderDetailApi(token: string, orderId: string, signal?: AbortSignal) {
  return request<OrderDetail>(`/orders/${encodeURIComponent(orderId)}`, token, {
    cache: 'no-store',
    signal,
  });
}

export function cancelOrderApi(token: string, orderId: string) {
  return request<OrderDetail>(`/orders/${encodeURIComponent(orderId)}/cancel`, token, { method: 'POST' });
}

export function requestOrderRefundApi(token: string, orderId: string) {
  return request<OrderRefundRequest>(`/orders/${encodeURIComponent(orderId)}/refund-request`, token, { method: 'POST' });
}

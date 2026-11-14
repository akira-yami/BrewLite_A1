import { CheckoutAPI, CheckoutApiError } from '@/services/checkout.api';
import type { PaymentMethod, PaymentResponse } from '@/types/checkout.contract';

// Re-export canonical types from the shared contract so callers have one import.
export type { PaymentMethod, PaymentResponse };
export { CheckoutApiError as PaymentApiError };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Trình duyệt không hỗ trợ tạo khóa thanh toán an toàn. Vui lòng cập nhật trình duyệt.');
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

export async function createPaymentApi(
  token: string,
  input: { orderId: string; method: PaymentMethod; retryAttempt?: boolean },
  idempotencyKey: string,
) {
  return CheckoutAPI.processPayment(token, input, idempotencyKey);
}

/**
 * Reads the persisted attempt owned by the authenticated customer.
 * This request is read-only; it never starts or retries a gateway charge.
 */
export async function getPaymentStatusApi(
  token: string,
  idempotencyKey: string,
): Promise<PaymentResponse> {
  const response = await fetch(`${API_BASE_URL}/payments/status`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const json = await readJson(response);
  if (!response.ok) {
    const payload = json as {
      error?: { message?: string; code?: string };
      message?: string;
      code?: string;
    } | null;
    throw new CheckoutApiError(
      payload?.error?.message ?? payload?.message ?? 'Không thể tra cứu trạng thái thanh toán.',
      response.status,
      payload?.error?.code ?? payload?.code,
    );
  }
  return unwrap<PaymentResponse>(json);
}

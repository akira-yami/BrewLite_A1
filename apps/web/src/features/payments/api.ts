const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export type PaymentMethod = 'E_WALLET' | 'CARD';

export interface PaymentResponse {
  success: boolean;
  isRetried: boolean;
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  gatewayTransactionId?: string | null;
  errorCode?: string | null;
  message?: string;
}

export class PaymentApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'PaymentApiError';
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

export async function createPaymentApi(
  token: string,
  input: { orderId: string; method: PaymentMethod },
  idempotencyKey: string,
) {
  const response = await fetch(`${API_BASE_URL}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  const json = await readJson(response);

  if (!response.ok) {
    const payload = json as {
      error?: { message?: string; code?: string };
      message?: string;
      code?: string;
    } | null;
    throw new PaymentApiError(
      payload?.error?.message ?? payload?.message ?? 'Không thể xử lý thanh toán.',
      response.status,
      payload?.error?.code ?? payload?.code,
    );
  }

  return unwrap<PaymentResponse>(json);
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
    throw new PaymentApiError(
      payload?.error?.message ?? payload?.message ?? 'Không thể tra cứu trạng thái thanh toán.',
      response.status,
      payload?.error?.code ?? payload?.code,
    );
  }
  return unwrap<PaymentResponse>(json);
}

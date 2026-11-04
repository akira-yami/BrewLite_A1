import { CheckoutAPI, CheckoutApiError } from '@/services/checkout.api';
import type { PaymentMethod, PaymentResponse } from '@/types/checkout.contract';

export type { PaymentMethod, PaymentResponse };
export { CheckoutApiError as PaymentApiError };

export function createPaymentApi(
  token: string,
  input: { orderId: string; method: PaymentMethod },
  idempotencyKey: string,
) {
  return CheckoutAPI.processPayment(token, input, idempotencyKey);
}

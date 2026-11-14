'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cartStore } from '@/stores/cart-store';
import { createPaymentApi, newIdempotencyKey, PaymentApiError } from '@/features/payments/api';
import {
  getCheckoutOrderItems,
  readPendingCheckout,
  transitionPaymentAttempt,
  writeCheckoutCoupon,
  writePendingCheckout,
  type ActivePendingPaymentAttempt,
} from './session';

export function useOrderPaymentRetry() {
  const router = useRouter();
  const retryInFlight = useRef(false);

  return async (token: string, orderId: string) => {
    if (retryInFlight.current) return;
    retryInFlight.current = true;

    try {
      const storage = window.sessionStorage;
      const savedCheckout = readPendingCheckout(storage);
      const checkout = savedCheckout?.orderId === orderId ? savedCheckout : null;

      if (savedCheckout?.idempotencyKey && !checkout) {
        throw new Error('Một đơn khác đang chờ xác nhận. Vui lòng kiểm tra giao dịch đó ở trang thanh toán trước khi thử lại.');
      }
      if (checkout?.idempotencyKey && checkout.method !== 'VNPAY') {
        router.push('/checkout');
        return;
      }

      const attempt: ActivePendingPaymentAttempt = {
        ...(checkout ?? { cartFingerprint: '[]', cartItemsRemoved: true }),
        orderId,
        idempotencyKey: newIdempotencyKey(),
        method: 'VNPAY',
      };
      // Checkout uses this same key to verify the result after returning from VNPay.
      writePendingCheckout(storage, attempt);

      const payment = await createPaymentApi(token, { orderId, method: 'VNPAY' }, attempt.idempotencyKey)
        .catch((error: unknown) => {
          if (error instanceof PaymentApiError &&
              (error.status < 500 || error.code === 'VNPAY_NOT_CONFIGURED')) {
            writePendingCheckout(storage, savedCheckout);
          }
          throw error;
        });

      if (payment.status === 'SUCCEEDED' && payment.success) {
        if (!attempt.cartItemsRemoved && cartStore.removeOrderItems(getCheckoutOrderItems(attempt))) {
          writeCheckoutCoupon(storage, null);
        }
        writePendingCheckout(storage, null);
        router.push(`/orders/confirmation?orderId=${encodeURIComponent(orderId)}`);
        return;
      }
      if (payment.status === 'PROCESSING') {
        if (payment.paymentUrl) window.location.assign(payment.paymentUrl);
        else router.push('/checkout?paymentReturn=1');
        return;
      }
      if (payment.status === 'MANUAL_REVIEW') {
        router.push('/checkout?paymentReturn=1');
        return;
      }

      if (payment.status === 'FAILED' || payment.status === 'REFUNDED') {
        writePendingCheckout(storage, transitionPaymentAttempt(attempt, 'FAILED'));
        throw new Error(payment.errorCode
          ? `Thanh toán không thành công (${payment.errorCode}). Vui lòng thử lại.`
          : 'Thanh toán chưa thành công. Vui lòng thử lại.');
      }
      throw new Error('Chưa nhận được xác nhận thanh toán. Vui lòng kiểm tra lại giao dịch.');
    } finally {
      retryInFlight.current = false;
    }
  };
}

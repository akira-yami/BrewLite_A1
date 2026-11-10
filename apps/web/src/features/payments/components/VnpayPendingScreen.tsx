'use client';

import { useEffect, useState } from 'react';
import { getOrderDetailApi } from '@/features/orders/api';
import type { OrderDetail } from '@/features/orders/types';
import { getPaymentStatusApi, type PaymentResponse } from '../api';

const POLL_INTERVAL_MS = 5_000;

interface VnpayPendingScreenProps {
  idempotencyKey: string;
  orderId: string;
  token: string;
  onResult: (idempotencyKey: string, payment: PaymentResponse) => void;
  onOrderResult: (idempotencyKey: string, order: OrderDetail) => boolean;
}

export function VnpayPendingScreen({ idempotencyKey, orderId, token, onResult, onOrderResult }: VnpayPendingScreenProps) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let nextPoll: ReturnType<typeof setTimeout>;

    async function poll() {
      const payment = await getPaymentStatusApi(token, idempotencyKey).catch(() => null);
      if (!active) return;
      if (payment?.status === 'SUCCEEDED' && payment.success) {
        onResult(idempotencyKey, payment);
        return;
      }

      // This key can be stale even after another attempt paid the same order.
      const order = await getOrderDetailApi(token, orderId, AbortSignal.timeout(10_000)).catch(() => null);
      if (!active || (order && onOrderResult(idempotencyKey, order))) return;

      if (payment?.status === 'MANUAL_REVIEW') {
        setMessage('BrewLite đang đối soát giao dịch với VNPay.');
        return;
      }
      if (payment?.status === 'FAILED' || payment?.status === 'REFUNDED') {
        onResult(idempotencyKey, payment);
        return;
      }
      setMessage(payment
        ? 'Trang sẽ tự cập nhật khi BrewLite nhận được kết quả từ VNPay.'
        : 'Chưa kết nối được để kiểm tra. BrewLite sẽ tự kiểm tra lại.');
      nextPoll = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      active = false;
      clearTimeout(nextPoll);
    };
  }, [idempotencyKey, orderId, token, onResult, onOrderResult]);

  if (message === null) return null;

  return (
    <div role="status" className="mt-5 rounded-2xl border border-[#D8CCBA] bg-[#FCFAF7] px-4 py-3 text-sm leading-6 text-[#163E2B]">
      <h2 className="font-bold">Đang chờ xác nhận thanh toán</h2>
      <p>{message}</p>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { getPaymentStatusApi, type PaymentResponse } from '../api';

const POLL_INTERVAL_MS = 5_000;

interface VnpayPendingScreenProps {
  idempotencyKey: string;
  token: string;
  onResult: (idempotencyKey: string, payment: PaymentResponse) => void;
}

export function VnpayPendingScreen({ idempotencyKey, token, onResult }: VnpayPendingScreenProps) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let nextPoll: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const payment = await getPaymentStatusApi(token, idempotencyKey);
        if (!active) return;
        if (payment.status === 'MANUAL_REVIEW') {
          setMessage('BrewLite đang đối soát giao dịch với VNPay.');
          return;
        }
        if (payment.status === 'FAILED' || payment.status === 'REFUNDED' ||
            (payment.status === 'SUCCEEDED' && payment.success)) {
          onResult(idempotencyKey, payment);
          return;
        }
        setMessage('Trang sẽ tự cập nhật khi BrewLite nhận được kết quả từ VNPay.');
      } catch {
        if (!active) return;
        setMessage('Chưa kết nối được để kiểm tra. BrewLite sẽ tự kiểm tra lại.');
      }
      nextPoll = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      active = false;
      clearTimeout(nextPoll);
    };
  }, [idempotencyKey, token, onResult]);

  if (message === null) return null;

  return (
    <div role="status" className="mt-5 rounded-2xl border border-[#D8CCBA] bg-[#FCFAF7] px-4 py-3 text-sm leading-6 text-[#163E2B]">
      <h2 className="font-bold">Đang chờ xác nhận thanh toán</h2>
      <p>{message}</p>
    </div>
  );
}

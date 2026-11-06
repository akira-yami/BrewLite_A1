'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPaymentStatusApi } from '../api';
import { PaymentCountdownTimer } from './PaymentCountdownTimer';

/** How often to poll payment status while waiting for VNPay IPN (ms) */
const POLL_INTERVAL_MS = 5_000;
/** Maximum number of consecutive poll failures before showing an error */
const MAX_CONSECUTIVE_FAILURES = 3;

type PollStatus = 'polling' | 'succeeded' | 'failed' | 'expired' | 'error';

interface VnpayPendingScreenProps {
  /** ISO timestamp for the order reservation deadline */
  reservationExpiresAt: string;
  /** Payment idempotency key — used to poll GET /payments/status */
  idempotencyKey: string;
  /** JWT access token */
  token: string;
  /** Called when VNPay IPN has confirmed success */
  onSucceeded: () => void;
  /** Called when payment is definitively failed */
  onFailed: (errorCode?: string | null) => void;
  /** Called when the reservation expires before VNPay confirms */
  onReservationExpired: () => void;
  /** Display total so user can verify the amount they paid */
  displayTotal: string;
}

/**
 * Full-screen waiting state shown after the user is redirected to VNPay and
 * returns to the checkout page with `?paymentReturn=1`.
 *
 * Design decisions:
 * - Polls GET /payments/status every 5 seconds (read-only, idempotent).
 * - Never rotates the idempotency key — a network error during polling is
 *   an unknown outcome, not a confirmed failure.
 * - Stops polling on unmount via AbortController to avoid state updates
 *   after navigation.
 * - Expiry fires `onReservationExpired` so the parent can clear sessionStorage
 *   and prompt the user to re-order — NOT silently marking the payment failed.
 */
export function VnpayPendingScreen({
  reservationExpiresAt,
  idempotencyKey,
  token,
  onSucceeded,
  onFailed,
  onReservationExpired,
  displayTotal,
}: VnpayPendingScreenProps) {
  const [pollStatus, setPollStatus] = useState<PollStatus>('polling');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const consecutiveFailures = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    abortRef.current?.abort();
  }, []);

  const poll = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payment = await getPaymentStatusApi(token, idempotencyKey);
      consecutiveFailures.current = 0;

      if (payment.status === 'SUCCEEDED' && payment.success === true) {
        stopPolling();
        setPollStatus('succeeded');
        onSucceeded();
        return;
      }

      if (payment.status === 'FAILED') {
        stopPolling();
        setPollStatus('failed');
        onFailed(payment.errorCode);
        return;
      }

      // PROCESSING — keep waiting; this is expected while VNPay IPN hasn't arrived
      setStatusMessage(null);
    } catch (err: unknown) {
      if (controller.signal.aborted) return; // normal unmount path

      consecutiveFailures.current += 1;
      const message =
        err instanceof Error ? err.message : 'Không thể kiểm tra trạng thái thanh toán.';
      setStatusMessage(message);

      if (consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES) {
        stopPolling();
        setPollStatus('error');
      }
    }
  }, [idempotencyKey, token, onSucceeded, onFailed, stopPolling]);

  useEffect(() => {
    // Defer first poll to avoid setState synchronously in effect body.
    const timeoutId = setTimeout(() => void poll(), 0);
    intervalRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => { clearTimeout(timeoutId); stopPolling(); };
  }, [poll, stopPolling]);

  const handleExpired = useCallback(() => {
    stopPolling();
    setPollStatus('expired');
    onReservationExpired();
  }, [stopPolling, onReservationExpired]);

  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center" role="status">
      {/* Header */}
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#B85D36]">
          VNPay — Đang xử lý
        </p>
        <h2 className="mt-2 text-2xl font-black text-[#163E2B]">
          Đang chờ xác nhận thanh toán
        </h2>
        <p className="mt-2 text-sm text-[#756A63]">
          Số tiền: <strong className="font-mono text-[#163E2B]">{displayTotal}</strong>
        </p>
      </div>

      {/* Spinner */}
      <div
        aria-hidden="true"
        className="h-12 w-12 animate-spin rounded-full border-4 border-[#D8CCB8] border-t-[#163E2B]"
      />

      {/* Countdown */}
      <div className="w-full rounded-2xl border border-[#E5DCD2] bg-[#F6F2EC] px-6 py-5">
        <PaymentCountdownTimer
          expiresAt={reservationExpiresAt}
          onExpired={handleExpired}
        />
      </div>

      {/* Status messages */}
      {pollStatus === 'error' && (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Không thể xác nhận trạng thái sau {MAX_CONSECUTIVE_FAILURES} lần thử.</strong>
          <p className="mt-1">
            Đơn hàng và khóa giao dịch vẫn được giữ nguyên. Hãy thử nhấn{' '}
            <strong>Kiểm tra lại</strong> hoặc quay lại sau để tránh tạo giao dịch trùng.
          </p>
        </div>
      )}

      {statusMessage && pollStatus === 'polling' && (
        <p className="text-xs text-[#9E9189]">
          Lần kiểm tra vừa rồi: {statusMessage}
        </p>
      )}

      {/* Instructions */}
      <div className="text-left text-sm leading-6 text-[#756A63]">
        <p className="font-semibold text-[#1A1612]">Hướng dẫn:</p>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li>Nếu bạn đã thanh toán thành công trên VNPay, hãy chờ — trang sẽ tự cập nhật.</li>
          <li>Nếu bạn huỷ trên VNPay, nhấn <strong>Huỷ và thử lại</strong> bên dưới.</li>
          <li>Không tạo đơn hàng mới để tránh bị tính tiền hai lần.</li>
        </ul>
      </div>

      {/* Manual recheck for error state */}
      {pollStatus === 'error' && (
        <button
          type="button"
          onClick={() => {
            consecutiveFailures.current = 0;
            setPollStatus('polling');
            setStatusMessage(null);
            intervalRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
            void poll();
          }}
          className="rounded-full border border-[#163E2B] px-5 py-2.5 text-sm font-black text-[#163E2B] transition hover:bg-[#163E2B] hover:text-white"
        >
          Kiểm tra lại
        </button>
      )}
    </div>
  );
}

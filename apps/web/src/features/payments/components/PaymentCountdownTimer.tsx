'use client';

import { useEffect, useRef, useState } from 'react';

interface PaymentCountdownTimerProps {
  /** ISO 8601 timestamp from order.reservationExpiresAt */
  expiresAt: string;
  /** Called once when the countdown reaches zero */
  onExpired: () => void;
}

/**
 * Displays a live mm:ss countdown toward `expiresAt`.
 * Calls `onExpired` once when the deadline passes without triggering
 * a React state update after unmount.
 *
 * Rendered as an accessible <time> element with an `aria-live="assertive"`
 * wrapper that announces the last-30-second warning to screen readers.
 */
export function PaymentCountdownTimer({ expiresAt, onExpired }: PaymentCountdownTimerProps) {
  const deadline = new Date(expiresAt).getTime();
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  function getRemainingSeconds(): number {
    return Math.max(0, Math.floor((deadline - Date.now()) / 1000));
  }

  const [remaining, setRemaining] = useState<number>(getRemainingSeconds);
  const firedRef = useRef(false);

  useEffect(() => {
    // If deadline is already past on mount, fire immediately.
    if (remaining === 0 && !firedRef.current) {
      firedRef.current = true;
      onExpiredRef.current();
      return;
    }

    const id = setInterval(() => {
      const secs = getRemainingSeconds();
      setRemaining(secs);
      if (secs === 0 && !firedRef.current) {
        firedRef.current = true;
        clearInterval(id);
        onExpiredRef.current();
      }
    }, 1000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isUrgent = remaining > 0 && remaining <= 30;
  const isExpired = remaining === 0;

  return (
    <div
      aria-live={isUrgent ? 'assertive' : 'off'}
      aria-atomic="true"
      className="flex flex-col items-center gap-1"
    >
      {isExpired ? (
        <p className="text-sm font-bold text-rose-600" role="alert">
          Đã hết thời gian giữ chỗ
        </p>
      ) : (
        <>
          <p className={`text-xs font-semibold uppercase tracking-widest ${isUrgent ? 'text-rose-500' : 'text-[#756A63]'}`}>
            {isUrgent ? '⚠ Sắp hết hạn' : 'Thời gian thanh toán còn lại'}
          </p>
          <time
            dateTime={expiresAt}
            className={`font-mono text-3xl font-black tabular-nums transition-colors ${
              isUrgent ? 'text-rose-600 animate-pulse' : 'text-[#163E2B]'
            }`}
          >
            {formatted}
          </time>
          <p className="text-xs text-[#9E9189]">
            Giỏ hàng và coupon được giữ cho đến khi hết hạn
          </p>
        </>
      )}
    </div>
  );
}

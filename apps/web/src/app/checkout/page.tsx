'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createOrderApi, getOrderDetailApi, OrdersApiError } from '@/features/orders/api';
import type { OrderDetail } from '@/features/orders/types';
import {
  createPaymentApi,
  getPaymentStatusApi,
  PaymentApiError,
  type PaymentMethod,
} from '@/features/payments/api';
import { cartStore, formatVnd, useCartStore } from '@/stores/cart-store';
import {
  readCheckoutCoupon,
  readPendingCheckout,
  transitionPaymentAttempt,
  writeCheckoutCoupon,
  writePendingCheckout,
  type CheckoutCouponQuote,
  type PendingCheckoutState,
} from '@/features/checkout/session';

const paymentOptions: Array<{ method: PaymentMethod; title: string; description: string; icon: string }> = [
  { method: 'E_WALLET', title: 'Ví điện tử', description: 'Thanh toán nhanh qua ví BrewLite', icon: '◉' },
  { method: 'CARD', title: 'Thẻ ngân hàng', description: 'Thẻ nội địa hoặc quốc tế', icon: '▣' },
  ...(process.env.NEXT_PUBLIC_VNPAY_ENABLED === 'true'
    ? [{ method: 'VNPAY' as const, title: 'VNPay', description: 'Thanh toán qua cổng VNPay bảo mật', icon: 'V' }]
    : []),
];

const subscribeVnpayReturn = () => () => {};
const getVnpayReturnSnapshot = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('paymentReturn') === '1';
const getServerVnpayReturnSnapshot = () => false;

function newIdempotencyKey() {
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

function paymentFailureMessage(failureCode?: string | null, message?: string) {
  if (failureCode === 'INSUFFICIENT_FUNDS') {
    return 'Số dư hoặc hạn mức thanh toán không đủ. Giỏ hàng của bạn vẫn được giữ nguyên.';
  }
  if (failureCode === 'PAYMENT_DECLINED') {
    return 'Ngân hàng hoặc ví điện tử từ chối giao dịch. Bạn có thể chọn phương thức khác để thử lại.';
  }
  return message && !/^[A-Z][A-Z0-9_]+$/.test(message)
    ? message
    : 'Thanh toán chưa thành công. Đơn hàng và giỏ hàng của bạn vẫn được giữ nguyên để thử lại.';
}

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCartStore();
  const [method, setMethod] = useState<PaymentMethod>('E_WALLET');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [couponQuote, setCouponQuote] = useState<CheckoutCouponQuote | null>(null);
  const [orderSummary, setOrderSummary] = useState<OrderDetail | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckoutState | null>(null);
  const isVnpayReturn = useSyncExternalStore(
    subscribeVnpayReturn,
    getVnpayReturnSnapshot,
    getServerVnpayReturnSnapshot,
  );
  const pendingCheckoutRef = useRef<PendingCheckoutState | null>(null);
  const submitLock = useRef(false);

  const persistPendingCheckout = (next: PendingCheckoutState | null) => {
    pendingCheckoutRef.current = next;
    setPendingCheckout(next);
    if (typeof window !== 'undefined') {
      writePendingCheckout(window.sessionStorage, next);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const savedCoupon = readCheckoutCoupon(window.sessionStorage);
      setCouponQuote(savedCoupon);

      const savedCheckout = readPendingCheckout(window.sessionStorage);
      if (savedCheckout) {
        pendingCheckoutRef.current = savedCheckout;
        setPendingCheckout(savedCheckout);
        if (savedCheckout.method) setMethod(savedCheckout.method);

        const token = window.localStorage.getItem('brewlite_token');
        if (token) {
          void getOrderDetailApi(token, savedCheckout.orderId)
            .then((order) => {
              if (active) setOrderSummary(order);
            })
            .catch(() => {
              // The same idempotency key remains available if this read-only refresh fails.
            });
        }
      }

      setIsRestoring(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const hasUnresolvedPayment = Boolean(pendingCheckout?.idempotencyKey);
  const cartFingerprint = JSON.stringify(cartStore.getOrderItems());
  const pendingCartChanged = Boolean(
    pendingCheckout && pendingCheckout.cartFingerprint !== cartFingerprint,
  );
  const couponMatchesCart = Boolean(
    couponQuote && couponQuote.subtotal === cart.subtotal,
  );
  const previewDiscount = couponMatchesCart ? couponQuote?.discountAmount ?? 0 : 0;
  const displayedSubtotal = orderSummary?.subtotal ?? cart.subtotal;
  const displayedDiscount = orderSummary?.discountAmount ?? previewDiscount;
  const displayedTotal = orderSummary?.total ?? Math.max(0, cart.subtotal - previewDiscount);

  const handlePayment = async () => {
    if (submitLock.current || isRestoring || cart.items.length === 0) return;
    if (pendingCartChanged) {
      setError('Giỏ hàng đã thay đổi so với đơn hàng đang chờ thanh toán. Không tạo giao dịch mới để tránh thanh toán nhầm đơn.');
      return;
    }

    // Lock synchronously; React state alone does not stop two clicks in the same event turn.
    submitLock.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('brewlite_token');
      if (!token) {
        setError('Vui lòng đăng nhập trước khi đặt hàng.');
        return;
      }

      let checkout = pendingCheckoutRef.current;
      if (!checkout) {
        const items = cartStore.getOrderItems();
        const couponCode = couponMatchesCart ? couponQuote?.code : undefined;
        const order = await createOrderApi(token, {
          items,
          ...(couponCode ? { couponCode } : {}),
        });

        setOrderSummary(order);
        checkout = {
          orderId: order.id,
          idempotencyKey: null,
          method: null,
          cartFingerprint: JSON.stringify(items),
        };
        persistPendingCheckout(checkout);
      }

      const idempotencyKey = checkout.idempotencyKey ?? newIdempotencyKey();
      const attempt: PendingCheckoutState & {
        idempotencyKey: string;
        method: PaymentMethod;
      } = {
        ...checkout,
        idempotencyKey,
        method,
      };

      // Persist before POST so reload/network loss replays the same order and key.
      persistPendingCheckout(attempt);
      let payment: Awaited<ReturnType<typeof createPaymentApi>>;
      if (checkout.idempotencyKey) {
        // An unresolved attempt is queried first; never infer failure from a timeout.
        try {
          payment = await getPaymentStatusApi(token, idempotencyKey);
        } catch (statusError) {
          if (
            !(statusError instanceof PaymentApiError) ||
            statusError.code !== 'PAYMENT_NOT_FOUND'
          ) {
            throw statusError;
          }
          // The original request may have failed before its row was committed.
          // Replaying the exact same key is safe; rotating it here would not be.
          payment = await createPaymentApi(
            token,
            { orderId: attempt.orderId, method: attempt.method as PaymentMethod },
            idempotencyKey,
          );
        }
      } else {
        payment = await createPaymentApi(
          token,
          { orderId: attempt.orderId, method: attempt.method as PaymentMethod },
          idempotencyKey,
        );
      }

      const returnedFromVnpay = Boolean(
        checkout.idempotencyKey &&
        attempt.method === 'VNPAY' &&
        isVnpayReturn,
      );
      if (
        attempt.method === 'VNPAY' &&
        payment.status === 'PROCESSING' &&
        payment.paymentUrl &&
        !returnedFromVnpay
      ) {
        // Payment URL was persisted with the same key before redirect.
        window.location.assign(payment.paymentUrl);
        return;
      }

      const resolution = payment.status === 'SUCCEEDED' && payment.success === true
        ? 'SUCCEEDED'
        : payment.status === 'FAILED'
          ? 'FAILED'
          : 'PROCESSING';
      const nextAttempt = transitionPaymentAttempt(attempt, resolution);
      persistPendingCheckout(nextAttempt);

      if (resolution === 'SUCCEEDED') {
        cartStore.clearCart();
        writeCheckoutCoupon(window.sessionStorage, null);
        router.replace(`/orders/confirmation?orderId=${encodeURIComponent(attempt.orderId)}`);
        return;
      }

      if (resolution === 'FAILED') {
        // Only a definitive failure permits a new key; retry the same Order.
        setError(paymentFailureMessage(payment.errorCode, payment.message));
        return;
      }

      // PROCESSING or an inconsistent response is not a confirmed failure.
      // The state transition deliberately retains the same order and key for replay.
      setError(returnedFromVnpay
        ? 'Đã quay lại từ VNPay. BrewLite đang chờ IPN xác nhận; hãy kiểm tra lại bằng cùng khóa thanh toán.'
        : 'Giao dịch đang được xử lý hoặc chưa có kết quả xác nhận. Hãy kiểm tra lại bằng cùng khóa thanh toán; không tạo đơn mới.');
    } catch (reason) {
      if (reason instanceof OrdersApiError) {
        if (reason.status === 401) {
          setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        } else if (reason.status === 409) {
          setError('Một số món vừa hết hàng hoặc không còn khả dụng. Giỏ hàng vẫn được giữ nguyên.');
        } else {
          setError(reason.message || 'Không thể tạo đơn hàng. Vui lòng kiểm tra lại giỏ hàng.');
        }
      } else if (reason instanceof PaymentApiError) {
        if (reason.code === 'ORDER_EXPIRED') {
          setError('Đơn hàng đã hết hạn thanh toán do quá thời gian giữ chỗ. Vui lòng đặt lại đơn mới.');
          persistPendingCheckout(null);
          setOrderSummary(null);
        } else if (reason.code === 'PAYMENT_IN_PROGRESS') {
          setError('Giao dịch đang được xử lý. Hãy chờ rồi kiểm tra lại bằng cùng khóa thanh toán.');
        } else if (reason.status === 401) {
          setError('Phiên đăng nhập đã hết hạn. Khóa thanh toán được giữ để tiếp tục an toàn sau khi đăng nhập.');
        } else {
          // A transport/server error does not prove that the gateway declined the payment.
          setError('Chưa xác định được kết quả thanh toán. Giữ nguyên đơn hàng và khóa giao dịch; hãy thử kiểm tra lại.');
        }
      } else {
        // A timeout/connection reset is an unknown outcome, never a reason to rotate the key.
        setError('Mất kết nối hoặc chưa nhận được xác nhận thanh toán. Đơn hàng và Idempotency-Key được giữ nguyên để kiểm tra lại.');
      }
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <main className="min-h-screen bg-[#FBF8F3] px-4 py-16 text-[#1A1612]">
        <section className="mx-auto max-w-lg rounded-3xl border border-[#E5DCD2] bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#B85D36]">BrewLite checkout</p>
          <h1 className="mt-3 text-3xl font-black text-[#163E2B]">Giỏ hàng đang trống</h1>
          <p className="mt-3 text-sm leading-6 text-[#756A63]">Hãy chọn món trước khi tiếp tục đến bước thanh toán.</p>
          <Link href="/menu" className="mt-6 inline-flex rounded-full bg-[#163E2B] px-5 py-3 text-sm font-black text-white">
            Xem thực đơn
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FBF8F3] px-4 py-8 text-[#1A1612] sm:py-12">
      <section className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-3xl border border-[#E5DCD2] bg-white p-5 shadow-sm sm:p-8">
          {hasUnresolvedPayment ? (
            <p className="text-sm font-bold text-[#163E2B]">Đang xác minh giao dịch trước đó. Không đổi phương thức hoặc tạo đơn mới trong lúc này.</p>
          ) : (
            <Link href="/menu" className="text-sm font-bold text-[#163E2B] hover:underline">← Quay lại giỏ hàng</Link>
          )}
          <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-[#B85D36]">BrewLite checkout</p>
          <h1 className="mt-2 text-3xl font-black text-[#163E2B] sm:text-4xl">Chọn phương thức thanh toán</h1>
          <p className="mt-2 text-sm leading-6 text-[#756A63]">Đơn hàng được máy chủ tạo và tính lại giá, coupon, tồn kho trước khi bắt đầu thanh toán.</p>

          <div className="mt-6 space-y-3">
            {paymentOptions.map((option) => {
              const selected = method === option.method;
              return (
                <button
                  key={option.method}
                  type="button"
                  onClick={() => setMethod(option.method)}
                  disabled={hasUnresolvedPayment || isSubmitting || isRestoring}
                  className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                    selected ? 'border-[#163E2B] bg-[#E8F1EC]' : 'border-[#E5DCD2] bg-[#FCFAF7] hover:border-[#9fb9ab]'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  aria-pressed={selected}
                >
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full text-xl ${
                    selected ? 'bg-[#163E2B] text-white' : 'bg-white text-[#163E2B]'
                  }`} aria-hidden="true">{option.icon}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-black text-[#1E1813]">{option.title}</span>
                    <span className="mt-1 block text-xs text-[#756A63]">{option.description}</span>
                  </span>
                  <span className={`h-5 w-5 rounded-full border-2 ${
                    selected ? 'border-[#163E2B] bg-[#163E2B] shadow-[inset_0_0_0_3px_#E8F1EC]' : 'border-[#B9AEA4]'
                  }`} />
                </button>
              );
            })}
          </div>

          {isVnpayReturn && (
            <div role="status" className="mt-5 rounded-2xl border border-[#D8CCBA] bg-[#FCFAF7] px-4 py-3 text-sm leading-6 text-[#163E2B]">
              Bạn đã quay lại từ VNPay. Trạng thái chỉ được xác nhận khi IPN của VNPay cập nhật trên máy chủ BrewLite.
            </div>
          )}
          {error && (
            <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">
              {error}
            </div>
          )}
          {pendingCartChanged && (
            <div role="alert" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Giỏ hàng đã thay đổi so với đơn hàng đang chờ. Hãy xử lý đơn hàng cũ trong mục Đơn hàng trước khi thanh toán giỏ mới.
              <Link href="/orders" className="ml-1 font-bold underline">Mở Đơn hàng</Link>
            </div>
          )}

          <button
            type="button"
            onClick={handlePayment}
            disabled={isSubmitting || isRestoring || pendingCartChanged}
            className="mt-6 w-full rounded-full bg-[#163E2B] px-5 py-3.5 text-sm font-black text-white shadow-md transition hover:bg-[#1f4f38] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRestoring
              ? 'Đang khôi phục phiên thanh toán...'
              : isSubmitting
                ? 'Đang xử lý thanh toán...'
                : hasUnresolvedPayment
                  ? 'Kiểm tra trạng thái giao dịch'
                  : pendingCheckout
                    ? `Thử thanh toán lại ${formatVnd(displayedTotal)}`
                    : `Thanh toán ${formatVnd(displayedTotal)}`}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-[#756A63]">
            {hasUnresolvedPayment
              ? 'Ưu tiên GET trạng thái đã lưu; chỉ replay POST bằng cùng Idempotency-Key nếu server chưa có bản ghi.'
              : 'Tổng tiền cuối cùng do máy chủ xác nhận theo giá, coupon và tồn kho hiện tại.'}
          </p>
        </div>

        <aside className="h-fit rounded-3xl border border-[#E5DCD2] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-black text-[#163E2B]">Tóm tắt đơn hàng</h2>
          <div className="mt-4 space-y-3 border-b border-[#EDE6DD] pb-4">
            {cart.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 text-sm">
                <div>
                  <p className="font-bold text-[#1E1813]">{item.name} <span className="text-[#756A63]">× {item.quantity}</span></p>
                  <p className="mt-1 text-xs text-[#756A63]">Size {item.size}{item.toppings.length ? ` · ${item.toppings.map((topping) => topping.name).join(', ')}` : ''}</p>
                </div>
                <strong className="shrink-0 font-mono text-[#163E2B]">{formatVnd(item.lineTotal)}</strong>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-[#756A63]">Tạm tính ({cart.totalQuantity} món)</span>
            <strong className="font-mono text-[#163E2B]">{formatVnd(displayedSubtotal)}</strong>
          </div>
          {(displayedDiscount > 0 || Boolean(couponQuote?.code)) && (
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-[#756A63]">
                Giảm giá{couponQuote?.code ? ` (${couponQuote.code})` : ''}
              </span>
              <strong className="font-mono text-[#163E2B]">−{formatVnd(displayedDiscount)}</strong>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-[#EDE6DD] pt-4 text-sm">
            <span className="font-black text-[#163E2B]">Tổng thanh toán</span>
            <strong className="font-mono text-lg text-[#163E2B]">{formatVnd(displayedTotal)}</strong>
          </div>
          {couponQuote && !couponMatchesCart && !orderSummary && (
            <p className="mt-2 text-xs text-amber-700">Giỏ hàng đã thay đổi sau khi báo giá coupon được tạo. Máy chủ sẽ không áp dụng báo giá cũ.</p>
          )}
        </aside>
      </section>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cancelOrderApi, createOrderApi, getOrderDetailApi, OrdersApiError } from '@/features/orders/api';
import type { OrderDetail } from '@/features/orders/types';
import {
  createPaymentApi,
  getPaymentStatusApi,
  PaymentApiError,
  type PaymentResponse,
} from '@/features/payments/api';
import { VnpayPendingScreen } from '@/features/payments/components/VnpayPendingScreen';
import { cartStore, formatVnd, useCartStore } from '@/stores/cart-store';
import {
  getCheckoutOrderItems,
  readCheckoutCoupon,
  readPendingCheckout,
  transitionPaymentAttempt,
  writeCheckoutCoupon,
  writePendingCheckout,
  type ActivePendingPaymentAttempt,
  type CheckoutCouponQuote,
  type PendingCheckoutState,
} from '@/features/checkout/session';

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
  if (failureCode === 'VNPAY_24_02') {
    return 'Bạn đã hủy giao dịch trên VNPay. Bạn có thể thanh toán lại đơn hàng.';
  }
  if (failureCode === 'VNPAY_11_02') {
    return 'Liên kết thanh toán VNPay đã hết hạn. Bạn có thể thử thanh toán lại.';
  }
  if (failureCode === 'INSUFFICIENT_FUNDS' || failureCode === 'VNPAY_51_02' || failureCode === 'VNPAY_65_02') {
    return 'Số dư hoặc hạn mức thanh toán không đủ.';
  }
  if (failureCode === 'PAYMENT_DECLINED') {
    return 'Giao dịch bị từ chối. Bạn có thể thanh toán lại đơn hàng.';
  }
  return message && !/^[A-Z][A-Z0-9_]+$/.test(message)
    ? message
    : 'Thanh toán chưa thành công. Bạn có thể thanh toán lại đơn hàng.';
}

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCartStore();
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

  const persistPendingCheckout = useCallback((next: PendingCheckoutState | null) => {
    pendingCheckoutRef.current = next;
    setPendingCheckout(next);
    writePendingCheckout(window.sessionStorage, next);
  }, []);

  const removeCheckoutItems = useCallback((checkout: PendingCheckoutState) => {
    if (!checkout.cartItemsRemoved && cartStore.removeOrderItems(getCheckoutOrderItems(checkout))) {
      writeCheckoutCoupon(window.sessionStorage, null);
      setCouponQuote(null);
    }
  }, []);

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

        const token = window.localStorage.getItem('brewlite_token');
        if (token) {
          void getOrderDetailApi(token, savedCheckout.orderId)
            .then((order) => {
              if (!active || submitLock.current || pendingCheckoutRef.current?.orderId !== order.id) return;
              if (order.status === 'CANCELLED') {
                removeCheckoutItems(savedCheckout);
                persistPendingCheckout(null);
              } else {
                setOrderSummary(order);
                if (order.status === 'PAYMENT_FAILED' && !savedCheckout.idempotencyKey && !savedCheckout.cartItemsRemoved) {
                  removeCheckoutItems(savedCheckout);
                  persistPendingCheckout({ ...savedCheckout, cartItemsRemoved: true });
                }
              }
            })
            .catch((reason: unknown) => {
              if (active && pendingCheckoutRef.current?.orderId === savedCheckout.orderId &&
                  reason instanceof OrdersApiError && reason.status === 404) {
                persistPendingCheckout(null);
              }
            });
        }
      }

      setIsRestoring(false);
    });

    return () => {
      active = false;
    };
  }, [persistPendingCheckout, removeCheckoutItems]);

  const applyPaymentResult = useCallback((idempotencyKey: string, payment: PaymentResponse) => {
    const checkout = pendingCheckoutRef.current;
    if (!checkout?.method || checkout.idempotencyKey !== idempotencyKey) return;

    if (payment.status === 'SUCCEEDED' && payment.success === true) {
      persistPendingCheckout(null);
      setOrderSummary(null);
      removeCheckoutItems(checkout);
      router.replace(`/orders/confirmation?orderId=${encodeURIComponent(checkout.orderId)}`);
    } else if (payment.status === 'FAILED' || payment.status === 'REFUNDED') {
      removeCheckoutItems(checkout);
      persistPendingCheckout(payment.errorCode === 'ORDER_CANCELLED'
        ? null
        : transitionPaymentAttempt({ ...checkout, cartItemsRemoved: true, idempotencyKey, method: checkout.method }, 'FAILED'));
      if (payment.errorCode === 'ORDER_CANCELLED') setOrderSummary(null);
      setError(payment.errorCode === 'ORDER_CANCELLED'
        ? 'Đơn hàng đã được hủy. Bạn có thể thanh toán giỏ hiện tại.'
        : paymentFailureMessage(payment.errorCode, payment.message));
    } else if (payment.status === 'MANUAL_REVIEW') {
      setError('Giao dịch đang cần đối soát. Bạn có thể theo dõi kết quả trong chi tiết đơn hàng.');
    }
  }, [persistPendingCheckout, removeCheckoutItems, router]);

  const applyPolledPaymentResult = useCallback((key: string, payment: PaymentResponse) => {
    if (!submitLock.current) applyPaymentResult(key, payment);
  }, [applyPaymentResult]);

  const pendingKey = pendingCheckout?.idempotencyKey;
  const cartFingerprint = JSON.stringify(cartStore.getOrderItems());
  const pendingCartChanged = Boolean(
    pendingCheckout && !pendingCheckout.cartItemsRemoved && pendingCheckout.cartFingerprint !== cartFingerprint,
  );
  const hasUnresolvedPayment = Boolean(pendingKey && !pendingCartChanged);
  const token = typeof window !== 'undefined' ? localStorage.getItem('brewlite_token') : null;
  const couponMatchesCart = Boolean(
    couponQuote && couponQuote.subtotal === cart.subtotal,
  );
  const previewDiscount = couponMatchesCart ? couponQuote?.discountAmount ?? 0 : 0;
  const currentOrder = pendingCartChanged ? null : orderSummary;
  const displayedSubtotal = currentOrder?.subtotal ?? cart.subtotal;
  const displayedDiscount = currentOrder?.discountAmount ?? previewDiscount;
  const displayedTotal = currentOrder?.total ?? Math.max(0, cart.subtotal - previewDiscount);

  const handlePayment = async (action: 'pay' | 'cancel' | 'new' = 'pay') => {
    if (submitLock.current || isRestoring) return;

    // Lock synchronously; React state alone does not stop two clicks in the same event turn.
    submitLock.current = true;
    setIsSubmitting(true);
    setError(null);

    let cancelling = false;
    try {
      const token = localStorage.getItem('brewlite_token');
      if (!token) {
        setError('Vui lòng đăng nhập trước khi đặt hàng.');
        return;
      }

      let checkout = pendingCheckoutRef.current;
      const cancelOnly = action === 'cancel';
      const replaceOrder = action === 'new' || Boolean(checkout && !checkout.cartItemsRemoved &&
        checkout.cartFingerprint !== JSON.stringify(cartStore.getOrderItems()));
      const expiredOrder = checkout && !checkout.idempotencyKey && currentOrder?.reservationExpiresAt &&
        Date.parse(currentOrder.reservationExpiresAt) <= Date.now();
      const retryItems = expiredOrder && checkout?.cartItemsRemoved && !replaceOrder && !cancelOnly
        ? getCheckoutOrderItems(checkout)
        : null;
      if (checkout && (cancelOnly || replaceOrder || expiredOrder)) {
        cancelling = true;
        try {
          await cancelOrderApi(token, checkout.orderId);
          removeCheckoutItems(checkout);
        } catch (reason) {
          if (!(reason instanceof OrdersApiError)) throw reason;
          if (reason.code === 'ORDER_INVALID_TRANSITION') {
            // The old order might have completed while the customer changed the cart.
            const order = await getOrderDetailApi(token, checkout.orderId);
            const canReplaceCompletedOrder = replaceOrder && !cancelOnly &&
              order.status !== 'PENDING' && order.status !== 'PAYMENT_FAILED';
            if (order.status !== 'CANCELLED' && !canReplaceCompletedOrder) throw reason;
            removeCheckoutItems(checkout);
          } else if (reason.status !== 404) {
            throw reason;
          }
        }
        persistPendingCheckout(null);
        setOrderSummary(null);
        checkout = null;
        cancelling = false;
      }
      if (cancelOnly) return;

      if (!checkout) {
        const items = retryItems ?? cartStore.getOrderItems();
        if (!items.length) return;
        const quote = readCheckoutCoupon(window.sessionStorage);
        const couponCode = !retryItems && quote?.subtotal === cartStore.getSnapshot().subtotal ? quote.code : undefined;
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
          ...(retryItems ? { cartItemsRemoved: true } : {}),
        };
        persistPendingCheckout(checkout);
      }

      const idempotencyKey = checkout.idempotencyKey ?? newIdempotencyKey();
      const attempt: ActivePendingPaymentAttempt = {
        ...checkout,
        idempotencyKey,
        method: checkout.method ?? 'VNPAY',
      };

      if (!checkout.idempotencyKey && getVnpayReturnSnapshot()) {
        window.history.replaceState(null, '', '/checkout');
      }
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
          if (attempt.method !== 'VNPAY') {
            persistPendingCheckout({ ...checkout, idempotencyKey: null, method: null });
            setError('Bạn có thể tiếp tục thanh toán đơn hàng bằng VNPay.');
            return;
          }
          // The original request may have failed before its row was committed.
          // Replaying the exact same key is safe; rotating it here would not be.
          payment = await createPaymentApi(
            token,
            { orderId: attempt.orderId, method: attempt.method },
            idempotencyKey,
          );
        }
      } else {
        payment = await createPaymentApi(
          token,
          { orderId: attempt.orderId, method: 'VNPAY' },
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

      applyPaymentResult(idempotencyKey, payment);
      if (payment.status === 'PROCESSING' && !returnedFromVnpay) {
        setError('Giao dịch đang được xử lý. Bạn có thể kiểm tra lại trạng thái thanh toán.');
      }
    } catch (reason) {
      if (cancelling) {
        setError(reason instanceof OrdersApiError ? reason.message : 'Chưa thể xác nhận hủy đơn hàng. Vui lòng thử lại.');
      } else if (reason instanceof OrdersApiError) {
        if (reason.status === 401) {
          setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        } else if (reason.status === 409) {
          setError('Một số món vừa hết hàng hoặc không còn khả dụng. Giỏ hàng vẫn được giữ nguyên.');
        } else {
          setError(reason.message || 'Không thể tạo đơn hàng. Vui lòng kiểm tra lại giỏ hàng.');
        }
      } else if (reason instanceof PaymentApiError) {
        if (reason.code === 'ORDER_EXPIRED') {
          const checkout = pendingCheckoutRef.current;
          if (checkout) {
            removeCheckoutItems(checkout);
            persistPendingCheckout({ ...checkout, idempotencyKey: null, method: null, cartItemsRemoved: true });
          }
          setError('Đơn đã hết hạn giữ chỗ. Hãy chọn Thanh toán lại để tạo đơn mới.');
        } else if (reason.code === 'PAYMENT_IN_PROGRESS') {
          setError('Giao dịch đang được xử lý. Hãy chờ rồi kiểm tra lại bằng cùng khóa thanh toán.');
        } else if (reason.code === 'VNPAY_NOT_CONFIGURED') {
          setError(reason.message);
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

  if (cart.items.length === 0 && !pendingCheckout) {
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
          <Link href="/menu" className="text-sm font-bold text-[#163E2B] hover:underline">← Quay lại giỏ hàng</Link>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-[#B85D36]">BrewLite checkout</p>
          <h1 className="mt-2 text-3xl font-black text-[#163E2B] sm:text-4xl">Thanh toán qua VNPay</h1>
          <p className="mt-2 text-sm leading-6 text-[#756A63]">Đơn hàng được máy chủ tạo và tính lại giá, coupon, tồn kho trước khi bắt đầu thanh toán.</p>

          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-[#163E2B] bg-[#E8F1EC] p-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#163E2B] text-xl text-white" aria-hidden="true">V</span>
            <div>
              <p className="text-sm font-black text-[#1E1813]">VNPay</p>
              <p className="mt-1 text-xs text-[#756A63]">Thanh toán qua cổng VNPay</p>
            </div>
          </div>

          {isVnpayReturn && !isSubmitting && pendingCheckout?.method === 'VNPAY' && pendingKey && token && (
            <VnpayPendingScreen
              key={pendingKey}
              idempotencyKey={pendingKey}
              token={token}
              onResult={applyPolledPaymentResult}
            />
          )}
          {error && (
            <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">
              {error}
            </div>
          )}
          {pendingCartChanged && (
            <div role="alert" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Khi tiếp tục, đơn cũ sẽ được hủy và các món của đơn đó sẽ được xóa khỏi giỏ. Bạn có thể thanh toán các món còn lại.
            </div>
          )}

          <button
            type="button"
            onClick={() => void handlePayment()}
            disabled={isSubmitting || isRestoring || (!pendingCheckout && cart.items.length === 0)}
            className="mt-6 w-full rounded-full bg-[#163E2B] px-5 py-3.5 text-sm font-black text-white shadow-md transition hover:bg-[#1f4f38] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRestoring
              ? 'Đang khôi phục phiên thanh toán...'
              : isSubmitting
                ? 'Đang xử lý thanh toán...'
                : hasUnresolvedPayment
                  ? 'Kiểm tra trạng thái giao dịch'
                  : pendingCartChanged
                    ? 'Thanh toán giỏ mới'
                    : pendingCheckout
                      ? 'Thanh toán lại'
                      : `Thanh toán ${formatVnd(displayedTotal)}`}
          </button>
          {pendingCheckout?.cartItemsRemoved && !pendingKey && cart.items.length > 0 && (
            <button type="button" onClick={() => void handlePayment('new')} disabled={isSubmitting || isRestoring}
              className="mt-3 w-full text-sm font-bold text-[#163E2B] underline disabled:opacity-50">
              Thanh toán giỏ mới
            </button>
          )}
          {pendingCheckout && (
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
              <button
                type="button"
                onClick={() => void handlePayment('cancel')}
                disabled={isSubmitting || isRestoring}
                className="font-bold text-rose-700 underline disabled:opacity-50"
              >
                Hủy đơn đang chờ
              </button>
              <Link href={`/orders/${encodeURIComponent(pendingCheckout.orderId)}`} className="font-bold text-[#163E2B] underline">
                Xem đơn hàng
              </Link>
            </div>
          )}
          <p className="mt-3 text-center text-xs leading-5 text-[#756A63]">
            {hasUnresolvedPayment
              ? 'Bạn có thể kiểm tra kết quả của giao dịch hiện tại.'
              : 'Tổng tiền cuối cùng do máy chủ xác nhận theo giá, coupon và tồn kho hiện tại.'}
          </p>
        </div>

        <aside className="h-fit rounded-3xl border border-[#E5DCD2] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-black text-[#163E2B]">Tóm tắt đơn hàng</h2>
          <div className="mt-4 space-y-3 border-b border-[#EDE6DD] pb-4">
            {(pendingCheckout?.cartItemsRemoved ? currentOrder?.items ?? [] : cart.items).map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 text-sm">
                <div>
                  <p className="font-bold text-[#1E1813]">{'productName' in item ? item.productName : item.name} <span className="text-[#756A63]">× {item.quantity}</span></p>
                  <p className="mt-1 text-xs text-[#756A63]">Size {item.size}{item.toppings.length ? ` · ${item.toppings.map((topping) => topping.name).join(', ')}` : ''}</p>
                </div>
                <strong className="shrink-0 font-mono text-[#163E2B]">{formatVnd(item.lineTotal)}</strong>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-[#756A63]">Tạm tính</span>
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
          {couponQuote && !couponMatchesCart && !currentOrder && (
            <p className="mt-2 text-xs text-amber-700">Giỏ hàng đã thay đổi sau khi báo giá coupon được tạo. Máy chủ sẽ không áp dụng báo giá cũ.</p>
          )}
        </aside>
      </section>
    </main>
  );
}

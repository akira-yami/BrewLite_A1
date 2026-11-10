'use client';

import { useAuthSession } from '@/features/auth/use-auth-session';
import { useOrderPaymentRetry } from '@/features/checkout/use-order-payment-retry';
import { getMyOrdersApi, OrdersApiError } from '@/features/orders/api';
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge';
import type { OrderDetail, OrderListResponse, OrderStatus, OrderSummary } from '@/features/orders/types';
import { PaymentApiError } from '@/features/payments/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

function toItems(response: OrderListResponse | OrderDetail[]) {
  return Array.isArray(response) ? response : response.items;
}

/**
 * Đơn chưa thanh toán (PENDING/PAYMENT_FAILED) đã quá hạn giữ chỗ được coi như
 * đã hủy — khớp với job hết hạn ở máy chủ sẽ chuyển đơn sang CANCELLED trong ~1 phút.
 */
function isUnpaidExpired(order: OrderSummary): boolean {
  if (!['PENDING', 'PAYMENT_FAILED'].includes(order.status)) return false;
  return Boolean(
    order.reservationExpiresAt &&
      new Date(order.reservationExpiresAt).getTime() <= Date.now(),
  );
}

/** Trạng thái hiển thị: đơn chưa thanh toán đã quá hạn hiển thị là CANCELLED. */
function displayStatus(order: OrderSummary): OrderStatus {
  return isUnpaidExpired(order) ? 'CANCELLED' : order.status;
}

function OrderCard({ order, token }: { order: OrderSummary; token: string }) {
  const client = useQueryClient();
  const retryOrderPayment = useOrderPaymentRetry();
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const expired = isUnpaidExpired(order);
  const effectiveStatus = displayStatus(order);
  const canRetry = !expired && ['PENDING', 'PAYMENT_FAILED'].includes(order.status);

  const handlePayAgain = async () => {
    if (isPaying) return;
    setIsPaying(true);
    setPayError(null);
    try {
      await retryOrderPayment(token, order.id);
    } catch (err: unknown) {
      if (err instanceof PaymentApiError && err.code === 'ORDER_EXPIRED') {
        setPayError('Đơn hàng đã hết hạn giữ chỗ và không thể thanh toán.');
        await client.invalidateQueries({ queryKey: ['orders-history'] });
      } else {
        setPayError(
          err instanceof Error ? err.message : 'Có lỗi xảy ra khi xử lý thanh toán.',
        );
      }
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#E8DFC8] bg-white p-5 shadow-sm transition hover:shadow-md">
      <Link href={`/orders/${order.id}`} className="block">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm font-bold text-[#163D2C]">{order.orderNumber}</p>
            <p className="mt-1 text-xs text-[#756A63]">
              {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.createdAt))}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <OrderStatusBadge status={effectiveStatus} />
          </div>
        </div>
        <div className="mt-4 border-t border-[#EEE6DB] pt-3 text-sm">
          <span className="text-[#756A63]">Tổng tiền: <strong className="font-mono text-[#163D2C]">{order.total.toLocaleString('vi-VN')} đ</strong></span>
        </div>
      </Link>

      {canRetry && (
        <div className="mt-3 flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={handlePayAgain}
            disabled={isPaying}
            className="inline-flex items-center gap-1 rounded-full bg-[#163D2C] px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#12331f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPaying ? 'Đang chuyển tới cổng thanh toán...' : 'Thanh toán lại →'}
          </button>
          {payError && <p className="text-xs font-medium text-rose-600">{payError}</p>}
        </div>
      )}

      {expired && (
        <div className="mt-3 text-right">
          <span className="text-xs font-medium text-stone-500">
            Đơn đã hết hạn thanh toán và bị hủy.
          </span>
        </div>
      )}
    </div>
  );
}

export default function OrdersHistoryPage() {
  const { status, token } = useAuthSession();
  const query = useQuery({
    queryKey: ['orders-history', token],
    enabled: status === 'authenticated' && !!token,
    queryFn: () => getMyOrdersApi(token!),
    retry: false,
  });
  const orders: OrderSummary[] | null = status === 'authenticated' && query.data ? toItems(query.data) : null;
  const error = status === 'anonymous'
    ? 'Vui lòng đăng nhập để xem lịch sử đơn hàng.'
    : query.error instanceof OrdersApiError && query.error.status === 401
      ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      : query.error?.message;

  return (
    <main className="min-h-screen bg-[#FBF8F3] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/menu" className="text-sm font-bold text-[#163D2C]">← Thực đơn</Link>
        <h1 className="mt-4 font-serif text-3xl font-black text-[#163D2C]">Đơn hàng của tôi</h1>
        <p className="mt-1 text-sm text-[#756A63]">Theo dõi trạng thái và xem lại các đơn đã đặt.</p>

        {!orders && !error && <div className="mt-6 rounded-2xl border border-[#E8DFC8] bg-white p-10 text-center text-sm font-semibold text-[#756A63]">Đang tải lịch sử đơn hàng...</div>}
        {error && <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700"><p>{error}</p><button type="button" onClick={() => { if (status === 'authenticated') void query.refetch(); }} className="mt-4 rounded-full bg-[#163D2C] px-4 py-2 text-xs font-bold text-white">Thử lại</button></div>}
        {orders?.length === 0 && <div className="mt-6 rounded-2xl border border-[#E8DFC8] bg-white p-10 text-center"><p className="text-3xl">☕</p><h2 className="mt-3 font-serif text-xl font-black text-[#163D2C]">Bạn chưa có đơn hàng nào</h2><Link href="/menu" className="mt-5 inline-flex rounded-full bg-[#163D2C] px-5 py-2.5 text-sm font-bold text-white">Chọn món ngay</Link></div>}
        {orders && orders.length > 0 && (
          <div className="mt-6 space-y-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} token={token!} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

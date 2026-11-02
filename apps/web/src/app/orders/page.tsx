'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMyOrdersApi, OrdersApiError } from '@/features/orders/api';
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge';
import type { OrderDetail, OrderListResponse, OrderSummary } from '@/features/orders/types';
import { authSession } from '@/features/auth/session';

function toItems(response: OrderListResponse | OrderDetail[]) {
  return Array.isArray(response) ? response : response.items;
}

export default function OrdersHistoryPage() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const token = authSession.getToken();
    const request = token
      ? getMyOrdersApi(token)
      : Promise.reject(new Error('Vui lòng đăng nhập để xem lịch sử đơn hàng.'));

    request
      .then((response) => setOrders(toItems(response)))
      .catch((reason: unknown) => {
        if (reason instanceof OrdersApiError && reason.status === 401) {
          setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
          return;
        }
        setError(reason instanceof Error ? reason.message : 'Không thể tải lịch sử đơn hàng.');
      });
  }, [reloadKey]);

  return (
    <main className="min-h-screen bg-[#FBF8F3] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/menu" className="text-sm font-bold text-[#163D2C]">← Thực đơn</Link>
        <h1 className="mt-4 font-serif text-3xl font-black text-[#163D2C]">Đơn hàng của tôi</h1>
        <p className="mt-1 text-sm text-[#756A63]">Theo dõi trạng thái và xem lại các đơn đã đặt.</p>

        {!orders && !error && <div className="mt-6 rounded-2xl border border-[#E8DFC8] bg-white p-10 text-center text-sm font-semibold text-[#756A63]">Đang tải lịch sử đơn hàng...</div>}
        {error && <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700"><p>{error}</p><button type="button" onClick={() => { setError(null); setReloadKey((key) => key + 1); }} className="mt-4 rounded-full bg-[#163D2C] px-4 py-2 text-xs font-bold text-white">Thử lại</button></div>}
        {orders?.length === 0 && <div className="mt-6 rounded-2xl border border-[#E8DFC8] bg-white p-10 text-center"><p className="text-3xl">☕</p><h2 className="mt-3 font-serif text-xl font-black text-[#163D2C]">Bạn chưa có đơn hàng nào</h2><Link href="/menu" className="mt-5 inline-flex rounded-full bg-[#163D2C] px-5 py-2.5 text-sm font-bold text-white">Chọn món ngay</Link></div>}
        {orders && orders.length > 0 && <div className="mt-6 space-y-3">{orders.map((order) => <Link key={order.id} href={`/orders/${order.id}`} className="block rounded-2xl border border-[#E8DFC8] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-sm font-bold text-[#163D2C]">{order.orderNumber}</p><p className="mt-1 text-xs text-[#756A63]">{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.createdAt))}</p></div><OrderStatusBadge status={order.status} /></div><div className="mt-4 flex justify-between border-t border-[#EEE6DB] pt-3 text-sm"><span className="text-[#756A63]">Tổng tiền</span><strong className="font-mono text-[#163D2C]">{order.total.toLocaleString('vi-VN')} đ</strong></div></Link>)}</div>}
      </div>
    </main>
  );
}

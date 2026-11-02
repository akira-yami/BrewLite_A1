'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { getOrderDetailApi, OrdersApiError } from '@/features/orders/api';
import { OrderDetailView } from '@/features/orders/components/OrderDetailView';
import type { OrderDetail } from '@/features/orders/types';

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#FBF8F3] px-4 py-10 sm:px-6"><div className="mx-auto max-w-2xl rounded-2xl border border-[#E8DFC8] bg-white p-10 text-center text-sm font-semibold text-[#756A63]">Đang xác nhận đơn hàng...</div></main>}>
      <OrderConfirmationContent />
    </Suspense>
  );
}

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('brewlite_token');
    const request = !orderId || !token
      ? Promise.reject(new Error(!token ? 'Vui lòng đăng nhập để xem xác nhận đơn hàng.' : 'Không tìm thấy mã đơn hàng.'))
      : getOrderDetailApi(token, orderId);

    request
      .then(setOrder)
      .catch((reason: unknown) => {
        if (reason instanceof OrdersApiError && [403, 404].includes(reason.status)) {
          setError('Không tìm thấy đơn hàng hoặc bạn không có quyền xem đơn này.');
          return;
        }
        setError(reason instanceof Error ? reason.message : 'Không thể tải đơn hàng.');
      });
  }, [orderId, reloadKey]);

  return (
    <main className="min-h-screen bg-[#FBF8F3] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        {!order && !error && <LoadingCard message="Đang xác nhận đơn hàng..." />}
        {error && <ErrorCard message={error} onRetry={() => { setError(null); setReloadKey((key) => key + 1); }} />}
        {order && (
          <>
            <div className="mb-6 text-center">
              <p className="text-4xl">✓</p>
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[#B85D36]">Đặt hàng thành công</p>
              <h1 className="mt-1 font-serif text-3xl font-black text-[#163D2C]">Cảm ơn bạn đã chọn BrewLite</h1>
            </div>
            <OrderDetailView order={order} />
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Link href="/menu" className="rounded-full border border-[#D8CCBA] bg-white px-4 py-3 text-center text-sm font-bold text-[#163D2C]">Tiếp tục chọn món</Link>
              <Link href="/orders" className="rounded-full bg-[#163D2C] px-4 py-3 text-center text-sm font-bold text-white">Đơn hàng của tôi</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function LoadingCard({ message }: { message: string }) {
  return <div className="rounded-2xl border border-[#E8DFC8] bg-white p-10 text-center text-sm font-semibold text-[#756A63]">{message}</div>;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
      <h1 className="font-serif text-2xl font-black text-rose-900">Không thể mở xác nhận đơn</h1>
      <p className="mt-2 text-sm text-rose-700">{message}</p>
      <div className="mt-5 flex justify-center gap-3">
        <button type="button" onClick={onRetry} className="rounded-full bg-[#163D2C] px-5 py-2.5 text-sm font-bold text-white">Thử lại</button>
        <Link href="/orders" className="rounded-full border border-[#D8CCBA] bg-white px-5 py-2.5 text-sm font-bold text-[#163D2C]">Lịch sử đơn</Link>
      </div>
    </div>
  );
}

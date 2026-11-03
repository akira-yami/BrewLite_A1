'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getOrderDetailApi, OrdersApiError } from '@/features/orders/api';
import { OrderDetailView } from '@/features/orders/components/OrderDetailView';
import { useAuthSession } from '@/features/auth/use-auth-session';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { status, token } = useAuthSession();
  const query = useQuery({
    queryKey: ['order-detail', token, params.id],
    enabled: status === 'authenticated' && !!token && !!params.id,
    queryFn: () => getOrderDetailApi(token!, params.id!),
    retry: false,
  });
  const order = status === 'authenticated' ? query.data : undefined;
  const error = status === 'anonymous'
    ? 'Vui lòng đăng nhập để xem đơn hàng.'
    : !params.id
      ? 'Không tìm thấy mã đơn hàng.'
      : query.error instanceof OrdersApiError && [403, 404].includes(query.error.status)
        ? 'Không tìm thấy đơn hàng hoặc bạn không có quyền xem đơn này.'
        : query.error?.message;

  return (
    <main className="min-h-screen bg-[#FBF8F3] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/orders" className="text-sm font-bold text-[#163D2C]">← Lịch sử đơn hàng</Link>
        {!order && !error && <div className="mt-6 rounded-2xl border border-[#E8DFC8] bg-white p-10 text-center text-sm font-semibold text-[#756A63]">Đang tải chi tiết đơn hàng...</div>}
        {error && <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center"><h1 className="font-serif text-2xl font-black text-rose-900">Không thể mở đơn hàng</h1><p className="mt-2 text-sm text-rose-700">{error}</p><button type="button" onClick={() => { if (status === 'authenticated') void query.refetch(); }} className="mt-5 rounded-full bg-[#163D2C] px-5 py-2.5 text-sm font-bold text-white">Thử lại</button></div>}
        {order && <div className="mt-6"><OrderDetailView order={order} /></div>}
      </div>
    </main>
  );
}

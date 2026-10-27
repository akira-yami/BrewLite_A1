import type { OrderStatus } from '../types';

const labels: Record<OrderStatus, string> = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  PREPARING: 'Đang pha chế',
  READY: 'Sẵn sàng nhận món',
  COMPLETED: 'Hoàn tất',
  PAYMENT_FAILED: 'Thanh toán lỗi',
  CANCELLED: 'Đã hủy',
};

const tones: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  PAID: 'bg-sky-100 text-sky-800',
  PREPARING: 'bg-violet-100 text-violet-800',
  READY: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-[#E8F1EC] text-[#163D2C]',
  PAYMENT_FAILED: 'bg-rose-100 text-rose-800',
  CANCELLED: 'bg-stone-200 text-stone-700',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${tones[status]}`}>
      {labels[status]}
    </span>
  );
}

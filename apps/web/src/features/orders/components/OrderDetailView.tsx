import type { OrderDetail } from '../types';
import { OrderStatusBadge } from './OrderStatusBadge';

const formatVnd = (amount: number) => `${amount.toLocaleString('vi-VN')} đ`;

const formatPreference = (level: number | null) => level === null ? 'Công thức chuẩn' : `${level}%`;

export function OrderDetailView({ order }: { order: OrderDetail }) {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-[#E8DFC8] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#B85D36]">Mã đơn BrewLite</p>
            <h1 className="mt-1 font-serif text-3xl font-black text-[#163D2C]">{order.orderNumber}</h1>
            <p className="mt-2 text-sm text-[#756A63]">
              {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.createdAt))}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      <div className="rounded-2xl border border-[#E8DFC8] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-serif text-xl font-black text-[#163D2C]">Món trong đơn</h2>
        <div className="mt-4 divide-y divide-[#EEE6DB]">
          {order.items.map((item) => (
            <article key={item.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex justify-between gap-4">
                <div>
                  <h3 className="font-bold text-[#1A1612]">{item.productName}</h3>
                  <p className="mt-1 text-sm text-[#756A63]">Size {item.size} · {item.quantity} món</p>
                  <p className="mt-1 text-xs text-[#756A63]">Đường: {formatPreference(item.sugarLevel)} · Đá: {formatPreference(item.iceLevel)}</p>
                  {item.toppings.length > 0 && <p className="mt-1 text-xs text-[#756A63]">Topping: {item.toppings.map((topping) => topping.name).join(', ')}</p>}
                  {item.note && <p className="mt-1 text-xs italic text-[#756A63]">Ghi chú: {item.note}</p>}
                </div>
                <strong className="shrink-0 font-mono text-sm text-[#163D2C]">{formatVnd(item.lineTotal)}</strong>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#E8DFC8] bg-white p-5 shadow-sm sm:p-6">
        <div className="space-y-2 text-sm text-[#756A63]">
          <div className="flex justify-between"><span>Tạm tính</span><span>{formatVnd(order.subtotal)}</span></div>
          <div className="flex justify-between"><span>Khuyến mãi</span><span>-{formatVnd(order.discountAmount)}</span></div>
          <div className="flex justify-between border-t border-[#EEE6DB] pt-3 text-base font-black text-[#163D2C]"><span>Tổng tiền</span><span>{formatVnd(order.total)}</span></div>
        </div>
      </div>
    </section>
  );
}

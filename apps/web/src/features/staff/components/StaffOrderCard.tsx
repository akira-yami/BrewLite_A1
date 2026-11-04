import { StaffIcon } from "./StaffIcon";
import { OrderStatusBadge } from "../../orders/components/OrderStatusBadge";
import type { StaffColumn, StaffOrder } from "../types";

const formatVnd = (amount: number) => `${amount.toLocaleString("vi-VN")} đ`;
const formatLevel = (level: number | null) =>
  level === null ? "chuẩn" : `${level}%`;
const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeStyle: "short",
    dateStyle: "short",
  }).format(new Date(iso));

interface StaffOrderCardProps {
  order: StaffOrder;
  column: StaffColumn;
  busy: boolean;
  disabled: boolean;
  onAdvance: (order: StaffOrder, column: StaffColumn) => void;
}

export function StaffOrderCard({
  order,
  column,
  busy,
  disabled,
  onAdvance,
}: StaffOrderCardProps) {
  return (
    <article
      style={{
        borderTopColor:
          order.status === "PAID"
            ? "#C99C54"
            : order.status === "PREPARING"
              ? "#83966D"
              : "#5A9787",
      }}
      aria-label={`Đơn ${order.orderNumber}`}
      className="overflow-hidden rounded-xl border border-[#DEE3D8] border-t-[3px] bg-white p-5 shadow-[0_2px_6px_#163D2C05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="break-all font-mono text-sm font-bold text-[#163D2C]"
            title={order.orderNumber}
          >
            {order.orderNumber}
          </p>
          <p className="mt-1 text-xs text-[#756A63]">
            Vào quầy lúc {formatTime(order.updatedAt)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <ul className="mt-3 space-y-2 border-t border-[#EEE6DB] pt-3">
        {order.items.map((item) => (
          <li key={item.id} className="text-sm">
            <p className="font-bold text-[#1A1612]">
              {item.quantity} × {item.productName}{" "}
              <span className="font-medium text-[#756A63]">
                (size {item.size})
              </span>
            </p>
            <p className="mt-0.5 text-xs text-[#756A63]">
              Đường {formatLevel(item.sugarLevel)} · Đá{" "}
              {formatLevel(item.iceLevel)}
            </p>
            {item.toppings.length > 0 && (
              <p className="mt-0.5 text-xs text-[#756A63]">
                Topping:{" "}
                {item.toppings.map((topping) => topping.name).join(", ")}
              </p>
            )}
            {item.note && (
              <p className="mt-2 rounded-lg border-l-2 border-[#C69B61] bg-[#FBF5EA] px-3 py-2 text-xs text-[#856334]">
                Ghi chú: {item.note}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#EEE6DB] pt-3">
        <strong className="font-mono text-sm text-[#163D2C]">
          {formatVnd(order.total)}
        </strong>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => onAdvance(order, column)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#163D2C] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#0F2E21] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#163D2C] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Đang cập nhật…" : column.actionLabel}
          <StaffIcon
            name={column.nextStatus === "COMPLETED" ? "check" : "arrow"}
            width="15"
            height="15"
          />
        </button>
      </div>
    </article>
  );
}

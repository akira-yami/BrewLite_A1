import { useState } from "react";
import { StaffIcon } from "./StaffIcon";
import { OrderStatusBadge } from "../../orders/components/OrderStatusBadge";
import type { RefundDecision, StaffColumn, StaffOrder } from "../types";

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
  onReviewRefund: (order: StaffOrder, decision: RefundDecision) => void;
}

export function StaffOrderCard({
  order,
  column,
  busy,
  disabled,
  onAdvance,
  onReviewRefund,
}: StaffOrderCardProps) {
  const [decision, setDecision] = useState<RefundDecision['decision'] | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const pendingRefund = order.refundRequest?.status === "PENDING" ? order.refundRequest : null;

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
          disabled={disabled || busy || !!pendingRefund}
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
      {pendingRefund && (
        <section aria-label="Yêu cầu hoàn tiền đang chờ" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-bold">Yêu cầu hoàn tiền đang chờ</p>
          <p className="mt-1 text-xs">Tạm dừng nhận pha chế. Nếu duyệt, đơn sẽ bị hủy và khách nhận {pendingRefund.points.toLocaleString("vi-VN")} điểm Loyalty.</p>
          {decision ? (
            <form className="mt-3 space-y-3" onSubmit={(event) => {
              event.preventDefault();
              if (disabled) return;
              if (decision === "APPROVED") {
                onReviewRefund(order, { decision });
              } else if (rejectionReason.trim()) {
                onReviewRefund(order, { decision, reason: rejectionReason.trim() });
              }
            }}>
              {decision === "REJECTED" && (
                <label className="block text-xs font-bold">
                  Lý do từ chối gửi cho khách
                  <textarea required maxLength={255} disabled={disabled} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={2} className="mt-1 block w-full rounded-lg border border-amber-300 bg-white p-2 text-sm font-normal" />
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={disabled || (decision === "REJECTED" && !rejectionReason.trim())} className="rounded-lg bg-[#163D2C] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {busy ? "Đang xử lý…" : decision === "APPROVED" ? "Xác nhận hoàn điểm" : "Xác nhận từ chối"}
                </button>
                <button type="button" disabled={disabled} onClick={() => setDecision(null)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold disabled:opacity-50">Quay lại</button>
              </div>
            </form>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={disabled} onClick={() => setDecision("APPROVED")} className="rounded-lg bg-[#163D2C] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Duyệt hoàn điểm</button>
              <button type="button" disabled={disabled} onClick={() => setDecision("REJECTED")} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold disabled:opacity-50">Từ chối</button>
            </div>
          )}
        </section>
      )}
    </article>
  );
}

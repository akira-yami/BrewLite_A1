"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getStaffQueueApi,
  StaffApiError,
  updateStaffOrderStatusApi,
} from "../api";
import { STAFF_COLUMNS, type StaffColumn, type StaffOrder } from "../types";
import { StaffIcon } from "./StaffIcon";
import { StaffOrderCard } from "./StaffOrderCard";

const REFRESH_MS = 10_000;

function messageOf(error: unknown) {
  if (error instanceof StaffApiError && error.status === 403) {
    return "Tài khoản của bạn không có quyền dùng chức năng nhân viên.";
  }
  return error instanceof Error ? error.message : "Đã có lỗi xảy ra.";
}

export function BaristaBoard({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["staff-queue", token];
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const queue = useQuery({
    queryKey,
    queryFn: () => getStaffQueueApi(token),
    refetchInterval: REFRESH_MS,
    retry: false,
  });

  const advance = useMutation({
    mutationFn: ({
      order,
      column,
    }: {
      order: StaffOrder;
      column: StaffColumn;
    }) => updateStaffOrderStatusApi(token, order.id, column.nextStatus),
    onMutate: () => setActionError(null),
    onError: (error) => setActionError(messageOf(error)),
    // Thành công hay thất bại (ví dụ 409 do barista khác đã xử lý) đều nạp lại hàng đợi.
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const orders = queue.data ?? [];
  const pendingId = advance.isPending ? advance.variables?.order.id : null;

  return (
    <section aria-label="Hàng đợi pha chế">
      <div className="mb-7 grid grid-cols-3 gap-3 sm:gap-5">
        {STAFF_COLUMNS.map((column, index) => (
          <div
            key={column.status}
            className="rounded-2xl border border-[#DEE3D8] bg-white p-4 sm:p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6D786F] sm:text-xs">
                {column.title}
              </span>
              <span
                className={`hidden rounded-lg p-2 sm:block ${index === 0 ? "bg-[#F6EEDC] text-[#A27531]" : index === 1 ? "bg-[#E8EEE4] text-[#5E7950]" : "bg-[#E3EEEB] text-[#34786C]"}`}
              >
                <StaffIcon
                  name={
                    index === 0 ? "clock" : index === 1 ? "coffee" : "check"
                  }
                />
              </span>
            </div>
            <strong className="font-serif text-3xl font-semibold">
              {queue.data
                ? orders.filter((o) => o.status === column.status).length
                : "—"}
            </strong>
            <span className="ml-2 text-xs text-[#899087]">đơn</span>
          </div>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#DDE2D7] bg-white px-3 py-2.5 sm:max-w-sm">
          <StaffIcon
            name="search"
            width="17"
            height="17"
            className="shrink-0 text-[#8A9489]"
          />
          <input
            aria-label="Tìm mã đơn hoặc tên món"
            placeholder="Tìm mã đơn hoặc tên món…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="flex items-center gap-3">
          <p className="text-sm text-[#756A63]" role="status">
            {queue.isFetching
              ? "Đang đồng bộ…"
              : `Đồng bộ mỗi ${REFRESH_MS / 1000} giây`}
          </p>
          <button
            type="button"
            onClick={() => void queue.refetch()}
            disabled={queue.isFetching}
            className="rounded-full border border-[#D8CCBA] px-4 py-2 text-xs font-bold text-[#163D2C] transition hover:bg-white disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <StaffIcon name="refresh" width="14" height="14" />
              Làm mới
            </span>
          </button>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {actionError}
        </div>
      )}

      {queue.isPending && (
        <div className="mt-6 rounded-2xl border border-[#E8DFC8] bg-white p-10 text-center text-sm font-semibold text-[#756A63]">
          Đang tải hàng đợi…
        </div>
      )}

      {queue.isError && (
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700"
        >
          <p>{messageOf(queue.error)}</p>
          <button
            type="button"
            onClick={() => void queue.refetch()}
            className="mt-4 rounded-full bg-[#163D2C] px-4 py-2 text-xs font-bold text-white"
          >
            Thử lại
          </button>
        </div>
      )}

      {queue.isSuccess && (
        <div className="mt-6 grid gap-5 xl:grid-cols-3">
          {STAFF_COLUMNS.map((column) => {
            const term = search.trim().toLocaleLowerCase("vi");
            const columnOrders = orders.filter(
              (order) =>
                order.status === column.status &&
                (!term ||
                  order.orderNumber.toLowerCase().includes(term) ||
                  order.items.some((item) =>
                    item.productName.toLocaleLowerCase("vi").includes(term),
                  )),
            );
            return (
              <div
                key={column.status}
                className="rounded-2xl border border-[#DEE3D8] bg-[#ECEEE7]/60 p-3 sm:p-4"
              >
                <header className="flex items-baseline justify-between px-1 pb-3">
                  <div>
                    <h2 className="font-serif text-xl font-semibold text-[#163D2C]">
                      {column.title}
                    </h2>
                    <p className="text-xs text-[#756A63]">{column.hint}</p>
                  </div>
                  <span
                    aria-label={`${columnOrders.length} đơn`}
                    className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#163D2C]"
                  >
                    {columnOrders.length}
                  </span>
                </header>
                <div className="min-h-64 space-y-3">
                  {columnOrders.length === 0 && (
                    <p className="rounded-xl border border-dashed border-[#D8CCBA] p-6 text-center text-xs text-[#756A63]">
                      {search
                        ? "Không tìm thấy đơn phù hợp"
                        : "Quầy đang trống. Sẵn sàng cho đơn tiếp theo."}
                    </p>
                  )}
                  {columnOrders.map((order) => (
                    <StaffOrderCard
                      key={order.id}
                      order={order}
                      column={column}
                      busy={pendingId === order.id}
                      disabled={advance.isPending}
                      onAdvance={(target, targetColumn) =>
                        advance.mutate({ order: target, column: targetColumn })
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

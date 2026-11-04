"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getInventoryApi } from "../inventory-api";
import { StaffIcon } from "./StaffIcon";

const statusLabels = {
  IN_STOCK: "Còn hàng",
  LOW_STOCK: "Sắp hết",
  OUT_OF_STOCK: "Hết hàng",
};
const unitLabels = { G: "g", ML: "ml", PCS: "cái" };
const fieldClass =
  "w-full rounded-xl border border-[#DDE2D7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#527353]";

export function InventoryPanel({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState<string>();
  const inventory = useQuery({
    queryKey: ["staff-inventory", token, q, status, cursor],
    queryFn: () => getInventoryApi(token, { q, status, cursor }),
    retry: false,
    refetchInterval: 15000,
  });
  return (
    <section aria-label="Theo dõi kho nguyên liệu">
      <div className="mb-6 rounded-2xl border border-[#DEE3D8] bg-[#EDF1E7] p-5">
        <h2 className="font-serif text-xl font-semibold">
          Một ca làm chủ động
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#6B7867]">
          Barista chỉ được xem tồn kho. Số lượng được hệ thống cập nhật theo
          luồng đặt đơn. Ngưỡng sắp hết: ≤ 500 g, 1.000 ml hoặc 10 cái. Số lượng
          bằng 0 là hết hàng.
        </p>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form
          className="flex min-w-0 flex-1 gap-2 sm:max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(search.trim());
            setCursor(undefined);
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#DDE2D7] bg-white px-3">
            <StaffIcon name="search" width="17" height="17" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
              placeholder="Tên hoặc mã nguyên liệu…"
              aria-label="Tìm nguyên liệu"
              className="w-full min-w-0 py-2.5 text-sm outline-none"
            />
          </label>
          <button className="rounded-xl bg-[#163D2C] px-4 text-sm font-semibold text-white">
            Tìm
          </button>
        </form>
        <select
          aria-label="Lọc trạng thái kho"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setCursor(undefined);
          }}
          className={`${fieldClass} sm:w-auto`}
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={inventory.isFetching}
          onClick={() => void inventory.refetch()}
          className="flex items-center gap-2 rounded-xl border border-[#DDE2D7] px-4 py-2.5 text-sm disabled:opacity-50"
        >
          <StaffIcon name="refresh" width="16" height="16" />
          Làm mới
        </button>
      </div>
      {inventory.isPending && (
        <p
          role="status"
          className="rounded-2xl bg-white p-10 text-center text-sm text-[#6D786F]"
        >
          Đang tải nguyên liệu…
        </p>
      )}
      {inventory.isError && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700"
        >
          <p>{inventory.error.message}</p>
          <button
            onClick={() => void inventory.refetch()}
            className="mt-3 font-bold underline"
          >
            Thử lại
          </button>
        </div>
      )}
      {inventory.data && (
        <div className="overflow-hidden rounded-2xl border border-[#DEE3D8] bg-white">
          <div className="flex justify-between border-b border-[#E5E8E0] px-5 py-4">
            <h2 className="text-sm font-bold">Danh sách nguyên liệu</h2>
            <span className="text-xs text-[#7B847B]">
              {inventory.data.data.length} nguyên liệu trên trang
            </span>
          </div>
          {inventory.data.data.length === 0 ? (
            <p className="p-12 text-center text-sm text-[#7B847B]">
              Không có nguyên liệu phù hợp.
            </p>
          ) : (
            <ul className="divide-y divide-[#EDF0E9]">
              {inventory.data.data.map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-5 sm:flex sm:gap-6"
                >
                  <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F1F3ED] text-[#698060] sm:flex">
                    <StaffIcon name="box" />
                  </span>
                  <div className="col-span-2 min-w-0 flex-1 sm:col-span-1">
                    <h3 className="break-words text-sm font-semibold">
                      {item.name}
                    </h3>
                    <p className="mt-1 text-[11px] text-[#889183]">
                      {item.code}
                      {!item.isActive && " · Ngừng sử dụng"}
                    </p>
                  </div>
                  <span className="min-w-20 text-left font-mono sm:text-right text-sm font-semibold">
                    {item.stockQuantity.toLocaleString("vi-VN")}{" "}
                    <span className="font-sans text-xs font-normal text-[#7B847B]">
                      {unitLabels[item.unit]}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${item.status === "IN_STOCK" ? "bg-[#EDF3E8] text-[#507141]" : item.status === "LOW_STOCK" ? "bg-[#FBF0DB] text-[#956827]" : "bg-rose-50 text-rose-700"}`}
                  >
                    {statusLabels[item.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between border-t border-[#E5E8E0] px-5 py-4 text-xs">
            <button
              type="button"
              disabled={!cursor}
              onClick={() => setCursor(undefined)}
              className="font-semibold disabled:opacity-30"
            >
              Về trang đầu
            </button>
            <button
              type="button"
              disabled={!inventory.data.meta.nextCursor}
              onClick={() =>
                setCursor(inventory.data.meta.nextCursor ?? undefined)
              }
              className="font-semibold disabled:opacity-30"
            >
              Trang tiếp →
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

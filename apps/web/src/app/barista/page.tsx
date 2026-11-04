"use client";

import Link from "next/link";
import { useState } from "react";
import { authSession } from "@/features/auth/session";
import { getMeApi } from "@/features/auth/api";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { BaristaBoard } from "@/features/staff/components/BaristaBoard";
import { InventoryPanel } from "@/features/staff/components/InventoryPanel";
import { StaffIcon } from "@/features/staff/components/StaffIcon";

export default function BaristaPage() {
  const { status, token, user } = useAuthSession();
  const [tab, setTab] = useState<"orders" | "inventory">("orders");
  const isBarista =
    status === "authenticated" && !!token && user?.role === "BARISTA";
  return (
    <main className="min-h-screen bg-[#F5F4EF] text-[#243C31]">
      <header className="bg-[#163D2C] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-9">
          <Link
            href="/barista"
            className="flex items-center gap-3"
            aria-label="BrewLite — Khu vực nhân viên"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10">
              <StaffIcon name="coffee" />
            </span>
            <span className="font-serif text-2xl font-bold tracking-tight">
              BrewLite
              <span className="ml-2 font-sans text-[10px] font-semibold uppercase tracking-[.2em] text-[#D6DDBB]">
                workspace
              </span>
            </span>
          </Link>
          {status === "authenticated" && (
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D6DDBB] text-xs font-bold text-[#163D2C]">
                  {user?.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-36 truncate">{user?.username}</span>
              </span>
              <button
                type="button"
                onClick={() => authSession.logout()}
                className="flex items-center gap-2 border-l border-white/20 pl-4 text-xs text-white/80 hover:text-white"
              >
                <StaffIcon name="logout" width="16" height="16" />
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-9 sm:py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[.25em] text-[#8B7556]">
              Một ly ngon, một ngày tốt lành
            </p>
            <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              {tab === "orders" ? "Quầy pha chế" : "Kho nguyên liệu"}
            </h1>
            <p className="mt-2 text-sm text-[#6D786F]">
              {tab === "orders"
                ? "Nhận đơn, chăm chút từng ly và sẵn sàng trao tay."
                : "Theo dõi nguyên liệu, chủ động cho mỗi ca làm việc."}
            </p>
          </div>
          {isBarista && (
            <span className="inline-flex items-center gap-2 rounded-full border border-[#D8E1D5] bg-[#EAF0E5] px-3 py-2 text-xs font-medium text-[#426343]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#6B8D50]" />
              Khu vực nhân viên
            </span>
          )}
        </div>
        {isBarista && token ? (
          <>
            <nav
              aria-label="Chức năng nhân viên"
              className="mb-7 flex gap-6 border-b border-[#DDE1D8]"
            >
              {(
                [
                  { id: "orders", label: "Hàng đợi đơn", icon: "coffee" },
                  { id: "inventory", label: "Kho nguyên liệu", icon: "box" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={tab === item.id ? "page" : undefined}
                  onClick={() => setTab(item.id)}
                  className={`flex items-center gap-2 border-b-2 pb-4 text-sm font-semibold transition ${tab === item.id ? "border-[#234D36] text-[#234D36]" : "border-transparent text-[#788078] hover:text-[#234D36]"}`}
                >
                  <StaffIcon name={item.icon} width="18" height="18" />
                  {item.label}
                </button>
              ))}
            </nav>
            {tab === "orders" ? (
              <BaristaBoard token={token} />
            ) : (
              <InventoryPanel token={token} />
            )}
          </>
        ) : (
          <section className="rounded-2xl border border-[#DEE3D7] bg-white px-6 py-14 text-center text-sm text-[#6D786F]">
            {status === "loading" && (
              <p role="status">Đang kiểm tra phiên đăng nhập…</p>
            )}
            {status === "error" && (
              <>
                <p>Không thể kiểm tra phiên đăng nhập.</p>
                <button
                  onClick={() => void authSession.restore(getMeApi)}
                  className="mt-4 font-bold text-[#163D2C] underline"
                >
                  Thử lại
                </button>
              </>
            )}
            {status === "anonymous" && (
              <>
                <p>
                  Vui lòng đăng nhập bằng tài khoản nhân viên để bắt đầu ca làm.
                </p>
                <Link
                  href="/login"
                  className="mt-5 inline-flex rounded-xl bg-[#163D2C] px-6 py-3 font-semibold text-white"
                >
                  Đăng nhập
                </Link>
              </>
            )}
            {status === "authenticated" && (
              <>
                <p role="alert">
                  Bạn không có quyền truy cập khu vực nhân viên.
                </p>
                <Link
                  href="/menu"
                  className="mt-5 inline-flex font-semibold text-[#163D2C] underline"
                >
                  Về thực đơn
                </Link>
              </>
            )}
          </section>
        )}
        <footer className="mt-10 flex flex-wrap justify-between gap-2 border-t border-[#E0E3DA] pt-5 text-[11px] text-[#7B847B]">
          <span>BrewLite · Chăm chút trong từng lựa chọn</span>
          <span>Không gian làm việc dành cho Barista</span>
        </footer>
      </div>
    </main>
  );
}

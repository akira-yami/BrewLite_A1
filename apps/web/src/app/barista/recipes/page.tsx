"use client";

import Link from "next/link";
import { getMeApi } from "@/features/auth/api";
import { authSession } from "@/features/auth/session";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { RecipesPanel } from "@/features/staff/components/RecipesPanel";

export default function RecipesPage() {
  const { status, token, user } = useAuthSession();
  const allowed =
    status === "authenticated" && token && user?.role === "BARISTA";

  return (
    <main className="min-h-screen bg-[#F5F4EF] px-5 py-8 text-[#243C31] sm:px-9 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/barista" className="text-sm font-semibold underline">
          ← Quầy pha chế
        </Link>
        <header className="mb-7 mt-6">
          <h1 className="font-serif text-3xl font-semibold sm:text-4xl">
            Công thức đồ uống
          </h1>
          <p className="mt-3 text-sm text-[#6D786F]">
            Tra cứu định lượng chuẩn cho một ly theo từng cỡ và cho một phần
            topping.
          </p>
        </header>

        {allowed && <RecipesPanel token={token} />}
        {status === "loading" && (
          <p role="status">Đang kiểm tra phiên đăng nhập…</p>
        )}
        {status === "error" && (
          <div role="alert" className="rounded-2xl bg-white p-6 text-sm">
            <p>Không thể kiểm tra phiên đăng nhập.</p>
            <button
              type="button"
              onClick={() => void authSession.restore(getMeApi)}
              className="mt-3 font-semibold underline"
            >
              Thử lại
            </button>
          </div>
        )}
        {status === "anonymous" && (
          <div className="rounded-2xl bg-white p-6 text-sm">
            <p>Vui lòng đăng nhập bằng tài khoản Barista để xem công thức.</p>
            <Link
              href="/login"
              className="mt-3 inline-block font-semibold underline"
            >
              Đăng nhập
            </Link>
          </div>
        )}
        {status === "authenticated" && !allowed && (
          <p role="alert" className="rounded-2xl bg-white p-6 text-sm">
            Bạn không có quyền xem công thức đồ uống.
          </p>
        )}
      </div>
    </main>
  );
}

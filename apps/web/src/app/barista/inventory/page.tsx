"use client";
import Link from 'next/link';
import { useAuthSession } from '@/features/auth/use-auth-session';
import { InventoryPanel } from '@/features/staff/components/InventoryPanel';

export default function InventoryPage() {
  const { status, token, user } = useAuthSession();
  const allowed = status === 'authenticated' && user?.role === 'BARISTA';
  return <main className="min-h-screen bg-[#F5F4EF] px-5 py-8 text-[#243C31] sm:px-9">
    <div className="mx-auto max-w-6xl">
      <Link href="/barista" className="text-sm font-semibold underline">← Quầy pha chế</Link>
      <h1 className="mb-3 mt-6 font-serif text-4xl font-semibold">Kho nguyên liệu</h1>
      <p className="mb-7 text-sm text-[#6D786F]">Theo dõi nguyên liệu cho mỗi ca làm việc. Barista chỉ có quyền xem.</p>
      {allowed && token ? <InventoryPanel token={token} /> : status === 'loading' ? <p role="status">Đang kiểm tra phiên…</p> : <div role="alert" className="rounded-2xl bg-white p-8"><p>Bạn cần đăng nhập bằng tài khoản Barista để xem kho.</p><Link href="/login" className="mt-4 inline-block underline">Đăng nhập</Link></div>}
    </div>
  </main>;
}

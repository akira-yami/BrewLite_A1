'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthApiError } from '@/features/auth/api';
import { getMeApi } from '@/features/auth/api';
import { authSession } from '@/features/auth/session';
import { useAuthSession } from '@/features/auth/use-auth-session';
import { getLoyaltyOverview, getLoyaltyTiers, redeemLoyalty } from '@/features/loyalty/api';
import type { LoyaltyOverview, LoyaltyTier } from '@/features/loyalty/types';
import { readPendingLoyaltyRedeem, writePendingLoyaltyRedeem, writePreferredLoyaltyCoupon } from '@/features/checkout/session';
import { formatVnd } from '@/stores/cart-store';

export default function LoyaltyPage() {
  const session = useAuthSession();
  const router = useRouter();
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [overview, setOverview] = useState<LoyaltyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void getLoyaltyTiers().then(setTiers).catch(() => setError('Không thể tải các gói đổi điểm.'));
  }, []);

  useEffect(() => {
    if (session.status !== 'authenticated' || session.user?.role !== 'CUSTOMER') return;
    void getLoyaltyOverview()
      .then((data) => setOverview(data))
      .catch(() => setError('Không thể tải thông tin điểm thưởng.'));
  }, [session.status, session.user?.role]);

  const redeem = async (tier: LoyaltyTier) => {
    if (!session.user || session.user.role !== 'CUSTOMER' || busyTier) return;
    setError(null);
    setNotice(null);
    setBusyTier(tier.tierId);
    const userId = session.user.id;
    const key = typeof window === 'undefined' ? null :
      readPendingLoyaltyRedeem(window.sessionStorage, userId, tier.tierId) ?? crypto.randomUUID();
    if (!key) {
      setBusyTier(null);
      setError('Không thể tạo mã yêu cầu đổi điểm. Vui lòng thử lại.');
      return;
    }
    writePendingLoyaltyRedeem(window.sessionStorage, userId, tier.tierId, key);
    let redeemedCode: string | null = null;
    try {
      const result = await redeemLoyalty(tier.tierId, key);
      redeemedCode = result.coupon.code;
      writePendingLoyaltyRedeem(window.sessionStorage, userId, tier.tierId, null);
      setNotice(`Đã đổi ${tier.pointsCost.toLocaleString('vi-VN')} điểm. Mã voucher: ${result.coupon.code}`);
      try {
        setOverview(await getLoyaltyOverview());
        await authSession.restore(getMeApi);
      } catch {
        setError(`Đã đổi voucher ${result.coupon.code}, nhưng chưa tải lại được số dư. Hãy tải lại trang để đồng bộ.`);
      }
    } catch (reason) {
      const status = reason instanceof AuthApiError ? reason.status : (reason as { status?: number })?.status;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        writePendingLoyaltyRedeem(window.sessionStorage, userId, tier.tierId, null);
      }
      setError(redeemedCode
        ? `Đã đổi voucher ${redeemedCode}, nhưng có lỗi khi đồng bộ dữ liệu. Hãy tải lại trang.`
        : reason instanceof Error ? reason.message : 'Đổi điểm chưa hoàn tất. Có thể thử lại an toàn.');
    } finally {
      setBusyTier(null);
    }
  };

  const applyCouponFromLoyalty = (code: string) => {
    writePreferredLoyaltyCoupon(window.sessionStorage, code);
    router.push('/menu');
  };

  const copyCoupon = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(`Đã sao chép mã ${code}.`);
    } catch {
      setNotice(`Mã voucher: ${code}`);
    }
  };

  const isCustomer = session.status === 'authenticated' && session.user?.role === 'CUSTOMER';
  const isBarista = session.status === 'authenticated' && session.user?.role === 'BARISTA';

  return (
    <main className="min-h-screen bg-[#FBF8F3] px-4 py-10 text-[#1A1612] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/menu" className="text-sm font-semibold text-[#163E2B] hover:underline">← Quay lại thực đơn</Link>
        <section className="mt-6 rounded-3xl bg-[#163E2B] p-7 text-white shadow-lg sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#D9C9A8]">BrewLite Rewards</p>
          <h1 className="mt-2 font-serif text-4xl font-bold">Điểm thưởng & voucher</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">Tích 1 điểm cho mỗi 10đ thanh toán thực tế. Đổi điểm lấy voucher giảm trực tiếp cho đơn hàng đủ điều kiện.</p>
          {isCustomer && <p className="mt-5 text-2xl font-black">{(overview?.pointsBalance ?? session.user?.loyaltyBalance ?? 0).toLocaleString('vi-VN')} điểm</p>}
        </section>

        {isBarista && <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Tài khoản nhân viên chỉ xem được danh mục thưởng; dữ liệu điểm khách hàng không khả dụng.</p>}
        {session.status === 'anonymous' && <p className="mt-6 rounded-xl bg-white p-4 text-sm shadow-sm">Đăng nhập bằng tài khoản CUSTOMER để xem số dư, voucher và lịch sử. <Link className="font-bold text-[#163E2B] underline" href="/login">Đăng nhập</Link></p>}
        {notice && <p role="status" className="mt-5 rounded-xl bg-[#E8F1EC] p-4 text-sm font-semibold text-[#163E2B]">{notice}</p>}
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}

        <section className="mt-9">
          <h2 className="text-2xl font-black text-[#163E2B]">Các gói thưởng</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((tier, index) => {
              const balance = overview?.pointsBalance ?? session.user?.loyaltyBalance ?? 0;
              const hasEnough = isCustomer && balance >= tier.pointsCost;
              const nextTier = tiers[index + 1];
              const progress = isCustomer && nextTier
                ? Math.min(100, Math.floor((balance / nextTier.pointsCost) * 100))
                : 0;
              return (
                <article key={tier.tierId} className="flex flex-col rounded-2xl border border-[#E5DCD2] bg-white p-5 shadow-sm">
                  <p className="text-sm font-bold text-[#756A63]">Đổi {tier.pointsCost.toLocaleString('vi-VN')} điểm</p>
                  <p className="mt-2 text-2xl font-black text-[#163E2B]">-{formatVnd(tier.discountAmount)}</p>
                  <p className="mt-1 text-xs text-[#756A63]">Đơn tối thiểu {formatVnd(tier.minOrderValue)}</p>
                  {isCustomer && nextTier && <div className="mt-4"><div className="h-2 overflow-hidden rounded-full bg-[#E8F1EC]"><div className="h-full bg-[#4B8064]" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-[11px] text-[#756A63]">Tiến độ gói tiếp theo: {progress}%</p></div>}
                  {isCustomer && <button type="button" disabled={!hasEnough || busyTier !== null} onClick={() => void redeem(tier)} className="mt-auto rounded-full bg-[#163E2B] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-stone-300">{busyTier === tier.tierId ? 'Đang đổi…' : hasEnough ? 'Đổi điểm' : 'Chưa đủ điểm'}</button>}
                </article>
              );
            })}
          </div>
        </section>

        {isCustomer && <section className="mt-10 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-black text-[#163E2B]">Voucher của bạn</h2>
            {!overview ? <p className="mt-3 text-sm text-[#756A63]">Đang tải voucher…</p> : overview.availableCoupons.length === 0 ? <p className="mt-3 rounded-xl bg-white p-4 text-sm text-[#756A63]">Chưa có voucher khả dụng.</p> : <ul className="mt-4 space-y-3">{overview.availableCoupons.map((coupon) => <li key={coupon.code} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm"><div><strong className="font-mono text-[#163E2B]">{coupon.code}</strong><p className="mt-1 text-xs text-[#756A63]">Giảm {formatVnd(coupon.discountAmount)} · đơn từ {formatVnd(coupon.minOrderValue)} · hết hạn {new Date(coupon.endsAt).toLocaleDateString('vi-VN')}</p></div><div className="flex gap-2"><button onClick={() => void copyCoupon(coupon.code)} className="rounded-full border border-[#D8CCBA] px-3 py-2 text-xs font-bold">Sao chép</button><button onClick={() => applyCouponFromLoyalty(coupon.code)} className="rounded-full bg-[#163E2B] px-3 py-2 text-xs font-bold text-white">Dùng voucher</button></div></li>)}</ul>}
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#163E2B]">Lịch sử điểm</h2>
            <ul className="mt-4 divide-y divide-[#E5DCD2] rounded-xl bg-white px-4 shadow-sm">{overview?.transactions.map((transaction, index) => <li key={`${transaction.createdAt}-${index}`} className="flex justify-between gap-3 py-3 text-sm"><span><strong>{transaction.reason}</strong><span className="block text-xs text-[#756A63]">{new Date(transaction.createdAt).toLocaleString('vi-VN')}{transaction.orderNumber ? ` · ${transaction.orderNumber}` : ''}</span></span><span className="whitespace-nowrap font-bold text-[#163E2B]">{transaction.points > 0 && transaction.type === 'EARN' ? '+' : '-'}{transaction.points.toLocaleString('vi-VN')}<small className="ml-1">điểm</small></span></li>)}</ul>
          </div>
        </section>}
      </div>
    </main>
  );
}

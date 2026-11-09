'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CartItem, cartStore, formatVnd, useCartStore } from '@/stores/cart-store';
import { CouponApiError, validateCoupon } from '@/api/coupons.api';
import { readCheckoutCoupon, writeCheckoutCoupon, type CheckoutCouponQuote } from '@/features/checkout/session';
import { AuthApiError, getMeApi } from '@/features/auth/api';
import { authSession } from '@/features/auth/session';
import { useAuthSession } from '@/features/auth/use-auth-session';
import { getLoyaltyOverview, getLoyaltyTiers, redeemLoyalty } from '@/features/loyalty/api';
import type { LoyaltyOverview, LoyaltyTier } from '@/features/loyalty/types';
import { chooseQuickRedeemTier } from '@/features/loyalty/cart';
import { readPendingLoyaltyRedeem, readPreferredLoyaltyCoupon, writePendingLoyaltyRedeem, writePreferredLoyaltyCoupon } from '@/features/checkout/session';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  onEditOptions: (item: CartItem) => void;
  onCheckout: (coupon: CheckoutCouponQuote | null) => void;
}

export function CartDrawer({
  open,
  onClose,
  onEditOptions,
  onCheckout,
}: CartDrawerProps) {
  const { items, subtotal, totalQuantity } = useCartStore();
  const session = useAuthSession();

  const [couponInput, setCouponInput] = useState('');
  // Lưu subtotal đã được backend xác nhận cùng với coupon để nhận biết quote đã cũ.
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    subtotal: number;
    discountAmount: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const applyingRef = useRef(false);
  const lastAutoAttempt = useRef('');
  const [loyaltyOverview, setLoyaltyOverview] = useState<LoyaltyOverview | null>(null);
  const [loyaltyTiers, setLoyaltyTiers] = useState<LoyaltyTier[]>([]);
  const [loyaltyMessage, setLoyaltyMessage] = useState<string | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => {
    if (!open || session.status !== 'authenticated' || session.user?.role !== 'CUSTOMER') return;
    let active = true;
    void Promise.all([getLoyaltyOverview(), getLoyaltyTiers()]).then(([overview, tiers]) => {
      if (!active) return;
      setLoyaltyOverview(overview);
      setLoyaltyTiers(tiers);
    }).catch(() => {
      if (active) setLoyaltyMessage('Không thể tải điểm thưởng hoặc voucher lúc này.');
    });
    return () => { active = false; };
  }, [open, session.status, session.user?.role]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const savedQuote = readCheckoutCoupon(window.sessionStorage);
      if (savedQuote && savedQuote.subtotal === cartStore.getSnapshot().subtotal) {
        setAppliedCoupon(savedQuote);
      } else if (savedQuote) {
        writeCheckoutCoupon(window.sessionStorage, null);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      typeof window !== 'undefined'
      && appliedCoupon
      && appliedCoupon.subtotal !== subtotal
    ) {
      writeCheckoutCoupon(window.sessionStorage, null);
    }
  }, [appliedCoupon, subtotal]);

  // Không dùng effect để đồng bộ state: quote chỉ được áp dụng khi subtotal vẫn khớp.
  const couponIsStale = appliedCoupon !== null && appliedCoupon.subtotal !== subtotal;
  const visibleCoupon = couponIsStale ? null : appliedCoupon;
  const effectiveDiscountAmount = visibleCoupon?.discountAmount ?? 0;
  const visibleCouponError = couponError
    ?? (couponIsStale ? 'Giỏ hàng thay đổi, vui lòng áp dụng lại mã giảm giá.' : null);

  const handleApplyCoupon = useCallback(async (codeOverride?: string) => {
    if (applyingRef.current) return;
    setCouponError(null);
    const requestedCode = (codeOverride ?? couponInput).trim();
    if (!requestedCode) {
      setCouponError('Vui lòng nhập mã giảm giá.');
      return;
    }

    const requestedSubtotal = subtotal;
    applyingRef.current = true;
    setIsApplying(true);
    try {
      const data = await validateCoupon(requestedCode, requestedSubtotal);
      if (cartStore.getSnapshot().subtotal !== requestedSubtotal) {
        setCouponError('Giỏ hàng đã thay đổi trong lúc kiểm tra. Vui lòng áp dụng lại mã giảm giá.');
        return;
      }

      const quote = {
        code: requestedCode,
        subtotal: requestedSubtotal,
        discountAmount: data.discountAmount,
      };
      setAppliedCoupon(quote);
      if (typeof window !== 'undefined') {
        writeCheckoutCoupon(window.sessionStorage, quote);
        if (readPreferredLoyaltyCoupon(window.sessionStorage) === requestedCode) {
          writePreferredLoyaltyCoupon(window.sessionStorage, null);
        }
      }
      setCouponInput('');
    } catch (reason: unknown) {
      if (reason instanceof CouponApiError) {
        if (reason.status === 401) {
          setCouponError('Vui lòng đăng nhập để kiểm tra mã giảm giá.');
        } else if (reason.code === 'COUPON_NOT_APPLICABLE') {
          setCouponError('Mã giảm giá không hợp lệ, đã hết hạn hoặc chưa đủ điều kiện áp dụng.');
        } else if (reason.status === 0 || reason.status >= 500) {
          setCouponError('Dịch vụ mã giảm giá đang gặp sự cố. Vui lòng thử lại.');
        } else {
          setCouponError(
            reason.message && !/^[A-Z][A-Z0-9_]+$/.test(reason.message)
              ? reason.message
              : 'Không thể áp dụng mã giảm giá. Vui lòng kiểm tra lại mã.',
          );
        }
      } else {
        setCouponError('Không thể kết nối đến dịch vụ mã giảm giá. Vui lòng thử lại.');
      }
      setAppliedCoupon(null);
      if (typeof window !== 'undefined') {
        writeCheckoutCoupon(window.sessionStorage, null);
      }
    } finally {
      applyingRef.current = false;
      setIsApplying(false);
    }
  }, [couponInput, subtotal]);

  useEffect(() => {
    if (!open || typeof window === 'undefined' || !loyaltyOverview) return;
    const preferredCode = readPreferredLoyaltyCoupon(window.sessionStorage);
    if (!preferredCode) return;
    const coupon = loyaltyOverview.availableCoupons.find((item) => item.code === preferredCode);
    if (!coupon || subtotal < coupon.minOrderValue) return;
    const attempt = `${preferredCode}:${subtotal}`;
    if (lastAutoAttempt.current === attempt) return;
    lastAutoAttempt.current = attempt;
    setCouponInput(preferredCode);
    void handleApplyCoupon(preferredCode);
  }, [open, subtotal, loyaltyOverview, handleApplyCoupon]);

  const applyStoredVoucher = (code: string, minOrderValue: number) => {
    setCouponError(null);
    if (subtotal < minOrderValue) {
      writePreferredLoyaltyCoupon(window.sessionStorage, code);
      setCouponError(`Đã lưu mã ${code}. Thêm món để đạt tối thiểu ${formatVnd(minOrderValue)}; mã sẽ được kiểm tra lại khi đủ điều kiện.`);
      return;
    }
    setCouponInput(code);
    void handleApplyCoupon(code);
  };

  const handleQuickRedeem = async () => {
    const user = session.user;
    if (!user || user.role !== 'CUSTOMER' || isRedeeming || typeof window === 'undefined') return;
    const balance = loyaltyOverview?.pointsBalance ?? user.loyaltyBalance;
    const tier = chooseQuickRedeemTier(loyaltyTiers, balance, subtotal);
    if (!tier) return;
    setIsRedeeming(true);
    setLoyaltyMessage(null);
    let key = readPendingLoyaltyRedeem(window.sessionStorage, user.id, tier.tierId);
    if (!key) {
      key = crypto.randomUUID();
      writePendingLoyaltyRedeem(window.sessionStorage, user.id, tier.tierId, key);
    }
    let redeemedCode: string | null = null;
    try {
      const result = await redeemLoyalty(tier.tierId, key);
      redeemedCode = result.coupon.code;
      writePendingLoyaltyRedeem(window.sessionStorage, user.id, tier.tierId, null);
      const updated = await getLoyaltyOverview();
      setLoyaltyOverview(updated);
      await authSession.restore(getMeApi);
      try {
        const quote = await validateCoupon(result.coupon.code, subtotal);
        if (cartStore.getSnapshot().subtotal !== subtotal) throw new Error('Giỏ hàng đã thay đổi.');
        const applied = { code: result.coupon.code, subtotal, discountAmount: quote.discountAmount };
        setAppliedCoupon(applied);
        writeCheckoutCoupon(window.sessionStorage, applied);
        setLoyaltyMessage(`Đã đổi nhanh và áp dụng voucher ${result.coupon.code}.`);
      } catch {
        setLoyaltyMessage(`Đã đổi voucher ${result.coupon.code}. Voucher vẫn ở trong kho; hãy chọn “Dùng voucher” khi giỏ đạt giá trị tối thiểu.`);
      }
    } catch (reason) {
      const status = reason instanceof AuthApiError ? reason.status : (reason as { status?: number })?.status;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        writePendingLoyaltyRedeem(window.sessionStorage, user.id, tier.tierId, null);
      }
      setLoyaltyMessage(redeemedCode
        ? `Đã đổi voucher ${redeemedCode}; không tải được điểm mới. Hãy tải lại trang, voucher vẫn nằm trong kho.`
        : 'Đổi điểm chưa hoàn tất. Bạn có thể thử lại an toàn; nếu voucher đã được tạo, lần gửi lại sẽ trả kết quả cũ.');
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    if (typeof window !== 'undefined') {
      writeCheckoutCoupon(window.sessionStorage, null);
    }
  };

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/55 backdrop-blur-sm transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[420px] flex-col border-l border-[#E5DCD2] bg-white shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Giỏ hàng BrewLite"
      >
        <div className="flex items-center justify-between border-b border-[#E5DCD2] px-5 py-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#756A63]">
              BrewLite Cart
            </p>
            <h2 className="text-lg font-black text-[#163E2B]">Giỏ hàng của bạn</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E5DCD2] bg-[#FAF6F2] text-sm font-black text-[#4A3E36] transition hover:bg-white hover:text-[#163E2B]"
            aria-label="Đóng giỏ hàng"
          >
            x
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E8F1EC] text-2xl">
              ☕
            </div>
            <h3 className="text-base font-black text-[#163E2B]">Giỏ hàng đang trống</h3>
            <p className="mt-2 text-sm leading-6 text-[#756A63]">
              Chọn một món trong menu, tùy biến size, topping, đường và đá rồi thêm vào giỏ để tiếp tục đặt hàng.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-full bg-[#163E2B] px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#1f4f38]"
            >
              Xem thực đơn
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {items.map((item) => {
                const toppingsTotal = item.toppings.reduce((sum, topping) => sum + topping.price, 0);

                return (
                  <article
                    key={item.id}
                    className="grid grid-cols-[88px_1fr] gap-3 rounded-2xl border border-[#E5DCD2] bg-[#FAF6F2] p-3 shadow-sm"
                  >
                    <div className="relative h-[88px] overflow-hidden rounded-xl bg-white">
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="72px"
                      />
                    </div>

                    <div className="min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="line-clamp-1 text-sm font-black text-[#1E1813]">
                            {item.name}
                          </h3>
                          <p className="text-[11px] font-semibold text-[#756A63]">
                            Size {item.size} • {formatVnd(item.unitPrice + toppingsTotal)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => cartStore.removeItem(item.id)}
                          className="shrink-0 text-[11px] font-bold text-[#9f3f2f] hover:underline"
                        >
                          Xóa
                        </button>
                      </div>

                      <p className="text-[11px] leading-5 text-[#756A63]">
                        Đường: {item.sugarLevel === null ? 'Theo công thức chuẩn' : `${item.sugarLevel}%`}
                        {' • '}Đá: {item.iceLevel === null ? 'Theo công thức chuẩn' : `${item.iceLevel}%`}
                      </p>

                      <button
                        type="button"
                        onClick={() => onEditOptions(item)}
                        className="inline-flex w-fit items-center gap-2 rounded-full bg-[#E8F1EC] px-3 py-1.5 text-[11px] font-black text-[#163E2B] transition hover:bg-[#dcebe3]"
                      >
                        <span aria-hidden="true">⚙</span>
                        <span>Sửa tùy chọn</span>
                        <span aria-hidden="true">›</span>
                      </button>

                      {item.note !== null && (
                        <p className="whitespace-pre-wrap break-words text-[11px] leading-5 text-[#756A63]">
                          Ghi chú: {item.note}
                        </p>
                      )}

                      {item.toppings.length > 0 && (
                        <p className="line-clamp-2 text-[11px] leading-5 text-[#756A63]">
                          Topping: {item.toppings.map((topping) => topping.name).join(', ')}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center rounded-full border border-[#E5DCD2] bg-white">
                          <button
                            type="button"
                            onClick={() => cartStore.updateQuantity(item.id, item.quantity - 1)}
                            className="flex h-8 w-8 items-center justify-center text-sm font-black text-[#163E2B]"
                            aria-label={`Giảm số lượng ${item.name}`}
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-xs font-black text-[#1E1813]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => cartStore.updateQuantity(item.id, item.quantity + 1)}
                            disabled={item.quantity >= 20}
                            className="flex h-8 w-8 items-center justify-center text-sm font-black text-[#163E2B] disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label={`Tăng số lượng ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                        <strong className="font-mono text-sm text-[#163E2B]">
                          {formatVnd(item.lineTotal)}
                        </strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="border-t border-[#E5DCD2] bg-white px-5 py-4">
              <div className="space-y-2 rounded-2xl bg-[#FAF6F2] p-4 text-sm">
                <div className="flex items-center justify-between text-[#756A63]">
                  <span>Tạm tính ({totalQuantity} món)</span>
                  <strong className="font-mono text-[#1E1813]">{formatVnd(subtotal)}</strong>
                </div>

                {/* Khu vực Coupon */}
                <div className="py-2">
                  {session.status === 'authenticated' && session.user?.role === 'CUSTOMER' && (
                    <div className="mb-3 rounded-xl border border-[#D8CCBA] bg-white p-3">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <strong className="text-[#163E2B]">{(loyaltyOverview?.pointsBalance ?? session.user.loyaltyBalance).toLocaleString('vi-VN')} điểm</strong>
                        <Link href="/loyalty" className="font-bold text-[#163E2B] underline">Xem Loyalty</Link>
                      </div>
                      {loyaltyOverview?.availableCoupons.map((coupon) => (
                        <button key={coupon.code} type="button" onClick={() => applyStoredVoucher(coupon.code, coupon.minOrderValue)} className="mt-2 flex w-full items-center justify-between rounded-lg bg-[#E8F1EC] px-3 py-2 text-left text-xs text-[#163E2B]">
                          <span><strong>{coupon.code}</strong><span className="ml-2">-{formatVnd(coupon.discountAmount)}</span></span><span className="font-bold">Dùng</span>
                        </button>
                      ))}
                      {(() => {
                        const balance = loyaltyOverview?.pointsBalance ?? session.user.loyaltyBalance;
                        const quickTier = chooseQuickRedeemTier(loyaltyTiers, balance, subtotal);
                        return quickTier ? <button type="button" disabled={isRedeeming || isApplying} onClick={() => void handleQuickRedeem()} className="mt-3 w-full rounded-full border border-[#163E2B] px-3 py-2 text-xs font-bold text-[#163E2B] disabled:opacity-50">{isRedeeming ? 'Đang đổi…' : `Đổi nhanh ${quickTier.pointsCost.toLocaleString('vi-VN')} điểm → ${formatVnd(quickTier.discountAmount)}`}</button> : null;
                      })()}
                      {loyaltyMessage && <p role="status" className="mt-2 text-xs text-[#756A63]">{loyaltyMessage}</p>}
                    </div>
                  )}
                  {!visibleCoupon ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nhập mã giảm giá..."
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        className="flex-1 rounded-md border border-[#E5DCD2] px-3 py-1.5 text-sm outline-none focus:border-[#163E2B]"
                        disabled={isApplying}
                      />
                      <button
                        type="button"
                        onClick={() => void handleApplyCoupon()}
                        disabled={isApplying}
                        className="rounded-md bg-[#163E2B] px-4 py-1.5 text-xs font-bold text-white transition hover:bg-[#1f4f38] disabled:opacity-50"
                      >
                        {isApplying ? 'Đang kiểm tra...' : 'Áp dụng'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-md bg-[#E8F1EC] px-3 py-2 text-sm text-[#163E2B]">
                      <div>
                        <span className="font-bold">{visibleCoupon.code}</span>
                        <span className="ml-2 font-mono text-xs">(-{formatVnd(effectiveDiscountAmount)})</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-[11px] font-bold text-[#9f3f2f] hover:underline"
                      >
                        Xóa mã
                      </button>
                    </div>
                  )}
                  {visibleCouponError && (
                    <p className="mt-1 text-xs text-[#9f3f2f]">{visibleCouponError}</p>
                  )}
                </div>

                <div className="border-t border-[#E5DCD2] pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-[#163E2B]">Tổng thanh toán</span>
                    <strong className="font-mono text-lg text-[#163E2B]">
                      {formatVnd(Math.max(0, subtotal - effectiveDiscountAmount))}
                    </strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onCheckout(visibleCoupon)}
                disabled={isApplying}
                className="mt-3 w-full rounded-full bg-[#163E2B] py-3 text-sm font-black text-white shadow-md transition hover:bg-[#1f4f38] active:scale-[0.99]"
              >
                Tiến hành đặt & thanh toán
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

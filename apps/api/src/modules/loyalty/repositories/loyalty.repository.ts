import { ConflictException, Injectable, InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../database/prisma.service.js';
import type { LoyaltyTier } from '../entities/loyalty-tier.entity.js';

const REDEEM_REASON_PREFIX = 'LOYALTY_REDEEM:v1';
const TIER_PATTERN = /(?:^|;)tier=([0-9]+)(?:;|$)/;
const COUPON_PATTERN = /(?:^|;)coupon=([A-Z0-9-]+)(?:;|$)/;
const DAY_MS = 24 * 60 * 60 * 1000;

interface LockedUserRow { id: string; loyalty_balance: number; }

@Injectable()
export class LoyaltyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(userId: string) {
    const now = new Date();
    const [user, transactions, redeemLedger] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { loyaltyBalance: true } }),
      this.prisma.loyaltyTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { order: { select: { orderNumber: true } } },
      }),
      this.prisma.loyaltyTransaction.findMany({
        where: { userId, type: 'REDEEM', reason: { startsWith: REDEEM_REASON_PREFIX } },
        select: { reason: true },
      }),
    ]);
    if (!user) throw new InternalServerErrorException('Không tìm thấy tài khoản Loyalty.');

    const ownedCodes = redeemLedger
      .map((transaction) => COUPON_PATTERN.exec(transaction.reason)?.[1])
      .filter((code): code is string => Boolean(code));
    const coupons = ownedCodes.length === 0 ? [] : await this.prisma.coupon.findMany({
      where: {
        code: { in: [...new Set(ownedCodes)] },
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
    });
    const couponIds = coupons.map((coupon) => coupon.id);
    const unavailable = couponIds.length === 0 ? [] : await this.prisma.couponRedemption.findMany({
      where: {
        couponId: { in: couponIds },
        OR: [
          { status: 'CONSUMED' },
          { status: 'RESERVED', OR: [
            { expiresAt: { gt: now } },
            { order: { payments: { some: { status: 'PROCESSING' } } } },
          ] },
        ],
      },
      select: { couponId: true },
    });
    const unavailableIds = new Set(unavailable.map((redemption) => redemption.couponId));

    return {
      pointsBalance: user.loyaltyBalance,
      availableCoupons: coupons
        .filter((coupon) => !unavailableIds.has(coupon.id))
        .map((coupon) => ({
          code: coupon.code,
          discountAmount: toSafeVnd(coupon.discountValue),
          minOrderValue: toSafeVnd(coupon.minOrderValue),
          endsAt: coupon.endsAt.toISOString(),
        })),
      transactions: transactions.map((transaction) => ({
        type: transaction.type,
        points: transaction.points,
        balanceAfter: transaction.balanceAfter,
        reason: transaction.type === 'REDEEM' ? 'Đổi điểm lấy voucher' : transaction.reason,
        orderNumber: transaction.order?.orderNumber ?? null,
        createdAt: transaction.createdAt.toISOString(),
      })),
    };
  }

  async redeem(userId: string, tier: LoyaltyTier, idempotencyKey: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedUserRow[]>`
        SELECT "id", "loyalty_balance"
        FROM "users"
        WHERE "id" = ${userId}::uuid
        FOR UPDATE
      `;
      const user = rows[0];
      if (!user) throw new InternalServerErrorException('Không tìm thấy tài khoản Loyalty.');

      const existing = await tx.loyaltyTransaction.findFirst({
        where: {
          userId,
          type: 'REDEEM',
          reason: { startsWith: `${REDEEM_REASON_PREFIX};key=${idempotencyKey};tier=` },
        },
      });
      if (existing) {
        const existingTier = TIER_PATTERN.exec(existing.reason)?.[1];
        const existingCouponCode = COUPON_PATTERN.exec(existing.reason)?.[1];
        if (existingTier !== tier.tierId) {
          throw new ConflictException({ error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key đã được dùng cho gói đổi điểm khác.' } });
        }
        if (!existingCouponCode) throw new InternalServerErrorException('Dữ liệu đổi điểm không hợp lệ.');
        const coupon = await tx.coupon.findUnique({ where: { code: existingCouponCode } });
        if (!coupon) throw new InternalServerErrorException('Không tìm thấy voucher đã đổi.');
        return redeemResponse(coupon, existing.points, existing.balanceAfter);
      }

      const balance = Number(user.loyalty_balance);
      if (balance < tier.pointsCost) {
        throw new UnprocessableEntityException({
          error: { code: 'INSUFFICIENT_LOYALTY_POINTS', message: 'Bạn chưa đủ điểm để đổi gói thưởng này.' },
        });
      }

      const now = new Date();
      const endsAt = new Date(now.getTime() + 30 * DAY_MS);
      const code = `LYT-${randomBytes(12).toString('hex').toUpperCase()}`;
      const coupon = await tx.coupon.create({
        data: {
          code,
          discountType: 'FIXED_AMOUNT',
          discountValue: BigInt(tier.discountAmount),
          minOrderValue: BigInt(tier.minOrderValue),
          usageLimit: 1,
          perUserLimit: 1,
          startsAt: now,
          endsAt,
          isActive: true,
        },
      });
      const balanceAfter = balance - tier.pointsCost;
      await tx.user.update({ where: { id: userId }, data: { loyaltyBalance: balanceAfter } });
      await tx.loyaltyTransaction.create({
        data: {
          userId,
          type: 'REDEEM',
          points: tier.pointsCost,
          balanceAfter,
          reason: `${REDEEM_REASON_PREFIX};key=${idempotencyKey};tier=${tier.tierId};coupon=${code}`,
        },
      });
      return redeemResponse(coupon, tier.pointsCost, balanceAfter);
    });
  }
}

function toSafeVnd(value: bigint): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new InternalServerErrorException('Giá trị tiền tệ vượt giới hạn an toàn.');
  return amount;
}

function redeemResponse(coupon: { code: string; discountValue: bigint; minOrderValue: bigint; endsAt: Date }, pointsUsed: number, pointsBalance: number) {
  return {
    coupon: {
      code: coupon.code,
      discountAmount: toSafeVnd(coupon.discountValue),
      minOrderValue: toSafeVnd(coupon.minOrderValue),
      endsAt: coupon.endsAt.toISOString(),
    },
    pointsUsed,
    pointsBalance,
  };
}

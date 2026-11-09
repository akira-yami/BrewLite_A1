import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { LoyaltyRepository } from './loyalty.repository.js';
import { PrismaService } from '../../../database/prisma.service.js';
import type { LoyaltyTier } from '../entities/loyalty-tier.entity.js';

const tier: LoyaltyTier = { tierId: '10000', pointsCost: 10000, discountAmount: 10000, minOrderValue: 20000 };
const key = '00000000-0000-4000-8000-000000000001';

describe('LoyaltyRepository', () => {
  let repository: LoyaltyRepository;
  let prisma: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'user-1', loyalty_balance: 25000 }]),
      loyaltyTransaction: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
      coupon: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...data })), findUnique: vi.fn() },
      user: { update: vi.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
      user: { findUnique: vi.fn() },
      loyaltyTransaction: { findMany: vi.fn() },
      coupon: { findMany: vi.fn() },
      couponRedemption: { findMany: vi.fn() },
    };
    repository = new LoyaltyRepository(prisma as unknown as PrismaService);
  });

  it('locks the user and atomically creates coupon, subtracts points, and writes the idempotency ledger', async () => {
    const result = await repository.redeem('user-1', tier, key);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.coupon.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      code: expect.stringMatching(/^LYT-[A-F0-9]{24}$/),
      discountType: 'FIXED_AMOUNT', discountValue: 10000n, minOrderValue: 20000n,
      usageLimit: 1, perUserLimit: 1, isActive: true,
    }) });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { loyaltyBalance: 15000 } });
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: 'REDEEM', points: 10000, balanceAfter: 15000,
      reason: expect.stringContaining(`;key=${key};tier=10000;coupon=LYT-`),
    }) });
    expect(result).toMatchObject({ pointsUsed: 10000, pointsBalance: 15000, coupon: { discountAmount: 10000, minOrderValue: 20000 } });
  });

  it('rejects insufficient points without creating or deducting anything', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'user-1', loyalty_balance: 9999 }]);
    await expect(repository.redeem('user-1', tier, key)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.coupon.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.loyaltyTransaction.create).not.toHaveBeenCalled();
  });

  it('returns the original coupon on a retry with the same key and tier', async () => {
    tx.loyaltyTransaction.findFirst.mockResolvedValue({
      points: 10000, balanceAfter: 15000,
      reason: `LOYALTY_REDEEM:v1;key=${key};tier=10000;coupon=LYT-ABCDEF`,
    });
    tx.coupon.findUnique.mockResolvedValue({ code: 'LYT-ABCDEF', discountValue: 10000n, minOrderValue: 20000n, endsAt: new Date('2026-12-10T00:00:00Z') });

    const result = await repository.redeem('user-1', tier, key);
    expect(result.coupon.code).toBe('LYT-ABCDEF');
    expect(tx.coupon.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects reuse of a key for a different tier', async () => {
    tx.loyaltyTransaction.findFirst.mockResolvedValue({
      reason: `LOYALTY_REDEEM:v1;key=${key};tier=20000;coupon=LYT-ABCDEF`,
    });
    await expect(repository.redeem('user-1', tier, key)).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns only active, unexpired, unused vouchers and serializable integer VND', async () => {
    const createdAt = new Date('2026-11-01T00:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({ loyaltyBalance: 12000 });
    prisma.loyaltyTransaction.findMany.mockResolvedValue([
      { type: 'REDEEM', points: 10000, balanceAfter: 12000, reason: 'LOYALTY_REDEEM:v1;key=hidden;tier=10000;coupon=LYT-AVAILABLE', createdAt, order: null },
      { type: 'REDEEM', points: 10000, balanceAfter: 22000, reason: 'LOYALTY_REDEEM:v1;key=hidden;tier=10000;coupon=LYT-USED', createdAt, order: null },
    ]);
    prisma.coupon.findMany.mockResolvedValue([
      { id: 'coupon-available', code: 'LYT-AVAILABLE', discountValue: 10000n, minOrderValue: 20000n, endsAt: new Date('2026-12-01T00:00:00Z') },
      { id: 'coupon-used', code: 'LYT-USED', discountValue: 10000n, minOrderValue: 20000n, endsAt: new Date('2026-12-01T00:00:00Z') },
    ]);
    prisma.couponRedemption.findMany.mockResolvedValue([{ couponId: 'coupon-used' }]);

    const overview = await repository.getOverview('user-1');
    expect(overview.pointsBalance).toBe(12000);
    expect(overview.availableCoupons.map(({ code }) => code)).toEqual(['LYT-AVAILABLE']);
    expect(overview.transactions[0].reason).toBe('Đổi điểm lấy voucher');
    expect(() => JSON.stringify(overview)).not.toThrow();
    expect(prisma.couponRedemption.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ couponId: { in: ['coupon-available', 'coupon-used'] } }),
      select: { couponId: true },
    }));
  });
});

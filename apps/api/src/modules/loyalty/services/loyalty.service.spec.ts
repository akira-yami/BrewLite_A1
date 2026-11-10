import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service.js';
import { LoyaltyRepository } from '../repositories/loyalty.repository.js';

describe('LoyaltyService', () => {
  let repository: { getOverview: ReturnType<typeof vi.fn>; redeem: ReturnType<typeof vi.fn> };
  let service: LoyaltyService;

  beforeEach(() => {
    repository = { getOverview: vi.fn(), redeem: vi.fn() };
    service = new LoyaltyService(repository as unknown as LoyaltyRepository);
  });

  it('exposes the four fixed reward tiers in ascending points order', () => {
    expect(service.getTiers()).toEqual([
      { tierId: '10000', pointsCost: 10000, discountAmount: 10000, minOrderValue: 20000 },
      { tierId: '20000', pointsCost: 20000, discountAmount: 20000, minOrderValue: 40000 },
      { tierId: '50000', pointsCost: 50000, discountAmount: 50000, minOrderValue: 80000 },
      { tierId: '100000', pointsCost: 100000, discountAmount: 100000, minOrderValue: 150000 },
    ]);
  });

  it('rejects a tier that is not in the public catalog before touching persistence', async () => {
    expect(() => service.redeem('user-1', '15000', '00000000-0000-4000-8000-000000000000'))
      .toThrow(BadRequestException);
    expect(repository.redeem).not.toHaveBeenCalled();
  });

  it('delegates overview and valid redemption to the repository', async () => {
    const overview = { pointsBalance: 25000, availableCoupons: [], transactions: [] };
    const redeemed = { coupon: { code: 'LYT-ABCD' }, pointsUsed: 10000, pointsBalance: 15000 };
    repository.getOverview.mockResolvedValue(overview);
    repository.redeem.mockResolvedValue(redeemed);

    await expect(service.getOverview('user-1')).resolves.toBe(overview);
    await expect(service.redeem('user-1', '10000', '00000000-0000-4000-8000-000000000000'))
      .resolves.toBe(redeemed);
    expect(repository.redeem).toHaveBeenCalledWith('user-1', expect.objectContaining({ tierId: '10000' }), '00000000-0000-4000-8000-000000000000');
  });
});

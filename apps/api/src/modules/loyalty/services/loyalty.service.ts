import { BadRequestException, Injectable } from '@nestjs/common';
import { LoyaltyRepository } from '../repositories/loyalty.repository.js';
import type { LoyaltyTier } from '../entities/loyalty-tier.entity.js';

const TIERS: LoyaltyTier[] = [
  { tierId: '10000', pointsCost: 10000, discountAmount: 10000, minOrderValue: 20000 },
  { tierId: '20000', pointsCost: 20000, discountAmount: 20000, minOrderValue: 40000 },
  { tierId: '50000', pointsCost: 50000, discountAmount: 50000, minOrderValue: 80000 },
  { tierId: '100000', pointsCost: 100000, discountAmount: 100000, minOrderValue: 150000 },
];

@Injectable()
export class LoyaltyService {
  constructor(private readonly repository: LoyaltyRepository) {}

  getTiers(): LoyaltyTier[] {
    return TIERS.map((tier) => ({ ...tier }));
  }

  getOverview(userId: string) {
    return this.repository.getOverview(userId);
  }

  redeem(userId: string, tierId: string, idempotencyKey: string) {
    if (!isUuid(idempotencyKey)) {
      throw new BadRequestException({ error: { code: 'VALIDATION_ERROR', message: 'Idempotency-Key phải là UUID.' } });
    }
    const tier = TIERS.find((candidate) => candidate.tierId === tierId);
    if (!tier) {
      throw new BadRequestException({ error: { code: 'INVALID_LOYALTY_TIER', message: 'Gói đổi điểm không hợp lệ.' } });
    }
    return this.repository.redeem(userId, tier, idempotencyKey);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

import type { LoyaltyTier } from './types';

export function chooseQuickRedeemTier(
  tiers: LoyaltyTier[],
  pointsBalance: number,
  subtotal: number,
): LoyaltyTier | null {
  return [...tiers]
    .sort((left, right) => left.pointsCost - right.pointsCost)
    .find((tier) => tier.pointsCost <= pointsBalance && tier.minOrderValue <= subtotal) ?? null;
}

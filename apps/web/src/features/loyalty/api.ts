import { authenticatedRequest } from '@/features/auth/api';
import type { LoyaltyOverview, LoyaltyRedeemResult, LoyaltyTier } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export async function getLoyaltyTiers(): Promise<LoyaltyTier[]> {
  const response = await fetch(`${API_BASE_URL}/loyalty/tiers`, { cache: 'no-store' });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json) throw new Error('Không thể tải danh mục đổi điểm.');
  return json.data ?? json;
}

export function getLoyaltyOverview(): Promise<LoyaltyOverview> {
  return authenticatedRequest<LoyaltyOverview>('/loyalty/me', { cache: 'no-store' });
}

export function redeemLoyalty(tierId: string, idempotencyKey: string): Promise<LoyaltyRedeemResult> {
  return authenticatedRequest<LoyaltyRedeemResult>('/loyalty/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ tierId }),
  });
}

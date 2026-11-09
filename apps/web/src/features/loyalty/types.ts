export interface LoyaltyTier {
  tierId: string;
  pointsCost: number;
  discountAmount: number;
  minOrderValue: number;
}

export interface LoyaltyCoupon {
  code: string;
  discountAmount: number;
  minOrderValue: number;
  endsAt: string;
}

export interface LoyaltyTransaction {
  type: 'EARN' | 'REDEEM' | 'ADJUSTMENT' | 'REVERSAL';
  points: number;
  balanceAfter: number;
  reason: string;
  orderNumber: string | null;
  createdAt: string;
}

export interface LoyaltyOverview {
  pointsBalance: number;
  availableCoupons: LoyaltyCoupon[];
  transactions: LoyaltyTransaction[];
}

export interface LoyaltyRedeemResult {
  coupon: LoyaltyCoupon;
  pointsUsed: number;
  pointsBalance: number;
}

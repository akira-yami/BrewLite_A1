import type { CreateOrderItemInput } from '../orders/types';

export type CheckoutPaymentMethod = 'E_WALLET' | 'CARD' | 'VNPAY';

export interface CheckoutCouponQuote {
  code: string;
  subtotal: number;
  discountAmount: number;
}

export interface PendingCheckoutState {
  orderId: string;
  idempotencyKey: string | null;
  method: CheckoutPaymentMethod | null;
  cartFingerprint: string;
  cartItemsRemoved?: true;
}

export function getCheckoutOrderItems(checkout: PendingCheckoutState): CreateOrderItemInput[] {
  try {
    const items: unknown = JSON.parse(checkout.cartFingerprint);
    if (Array.isArray(items) && items.every(item => isRecord(item) &&
        typeof item.productVariantId === 'string' && Number.isInteger(item.quantity) &&
        (item.quantity as number) > 0 && (item.toppingIds === undefined ||
          (Array.isArray(item.toppingIds) && item.toppingIds.every(id => typeof id === 'string'))))) {
      return items as CreateOrderItemInput[];
    }
  } catch {
    // Older or malformed checkout snapshots may not have recoverable items.
  }
  return [];
}

type StorageReader = Pick<Storage, 'getItem' | 'removeItem'>;
type StorageWriter = Pick<Storage, 'setItem' | 'removeItem'>;

const COUPON_STORAGE_KEY = 'brewlite_checkout_coupon';
const PENDING_CHECKOUT_STORAGE_KEY = 'brewlite_pending_checkout';
const PREFERRED_LOYALTY_COUPON_KEY = 'brewlite_preferred_loyalty_coupon';
const PENDING_LOYALTY_REDEEM_PREFIX = 'brewlite_pending_loyalty_redeem:';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readCheckoutCoupon(storage: StorageReader): CheckoutCouponQuote | null {
  try {
    const raw = storage.getItem(COUPON_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);

    if (
      !isRecord(value)
      || typeof value.code !== 'string'
      || value.code.trim().length === 0
      || !Number.isSafeInteger(value.subtotal)
      || (value.subtotal as number) <= 0
      || !Number.isSafeInteger(value.discountAmount)
      || (value.discountAmount as number) < 0
      || (value.discountAmount as number) > (value.subtotal as number)
    ) {
      storage.removeItem(COUPON_STORAGE_KEY);
      return null;
    }

    return {
      code: value.code.trim(),
      subtotal: value.subtotal as number,
      discountAmount: value.discountAmount as number,
    };
  } catch {
    return null;
  }
}

export function writeCheckoutCoupon(
  storage: StorageWriter,
  quote: CheckoutCouponQuote | null,
): void {
  try {
    if (quote === null) {
      storage.removeItem(COUPON_STORAGE_KEY);
      return;
    }
    storage.setItem(COUPON_STORAGE_KEY, JSON.stringify(quote));
  } catch {
    // Checkout still validates the coupon on the server when storage is unavailable.
  }
}

export function readPreferredLoyaltyCoupon(storage: StorageReader): string | null {
  try {
    const code = storage.getItem(PREFERRED_LOYALTY_COUPON_KEY)?.trim();
    if (!code || !/^LYT-[A-Z0-9-]+$/i.test(code)) {
      storage.removeItem(PREFERRED_LOYALTY_COUPON_KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

export function writePreferredLoyaltyCoupon(storage: StorageWriter, code: string | null): void {
  try {
    if (code === null) storage.removeItem(PREFERRED_LOYALTY_COUPON_KEY);
    else if (/^LYT-[A-Z0-9-]+$/i.test(code.trim())) storage.setItem(PREFERRED_LOYALTY_COUPON_KEY, code.trim());
  } catch {
    // The coupon can still be copied and entered manually.
  }
}

export function readPendingLoyaltyRedeem(storage: StorageReader, userId: string, tierId: string): string | null {
  try {
    const key = storage.getItem(pendingLoyaltyStorageKey(userId, tierId));
    return key && /^[0-9a-f-]{36}$/i.test(key) ? key : null;
  } catch {
    return null;
  }
}

export function writePendingLoyaltyRedeem(storage: StorageWriter, userId: string, tierId: string, key: string | null): void {
  try {
    const storageKey = pendingLoyaltyStorageKey(userId, tierId);
    if (key === null) {
      storage.removeItem(storageKey);
      return;
    }
    if (/^[0-9a-f-]{36}$/i.test(key)) storage.setItem(storageKey, key);
  } catch {
    // If storage fails, a new key will be generated for the next attempt.
  }
}

function pendingLoyaltyStorageKey(userId: string, tierId: string): string {
  return `${PENDING_LOYALTY_REDEEM_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(tierId)}`;
}

export function readPendingCheckout(storage: StorageReader): PendingCheckoutState | null {
  try {
    const raw = storage.getItem(PENDING_CHECKOUT_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    const validMethod = (method: unknown) => method === 'E_WALLET' || method === 'CARD' || method === 'VNPAY';

    if (
      !isRecord(value)
      || typeof value.orderId !== 'string'
      || value.orderId.trim().length === 0
      || typeof value.cartFingerprint !== 'string'
      || value.cartFingerprint.length === 0
      || !(
        value.idempotencyKey === null
        || (typeof value.idempotencyKey === 'string' && value.idempotencyKey.length > 0)
      )
      || !(value.method === null || validMethod(value.method))
      || (value.idempotencyKey !== null && value.method === null)
      || (value.idempotencyKey === null && value.method !== null)
    ) {
      storage.removeItem(PENDING_CHECKOUT_STORAGE_KEY);
      return null;
    }

    return {
      orderId: value.orderId,
      idempotencyKey: value.idempotencyKey as string | null,
      method: value.method as CheckoutPaymentMethod | null,
      cartFingerprint: value.cartFingerprint,
      ...(value.cartItemsRemoved === true ? { cartItemsRemoved: true as const } : {}),
    };
  } catch {
    return null;
  }
}

export function writePendingCheckout(
  storage: StorageWriter,
  checkout: PendingCheckoutState | null,
): void {
  try {
    if (checkout === null) {
      storage.removeItem(PENDING_CHECKOUT_STORAGE_KEY);
      return;
    }
    storage.setItem(PENDING_CHECKOUT_STORAGE_KEY, JSON.stringify(checkout));
  } catch {
    // The component retains the in-memory attempt if session storage is unavailable.
  }
}

export type PaymentAttemptResolution = 'SUCCEEDED' | 'FAILED' | 'PROCESSING' | 'UNKNOWN';

export type ActivePendingPaymentAttempt = PendingCheckoutState & {
  idempotencyKey: string;
  method: CheckoutPaymentMethod;
};

/**
 * Apply only a definitive gateway outcome to the pending checkout state.
 * Unknown/processing outcomes keep the exact key so a replay cannot double-charge.
 */
export function transitionPaymentAttempt(
  attempt: ActivePendingPaymentAttempt,
  resolution: PaymentAttemptResolution,
): PendingCheckoutState | null {
  switch (resolution) {
    case 'SUCCEEDED':
      return null;
    case 'FAILED':
      return {
        ...attempt,
        idempotencyKey: null,
        method: null,
      };
    case 'PROCESSING':
    case 'UNKNOWN':
      return { ...attempt };
  }
}

// ==========================================
// COUPON DOMAIN
// ==========================================
export interface ValidateCouponPayload {
    code: string;
    subtotal: number;
}

export interface ValidateCouponResponse {
    code: string;
    discountAmount: number;
}

// ==========================================
// PAYMENT DOMAIN
// ==========================================
export type PaymentMethod = 'VNPAY';

export type PaymentStatus = 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'MANUAL_REVIEW' | 'REFUNDED';

export interface CreatePaymentPayload {
    orderId: string;
    method: PaymentMethod;
    /** Explicit customer retry CTA; not set on initial/concurrent checkout POSTs. */
    retryAttempt?: boolean;
}

export interface PaymentResponse {
    success: boolean;
    isRetried: boolean;
    status: PaymentStatus;
    gatewayTransactionId?: string | null;
    paymentUrl?: string | null;
    errorCode?: string | null;
    message?: string;
}

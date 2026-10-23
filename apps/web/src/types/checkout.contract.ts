// ==========================================
// COUPON DOMAIN
// ==========================================
export interface ValidateCouponPayload {
    code: string;
    subtotal: number;
}

export interface ValidateCouponResponse {
    data: {
        code: string;
        discountAmount: number;
    };
}

// ==========================================
// PAYMENT DOMAIN
// ==========================================
export type PaymentMethod = 'E_WALLET' | 'CARD' | 'BANK_TRANSFER';

export type PaymentStatus = 'PROCESSING' | 'SUCCEEDED' | 'FAILED';

export interface CreatePaymentPayload {
    orderId: string;
    method: PaymentMethod;
}

export interface PaymentResponse {
    data: {
        success: boolean;
        isRetried: boolean;
        status: PaymentStatus;
        gatewayTransactionId?: string;
        errorCode?: string;
    };
}
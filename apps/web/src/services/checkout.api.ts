import type {
    ValidateCouponPayload,
    ValidateCouponResponse,
    CreatePaymentPayload,
    PaymentResponse
} from '../types/checkout.contract';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export class CheckoutApiError extends Error {
    constructor(message: string, readonly status: number, readonly code?: string) {
        super(message);
        this.name = 'CheckoutApiError';
    }
}

async function request<T>(path: string, token: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
        },
    });
    const json = await response.json().catch(() => null);

    if (!response.ok) {
        const payload = json as {
            error?: { message?: string; code?: string };
            message?: string;
            code?: string;
        } | null;
        throw new CheckoutApiError(
            payload?.error?.message ?? payload?.message ?? 'Không thể hoàn tất yêu cầu checkout.',
            response.status,
            payload?.error?.code ?? payload?.code,
        );
    }

    return json && typeof json === 'object' && 'data' in json
        ? (json as { data: T }).data
        : json as T;
}

export const CheckoutAPI = {
    /**
     * Gọi API xác thực mã giảm giá
     * @param payload Chứa mã coupon và tổng giá trị đơn hàng hiện tại
     */
    validateCoupon: (token: string, payload: ValidateCouponPayload): Promise<ValidateCouponResponse> => {
        return request<ValidateCouponResponse>('/coupons/validate', token, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    /**
     * Gọi API thanh toán (Bắt buộc kèm Idempotency Key)
     * @param payload Chứa orderId và phương thức thanh toán
     * @param idempotencyKey Chuỗi UUID v4 (Do frontend sinh ra lúc user bấm nút Thanh toán)
     */
    processPayment: async (
        token: string,
        payload: CreatePaymentPayload,
        idempotencyKey: string,
    ): Promise<PaymentResponse> => {
        if (!idempotencyKey) {
        throw new Error('Critical: Idempotency-Key is strictly required to prevent double-charge.');
        }

        return request<PaymentResponse>('/payments', token, {
            method: 'POST',
            headers: { 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify(payload),
        });
    }
};

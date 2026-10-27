import { authenticatedRequest } from '@/lib/api-client'; // Đường dẫn tuỳ thuộc cấu trúc apps/web
import type {
    ValidateCouponPayload,
    ValidateCouponResponse,
    CreatePaymentPayload,
    PaymentResponse
} from '../types/checkout.contract';

export const CheckoutAPI = {
    /**
     * Gọi API xác thực mã giảm giá
     * @param payload Chứa mã coupon và tổng giá trị đơn hàng hiện tại
     */
    validateCoupon: async (payload: ValidateCouponPayload): Promise<ValidateCouponResponse> => {
        return authenticatedRequest<ValidateCouponResponse>('/api/v1/coupons/validate', {
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
        payload: CreatePaymentPayload,
        idempotencyKey: string
    ): Promise<PaymentResponse> => {
        if (!idempotencyKey) {
        throw new Error('Critical: Idempotency-Key is strictly required to prevent double-charge.');
        }

        return authenticatedRequest<PaymentResponse>('/api/v1/payments', {
        method: 'POST',
        headers: {
            'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
        });
    }
};
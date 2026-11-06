import { AuthApiError, authenticatedRequest } from '@/features/auth/api';

export interface CouponQuoteResponse {
  discountAmount: number;
  finalTotal?: number;
}

export class CouponApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'CouponApiError';
  }
}

export async function validateCoupon(
  code: string,
  subtotal: number,
): Promise<CouponQuoteResponse> {
  const normalizedCode = code.trim();
  if (!normalizedCode) {
    throw new CouponApiError('Vui lòng nhập mã giảm giá.', 400, 'COUPON_CODE_REQUIRED');
  }
  if (!Number.isSafeInteger(subtotal) || subtotal <= 0) {
    throw new CouponApiError('Giá trị giỏ hàng không hợp lệ.', 400, 'INVALID_SUBTOTAL');
  }

  try {
    const quote = await authenticatedRequest<CouponQuoteResponse>('/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: normalizedCode, subtotal }),
    });

    if (
      !quote
      || !Number.isSafeInteger(quote.discountAmount)
      || quote.discountAmount < 0
      || quote.discountAmount > subtotal
      || (
        quote.finalTotal !== undefined
        && (!Number.isSafeInteger(quote.finalTotal) || quote.finalTotal < 0)
      )
    ) {
      throw new CouponApiError(
        'Máy chủ trả về báo giá coupon không hợp lệ. Vui lòng thử lại.',
        502,
        'INVALID_COUPON_QUOTE',
      );
    }

    return quote;
  } catch (error) {
    if (error instanceof CouponApiError) throw error;
    if (error instanceof AuthApiError) {
      throw new CouponApiError(error.message, error.status, error.code);
    }
    throw new CouponApiError(
      'Không thể kết nối đến dịch vụ mã giảm giá. Vui lòng thử lại.',
      0,
      'COUPON_SERVICE_UNAVAILABLE',
    );
  }
}

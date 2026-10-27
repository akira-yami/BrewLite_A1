// apps/web/src/api/coupons.api.ts

export async function validateCoupon(code: string, subtotal: number) {
  const response = await fetch('/api/v1/coupons/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Nhớ gắn token vào header Authorization nếu API yêu cầu đăng nhập
    },
    body: JSON.stringify({ code, subtotal }),
  });

  const result = await response.json();

  if (!response.ok) {
    // Ném thẳng mã lỗi từ Backend lên (VD: COUPON_NOT_APPLICABLE, COUPON_EXPIRED)
    throw new Error(result.error?.code || 'VALIDATION_FAILED');
  }

  return result.data; // Backend trả về { discountAmount, finalTotal }
}
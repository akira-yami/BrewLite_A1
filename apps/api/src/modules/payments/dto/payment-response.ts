// File: apps/api/src/modules/payments/dto/payment-response.ts
export enum PaymentStatus {
  PAID = 'PAID',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
}

export class PaymentResponseDto {
  paymentId: string;                   // ID của bản ghi trong bảng `payments`
  orderId: string;                     // ID đơn hàng
  amount: number;                      // Số tiền đã xử lý
  success: boolean;                    // Khẳng định trạng thái boolean (true/false)
  status: PaymentStatus;               // Trạng thái chuẩn map với DB
  gatewayTransactionId: string | null; // Mã giao dịch từ Mock Gateway (null nếu lỗi)
  failureCode: string | null;          // Mã lỗi chi tiết (vd: 'INSUFFICIENT_FUNDS', 'HASH_MISMATCH')
  message: string;                     // Câu thông báo thân thiện
  
  // Flag nhận diện Idempotency
  isRetried: boolean;                  // true nếu kết quả này lấy từ Cache/DB (không gọi lại Gateway)
}
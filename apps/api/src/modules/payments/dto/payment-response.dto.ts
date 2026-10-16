import {PaymentMethod} from './create-payment.dto.js';
export enum PaymentStatus {
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  PREPARING = 'PREPARING',
  READY = 'READY',
  COMPLETED = 'COMPLETED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  CANCELLED = 'CANCELLED',
}

export class PaymentResponseDto {
    paymentId: string;                   // ID của bản ghi trong bảng `payments`
    orderId: string;                     // ID đơn hàng
    orderNumber: string;
    amount: number;                      // Số tiền đã xử lý
    method: PaymentMethod;
    success: boolean;                    // Khẳng định trạng thái boolean (true/false)
    paymentStatus: PaymentStatus;
    orderStatus: OrderStatus;
    gatewayTransactionId: string | null; // Mã giao dịch từ Mock Gateway (null nếu lỗi)
    failureCode: string | null;          // Mã lỗi chi tiết (vd: 'INSUFFICIENT_FUNDS')
    message: string;                     // Câu thông báo thân thiện
    // Flag nhận diện Idempotency
    isRetried: boolean;                  // true nếu kết quả này lấy từ Cache/DB (không gọi lại Gateway)
    processedAt: Date;
}

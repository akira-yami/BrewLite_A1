export enum PaymentStatus {
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export class PaymentResponseDto {
paymentId: string;                   // ID của bản ghi trong bảng `payments`
  orderId: string;                     // ID đơn hàng
  amount: number;                      // Số tiền đã xử lý
  success: boolean;                    // Khẳng định trạng thái boolean (true/false)
  
  status: PaymentStatus;               // Dùng ĐÚNG PaymentStatus (Không dùng PAID ở đây nữa)
  
  gatewayTransactionId: string | null; // Mã giao dịch từ Mock Gateway (null nếu lỗi)
  failureCode: string | null;          // Mã lỗi chi tiết (vd: 'INSUFFICIENT_FUNDS')
  message: string;                     // Câu thông báo thân thiện
  
  // Flag nhận diện Idempotency
  isRetried: boolean;                  // true nếu kết quả này lấy từ Cache/DB (không gọi lại Gateway)
}

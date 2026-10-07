// Nằm ở thư mục: apps/api/src/modules/payments/dto/payment-response.ts (sẽ tạo sau)
export class PaymentResponseDto {
  success: boolean;            // true nếu thanh toán OK, false nếu tạch
  status: 'PAID' | 'PAYMENT_FAILED'; // Trạng thái map chuẩn với DB
  gatewayTransactionId: string | null; // Mã giao dịch giả lập (nếu thành công thì có, lỗi thì null)
  failureCode: string | null;  // Mã lỗi giả lập nếu thất bại (vd: 'INSUFFICIENT_FUNDS', 'IDEMPOTENCY_MISMATCH')
  message: string;             // Câu thông báo thân thiện (vd: "Thanh toán thành công", "Payload bị thay đổi")
}
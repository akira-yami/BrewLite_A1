export enum PaymentMethod {
  E_WALLET = 'E_WALLET',
  CREDIT_CARD = 'CREDIT_CARD',
}

export class CreatePaymentDto {
  orderId: string;             // Mã đơn hàng cần thanh toán
  amount: number;              // Số tiền (vd: 50000)
  method: PaymentMethod;       // Phương thức thanh toán
  
  // Các cờ phục vụ Idempotency (Task 10-B)
  idempotencyKey: string;      // UUID duy nhất cho mỗi nỗ lực thanh toán từ Client
  requestHash: string;         // Chuỗi hash payload để chống giả mạo/thay đổi dữ liệu
}
// Nằm ở thư mục: apps/api/src/modules/payments/dto/create-payment.ts (sẽ tạo sau)
export class CreatePaymentDto {
  orderId: string;             // Mã đơn hàng cần thanh toán
  amount: number;              // Số tiền (vd: 50000)
  currency: string;            // Đơn vị tiền tệ (vd: 'VND')
  method: 'E_WALLET' | 'CREDIT_CARD'; // Phương thức thanh toán (Ví điện tử hoặc Thẻ)
  
  // 2 trường sinh tử cho Task 10-B:
  idempotencyKey: string;      // UUID duy nhất cho mỗi nỗ lực thanh toán
  requestHash: string;         // Chuỗi hash (ví dụ: md5 của orderId + amount + method)
}
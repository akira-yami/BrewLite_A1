// Nằm ở thư mục: apps/api/src/modules/payments/gateways/payment-gateway.ts
import { CreatePaymentDto } from '../dto/create-payment.js';
import { PaymentResponseDto } from '../dto/payment-response.js';

export interface IPaymentGateway {
  /**
   * Khang sẽ gọi hàm này từ OrdersService.
   * Em (Kiệt) sẽ viết logic giả lập (Mock) bên trong hàm này ở file implementation.
   */
  processPayment(payload: CreatePaymentDto): Promise<PaymentResponseDto>;
}
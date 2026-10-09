// File: apps/api/src/modules/payments/gateways/payment-gateway.ts
import { CreatePaymentDto } from '../dto/create-payment.dto.js';
import { PaymentResponseDto } from '../dto/payment-response.dto.js';

export interface IPaymentGateway {
  /**
   * Khang sẽ gọi hàm này từ OrdersService để tiến hành thanh toán.
   * Chịu trách nhiệm check Idempotency, gọi MockGateway, và lưu DB.
   */
  processPayment(payload: CreatePaymentDto): Promise<PaymentResponseDto>;
}
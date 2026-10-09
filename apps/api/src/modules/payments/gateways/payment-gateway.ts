// File: apps/api/src/modules/payments/gateways/payment-gateway.ts
import { CreatePaymentDto } from '../dto/create-payment.js';
import { PaymentResponseDto } from '../dto/payment-response.js';

export interface IPaymentGateway {
  /**
   * Hợp đồng orchestration của PaymentsService, được PaymentsController gọi.
   * Kiểm tra quyền sở hữu bằng userId đã xác thực, lấy amount từ Order.total,
   * tính requestHash và xử lý idempotency trước khi gọi IMockGatewayService.
   * idempotencyKey lấy từ header, không lấy amount/hash do client gửi.
   */
  processPayment(
    payload: CreatePaymentDto,
    idempotencyKey: string,
    userId: string,
  ): Promise<PaymentResponseDto>;
}

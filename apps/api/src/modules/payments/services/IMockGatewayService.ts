import type { PaymentMethod } from '../dto/create-payment.js';

// File: apps/api/src/modules/payments/services/IMockGatewayService.ts
export interface IMockGatewayService {
  /**
   * Giả lập gửi request sang hệ thống thanh toán bên ngoài (Momo/ZaloPay).
   * Actor ngoại vi chỉ trả kết quả giả lập; PaymentsService quản lý DB/idempotency.
   */
  charge(amount: number, method: PaymentMethod): Promise<{
    success: boolean;
    gatewayTransactionId?: string;
    errorCode?: string;
  }>;
}

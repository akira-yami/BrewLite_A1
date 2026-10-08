import { PaymentMethod } from "../dto/create-payment.js";

// File: apps/api/src/modules/payments/services/IMockGatewayService.ts
export interface IMockGatewayService {
  /**
   * Giả lập gửi request sang hệ thống thanh toán bên ngoài (Momo/ZaloPay).
   * Actor ngoại vi này[cite: 21] sẽ phản hồi sau 1-2 giây.
   */
  charge(amount: number, method: PaymentMethod): Promise<{
    success: boolean;
    gatewayTransactionId?: string;
    errorCode?: string;
  }>;
}
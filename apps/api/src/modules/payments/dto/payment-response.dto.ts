import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../../generated/prisma/enums.js';

export { PaymentStatus } from '../../../generated/prisma/enums.js';

export class PaymentResponseDto {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  paymentStatus: PaymentStatus; // PROCESSING / SUCCEEDED / FAILED của Payment.
  orderStatus: OrderStatus; // PAID / PAYMENT_FAILED thuộc Order, là enum riêng.
  method: PaymentMethod;
  amount: number; // Chuyển bigint VND sang số nguyên an toàn tại lớp response.
  processedAt: string | null; // ISO UTC; null khi chưa xử lý xong.
}

import type { PaymentMethod } from '../../../generated/prisma/enums.js';

export { PaymentMethod } from '../../../generated/prisma/enums.js';

export class CreatePaymentDto {
  orderId: string;
  method: PaymentMethod; // E_WALLET hoặc CARD, cùng enum với database.

  // Idempotency-Key lấy từ header. Backend lấy amount từ Order.total
  // và tự tính requestHash; các giá trị này không thuộc payload client.
}

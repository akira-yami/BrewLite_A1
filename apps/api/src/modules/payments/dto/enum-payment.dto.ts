// Định nghĩa trạng thái Đơn Hàng (KT-02) - Chỉ để tham chiếu, Sprint 2 mới dùng đến
export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  PREPARING = 'PREPARING',
  READY = 'READY',
  COMPLETED = 'COMPLETED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  CANCELLED = 'CANCELLED',
}
import type { OrderItem, OrderStatus } from '../orders/types';

/** Trạng thái hiển thị trong hàng đợi của barista. */
export type StaffQueueStatus = Extract<OrderStatus, 'PAID' | 'PREPARING' | 'READY'>;

/** Trạng thái barista được phép đặt cho đơn. */
export type StaffTargetStatus = Extract<OrderStatus, 'PREPARING' | 'READY' | 'COMPLETED'>;

export interface StaffOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  items: OrderItem[];
  total: number;
  currency: string;
  createdAt: string;
  /** Thời điểm đơn vào trạng thái hiện tại. */
  updatedAt: string;
}

export interface StaffColumn {
  status: StaffQueueStatus;
  title: string;
  hint: string;
  actionLabel: string;
  nextStatus: StaffTargetStatus;
}

/** Thứ tự cột = thứ tự luồng: nhận đơn, pha chế, giao khách. */
export const STAFF_COLUMNS: readonly StaffColumn[] = [
  {
    status: 'PAID',
    title: 'Đơn mới',
    hint: 'Đã thanh toán, chờ nhận',
    actionLabel: 'Nhận đơn',
    nextStatus: 'PREPARING',
  },
  {
    status: 'PREPARING',
    title: 'Đang pha chế',
    hint: 'Pha xong thì báo sẵn sàng',
    actionLabel: 'Pha xong',
    nextStatus: 'READY',
  },
  {
    status: 'READY',
    title: 'Chờ giao khách',
    hint: 'Giao cho khách để hoàn tất',
    actionLabel: 'Đã giao khách',
    nextStatus: 'COMPLETED',
  },
];

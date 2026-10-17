import type { OrderItemResponseDto } from './order-item-response.dto.js';

// Draft payload for POST /orders (SD-10). The HTTP envelope is { data, meta }.
// No controller is registered until the Sprint 2 orders implementation.
export interface CreateOrderResponseDto {
  id: string;
  orderNumber: string;
  status: 'PENDING';
  items: OrderItemResponseDto[];
  subtotal: number;
  discountAmount: number;
  total: number;
  currency: 'VND';
  reservationExpiresAt: string;
  createdAt: string;
}

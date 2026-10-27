export interface CreateOrderItemInput {
  productVariantId: string;
  quantity: number;
  toppingIds?: string[];
  sugarLevel?: number | null;
  iceLevel?: number | null;
  note?: string | null;
}

export interface CreateOrderInput {
  items: CreateOrderItemInput[];
  couponCode?: string;
}

export interface OrderItem {
  id: string;
  productName: string;
  size: string;
  unitPrice: number;
  quantity: number;
  sugarLevel: number | null;
  iceLevel: number | null;
  note: string | null;
  toppings: Array<{ name: string; unitPrice: number; quantity: number }>;
  lineTotal: number;
}

export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'PAYMENT_FAILED'
  | 'CANCELLED';

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  currency: string;
  createdAt: string;
}

export interface OrderDetail extends OrderSummary {
  items: OrderItem[];
  subtotal: number;
  discountAmount: number;
  reservationExpiresAt?: string | null;
}

export interface OrderListResponse {
  items: OrderSummary[];
  nextCursor?: string | null;
}

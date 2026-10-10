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

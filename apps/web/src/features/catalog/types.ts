export type ProductSize = 'S' | 'M' | 'L';

export interface ProductVariant {
  id: string;
  size: ProductSize;
  price: number;
  /** Số ly tối đa làm được, API tính từ công thức và tồn kho nguyên liệu. */
  availableServings: number;
}

export interface Topping {
  id: string;
  code: string;
  name: string;
  price: number;
  available: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  imageUrl: string;
  basePrice: number;
  variants: ProductVariant[];
  toppings: Topping[];
}
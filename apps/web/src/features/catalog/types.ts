export type ProductSize = 'S' | 'M' | 'L';

export interface ProductVariant {
  id: string;
  size: ProductSize;
  price: number;
  stock: number;
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
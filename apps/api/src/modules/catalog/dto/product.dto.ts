export class ProductVariantDto {
  id: string;
  size: 'S' | 'M' | 'L';
  price: number;
  stock: number;
}

export class ToppingDto {
  id: string;
  code: string;
  name: string;
  price: number;
  available: boolean;
}

export class ProductResponseDto {
  id: string;
  sku: string;
  name: string;
  description: string;
  imageUrl: string;
  basePrice: number;
  variants: ProductVariantDto[];
  toppings: ToppingDto[];
}
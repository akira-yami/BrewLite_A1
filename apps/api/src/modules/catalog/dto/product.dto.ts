export class ProductVariantDto {
  id: string;
  size: 'S' | 'M' | 'L';
  price: number;
  /** Số ly tối đa làm được, tính từ công thức và tồn kho nguyên liệu (không lưu trong CSDL). */
  availableServings: number;
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
import { Injectable } from '@nestjs/common';
import { CatalogRepository } from '../repositories/catalog.repository.js';
import { ProductResponseDto } from '../dto/product.dto.js';

@Injectable()
export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  async getProducts(): Promise<ProductResponseDto[]> {
    const products = await this.repository.findAllProducts();

    return products.map((p) => {
      // Tìm giá thấp nhất từ danh sách variants để làm basePrice hiển thị
      const prices = p.variants.map((v) => Number(v.price));
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        description: p.description || '',
        imageUrl: p.imageUrl,
        basePrice: minPrice,
        variants: p.variants.map((v) => ({
          id: v.id,
          size: v.size as any,
          price: Number(v.price), // Ép kiểu BigInt -> number cho JSON
          stock: v.stock,
        })),
        toppings: p.productToppings.map((pt) => ({
          id: pt.topping.id,
          code: pt.topping.code,
          name: pt.topping.name,
          price: Number(pt.topping.price), // Ép kiểu BigInt -> number cho JSON
          available: pt.topping.isActive,
        })),
      };
    });
  }
}
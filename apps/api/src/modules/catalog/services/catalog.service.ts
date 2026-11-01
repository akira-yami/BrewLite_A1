import { Injectable, NotFoundException } from '@nestjs/common';
import { maxServings } from '../../../common/utils/recipe-capacity.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ProductResponseDto } from '../dto/product.dto.js';
import { CatalogRepository } from '../repositories/catalog.repository.js';

@Injectable()
export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  // These entry points share the Orders transaction; Catalog owns variant data.
  async quoteVariant(tx: Prisma.TransactionClient, id: string) {
    return tx.productVariant.findFirst({
      where: { id, isActive: true, product: { isActive: true } },
      include: {
        product: {
          include: {
            productToppings: {
              include: {
                topping: {
                  // Công thức topping để quy đổi phần topping ra nguyên liệu.
                  include: { recipeItems: { include: { ingredient: true } } },
                },
              },
            },
          },
        },
        // Công thức + nguyên liệu để tính số ly tối đa và lượng cần giữ.
        recipeItems: { include: { ingredient: true } },
      },
    });
  }

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
          availableServings: maxServings(v.recipeItems),
        })),
        toppings: p.productToppings.map((pt) => ({
          id: pt.topping.id,
          code: pt.topping.code,
          name: pt.topping.name,
          price: Number(pt.topping.price), // Ép kiểu BigInt -> number cho JSON
          // Còn bán được khi đang hoạt động và còn nguyên liệu cho ít nhất 1 phần.
          available:
            pt.topping.isActive && maxServings(pt.topping.recipeItems) > 0,
        })),
      };
    });
  }

  async getProductDetailById(id: string): Promise<ProductResponseDto> {
    const p = await this.repository.findDetailById(id);

    if (!p) {
      throw new NotFoundException('Product not found');
    }

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
        price: Number(v.price),
        availableServings: maxServings(v.recipeItems),
      })),
      toppings: p.productToppings.map((pt) => ({
        id: pt.topping.id,
        code: pt.topping.code,
        name: pt.topping.name,
        price: Number(pt.topping.price),
        available:
          pt.topping.isActive && maxServings(pt.topping.recipeItems) > 0,
      })),
    };
  }
}

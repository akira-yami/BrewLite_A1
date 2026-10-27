import type { Prisma } from '../../../generated/prisma/client.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogRepository } from '../repositories/catalog.repository.js';
import { ProductResponseDto } from '../dto/product.dto.js';

@Injectable()
export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  // These entry points share the Orders transaction; Catalog owns variant data.
  async quoteVariant(tx: Prisma.TransactionClient, id: string) {
    return tx.productVariant.findFirst({
      where: { id, isActive: true, product: { isActive: true } },
      include: {
        product: {
          include: { productToppings: { include: { topping: true } } },
        },
      },
    });
  }

  async reserveVariant(
    tx: Prisma.TransactionClient,
    id: string,
    quantity: number,
    version: number,
  ) {
    return tx.productVariant.updateMany({
      where: { id, version, stock: { gte: quantity }, isActive: true },
      data: { stock: { decrement: quantity }, version: { increment: 1 } },
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
        stock: v.stock,
      })),
      toppings: p.productToppings.map((pt) => ({
        id: pt.topping.id,
        code: pt.topping.code,
        name: pt.topping.name,
        price: Number(pt.topping.price),
        available: pt.topping.isActive,
      })),
    };
  }
}

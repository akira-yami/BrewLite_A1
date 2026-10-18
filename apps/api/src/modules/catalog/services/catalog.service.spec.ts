import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogRepository } from '../repositories/catalog.repository.js';
import { CatalogService } from './catalog.service.js';

describe('CatalogService', () => {
  let service: CatalogService;
  let repository: {
    findAllProducts: ReturnType<typeof vi.fn>;
    findDetailById: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    repository = {
      findAllProducts: vi.fn(),
      findDetailById: vi.fn(),
    };

    service = new CatalogService(
      repository as unknown as CatalogRepository,
    );
  });

  describe('getProductDetailById', () => {
    it('trả về thông tin sản phẩm và giá đúng', async () => {
      repository.findDetailById.mockResolvedValue({
        id: 'product-1',
        sku: 'COFFEE-01',
        name: 'Cà phê sữa',
        description: null,
        imageUrl: 'coffee.jpg',
        variants: [
          {
            id: 'variant-1',
            size: 'M',
            price: 35000n,
            stock: 10,
          },
          {
            id: 'variant-2',
            size: 'S',
            price: 30000n,
            stock: 20,
          },
        ],
        productToppings: [
          {
            topping: {
              id: 'topping-1',
              code: 'TOP_PEARL',
              name: 'Trân châu',
              price: 8000n,
              isActive: true,
            },
          },
        ],
      });

      const result = await service.getProductDetailById('product-1');

      expect(result.id).toBe('product-1');
      expect(result.name).toBe('Cà phê sữa');
      expect(result.description).toBe('');
      expect(result.basePrice).toBe(30000);

      expect(result.variants).toHaveLength(2);
      expect(result.variants[0].price).toBe(35000);
      expect(result.variants[1].price).toBe(30000);

      expect(result.toppings[0]).toEqual({
        id: 'topping-1',
        code: 'TOP_PEARL',
        name: 'Trân châu',
        price: 8000,
        available: true,
      });

      expect(repository.findDetailById).toHaveBeenCalledWith('product-1');
    });

    it('ném NotFoundException khi không tìm thấy sản phẩm', async () => {
      repository.findDetailById.mockResolvedValue(null);

      await expect(
        service.getProductDetailById('product-khong-ton-tai'),
      ).rejects.toThrow(NotFoundException);
    });
    it('vẫn trả về size hết hàng kèm stock bằng 0', async () => {
  repository.findDetailById.mockResolvedValue({
    id: 'product-1',
    sku: 'COFFEE-01',
    name: 'Cà phê sữa',
    description: null,
    imageUrl: 'coffee.jpg',
    variants: [
      {
        id: 'variant-1',
        size: 'M',
        price: 35000n,
        stock: 0,
      },
    ],
    productToppings: [],
  });

  const result = await service.getProductDetailById('product-1');

  expect(result.variants).toHaveLength(1);
  expect(result.variants[0].stock).toBe(0);
});
  }
);
});
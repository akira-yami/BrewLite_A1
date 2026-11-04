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

describe('getProducts', () => {
  it('TC-GET-01: trả về danh sách sản phẩm khi có dữ liệu', async () => {
    repository.findAllProducts.mockResolvedValue([
      {
        id: 'product-1',
        sku: 'COFFEE-01',
        name: 'Cà phê sữa',
        description: 'Cà phê sữa thơm ngon',
        imageUrl: 'coffee.jpg',
        variants: [
          {
            id: 'variant-1',
            size: 'M',
            price: 35000n,
            // 100g / 10g mỗi ly = 10 ly.
            recipeItems: [
              { quantity: 10, ingredient: { stockQuantity: 100, isActive: true } },
            ],
          },
          {
            id: 'variant-2',
            size: 'S',
            price: 30000n,
            // 200g / 10g mỗi ly = 20 ly.
            recipeItems: [
              { quantity: 10, ingredient: { stockQuantity: 200, isActive: true } },
            ],
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
              recipeItems: [
                { quantity: 30, ingredient: { stockQuantity: 300, isActive: true } },
              ],
            },
          },
        ],
      },
    ]);

    const result = await service.getProducts();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'product-1',
      sku: 'COFFEE-01',
      name: 'Cà phê sữa',
      description: 'Cà phê sữa thơm ngon',
      imageUrl: 'coffee.jpg',
      basePrice: 30000,
      variants: [
        {
          id: 'variant-1',
          size: 'M',
          price: 35000,
          available: true,
        },
        {
          id: 'variant-2',
          size: 'S',
          price: 30000,
          available: true,
        },
      ],
      toppings: [
        {
          id: 'topping-1',
          code: 'TOP_PEARL',
          name: 'Trân châu',
          price: 8000,
          available: true,
        },
      ],
    });

    expect(repository.findAllProducts).toHaveBeenCalledOnce();
  });

  it('TC-GET-02: trả về mảng rỗng khi không có sản phẩm', async () => {
    repository.findAllProducts.mockResolvedValue([]);

    const result = await service.getProducts();

    expect(result).toEqual([]);
    expect(repository.findAllProducts).toHaveBeenCalledOnce();
  });

  it('TC-GET-03: truyền lỗi ra ngoài khi truy xuất dữ liệu thất bại', async () => {
    const error = new Error('Database connection failed');

    repository.findAllProducts.mockRejectedValue(error);

    await expect(service.getProducts()).rejects.toThrow(
      'Database connection failed',
    );

    expect(repository.findAllProducts).toHaveBeenCalledOnce();
  });
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
            // 100g cà phê / 10g mỗi ly = 10 ly.
            recipeItems: [
              { quantity: 10, ingredient: { stockQuantity: 100, isActive: true } },
            ],
          },
          {
            id: 'variant-2',
            size: 'S',
            price: 30000n,
            recipeItems: [
              { quantity: 8, ingredient: { stockQuantity: 100, isActive: true } },
              { quantity: 50, ingredient: { stockQuantity: 500, isActive: true } },
            ],
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
              // Topping nhập sẵn: 1 phần = 30g trân châu 3Q, kho còn 300g.
              recipeItems: [
                { quantity: 30, ingredient: { stockQuantity: 300, isActive: true } },
              ],
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
      expect(result.variants[0].available).toBe(true);
      // Cả hai nguyên liệu đều đủ cho một phần theo công thức.
      expect(result.variants[1].available).toBe(true);
      expect(result.variants[0]).not.toHaveProperty('stock');

      expect(result.toppings[0]).toEqual({
        id: 'topping-1',
        code: 'TOP_PEARL',
        name: 'Trân châu',
        price: 8000,
        available: true,
      });

      expect(repository.findDetailById).toHaveBeenCalledWith('product-1');
    });

    it('topping chỉ available khi còn đủ nguyên liệu cho ít nhất 1 phần', async () => {
      const topping = (id: string, recipeItems: unknown[]) => ({
        topping: {
          id,
          code: id,
          name: id,
          price: 5000n,
          isActive: true,
          recipeItems,
        },
      });
      repository.findDetailById.mockResolvedValue({
        id: 'product-1',
        sku: 'COFFEE-01',
        name: 'Cà phê sữa',
        description: null,
        imageUrl: 'coffee.jpg',
        variants: [],
        productToppings: [
          // Nhập sẵn, đủ 1 phần (30g / 30g).
          topping('prepackaged-ok', [
            { quantity: 30, ingredient: { stockQuantity: 30, isActive: true } },
          ]),
          // Chế biến từ nhiều nguyên liệu, thiếu đường đen (5g < 15g).
          topping('prepared-short', [
            { quantity: 20, ingredient: { stockQuantity: 500, isActive: true } },
            { quantity: 15, ingredient: { stockQuantity: 5, isActive: true } },
          ]),
          // Chưa có công thức.
          topping('no-recipe', []),
        ],
      });

      const result = await service.getProductDetailById('product-1');

      expect(result.toppings.map((t) => [t.id, t.available])).toEqual([
        ['prepackaged-ok', true],
        ['prepared-short', false],
        ['no-recipe', false],
      ]);
    });

    it('ném NotFoundException khi không tìm thấy sản phẩm', async () => {
      repository.findDetailById.mockResolvedValue(null);

      await expect(
        service.getProductDetailById('product-khong-ton-tai'),
      ).rejects.toThrow(NotFoundException);
    });
    it('vẫn trả về size hết nguyên liệu hoặc chưa có công thức với available=false', async () => {
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
            recipeItems: [
              { quantity: 10, ingredient: { stockQuantity: 9, isActive: true } },
            ],
          },
          { id: 'variant-2', size: 'L', price: 40000n, recipeItems: [] },
        ],
        productToppings: [],
      });

      const result = await service.getProductDetailById('product-1');

      expect(result.variants).toHaveLength(2);
      expect(result.variants[0].available).toBe(false);
      expect(result.variants[1].available).toBe(false);
    });
  }
);
});
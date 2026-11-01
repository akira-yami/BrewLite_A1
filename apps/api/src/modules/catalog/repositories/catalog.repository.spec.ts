
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../../database/prisma.service.js';
import { CatalogRepository } from './catalog.repository.js';

describe('CatalogRepository', () => {
  let repository: CatalogRepository;

  const prisma = {
    product: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    repository = new CatalogRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('lọc topping không hoạt động khi lấy chi tiết sản phẩm', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await repository.findDetailById('product-1');

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'product-1',
        isActive: true,
      },
      include: {
        variants: {
          where: { isActive: true },
          include: { recipeItems: { include: { ingredient: true } } },
        },
        productToppings: {
          where: {
            topping: {
              isActive: true,
            },
          },
          include: {
            topping: {
              include: { recipeItems: { include: { ingredient: true } } },
            },
          },
        },
      },
    });
  });
});

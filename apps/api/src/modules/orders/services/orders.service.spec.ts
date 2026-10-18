
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersRepository } from '../repositories/orders.repository.js';
import { OrdersService } from './orders.service.js';

describe('OrdersService', () => {
  let service: OrdersService;

  const repository = {
    findActiveVariantById: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new OrdersService(
      repository as unknown as OrdersRepository,
    );

    repository.findActiveVariantById.mockResolvedValue({
      id: 'variant-1',
      size: 'M',
      price: 35000n,
      stock: 10,
      product: {
        name: 'Cà phê sữa',
        productToppings: [
          {
            topping: {
              id: 'topping-1',
              name: 'Trân châu',
              price: 8000n,
              isActive: true,
            },
          },
        ],
      },
    });
  });

  it('tính đúng giá size và topping', async () => {
    const result = await service.validateAndPriceItems([
      {
        productVariantId: 'variant-1',
        quantity: 2,
        toppingIds: ['topping-1'],
      },
    ]);

    expect(result.subtotal).toBe(86000n);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].unitPrice).toBe(35000n);
  });

  it('từ chối topping không thuộc sản phẩm', async () => {
    await expect(
      service.validateAndPriceItems([
        {
          productVariantId: 'variant-1',
          quantity: 1,
          toppingIds: ['topping-khong-hop-le'],
        },
      ]),
    ).rejects.toThrow(BadRequestException);
  });
  

  it('từ chối size không tồn tại hoặc không hoạt động', async () => {
    repository.findActiveVariantById.mockResolvedValue(null);

    await expect(
      service.validateAndPriceItems([
        {
          productVariantId: 'variant-khong-hop-le',
          quantity: 1,
        },
      ]),
    ).rejects.toThrow(NotFoundException);
  });

it('từ chối topping đã ngừng hoạt động', async () => {
  repository.findActiveVariantById.mockResolvedValue({
    id: 'variant-1',
    size: 'M',
    price: 35000n,
    stock: 10,
    product: {
      name: 'Cà phê sữa',
      productToppings: [
        {
          topping: {
            id: 'topping-1',
            name: 'Trân châu',
            price: 8000n,
            isActive: false,
          },
        },
      ],
    },
  });

  await expect(
    service.validateAndPriceItems([
      {
        productVariantId: 'variant-1',
        quantity: 1,
        toppingIds: ['topping-1'],
      },
    ]),
  ).rejects.toThrow(BadRequestException);
});

it('từ chối khi tổng số lượng cùng size vượt tồn kho', async () => {
  await expect(
    service.validateAndPriceItems([
      {
        productVariantId: 'variant-1',
        quantity: 6,
      },
      {
        productVariantId: 'variant-1',
        quantity: 5,
      },
    ]),
  ).rejects.toThrow(ConflictException);
});


  it('từ chối khi số lượng vượt tồn kho', async () => {
    await expect(
      service.validateAndPriceItems([
        {
          productVariantId: 'variant-1',
          quantity: 11,
        },
      ]),
    ).rejects.toThrow(ConflictException);
  });
});

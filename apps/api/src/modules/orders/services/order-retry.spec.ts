import { describe, expect, it, vi } from 'vitest';
import { OrdersService } from './orders.service.js';
import { CatalogService } from '../../catalog/services/catalog.service.js';
import { InventoryService } from '../../inventory/services/inventory.service.js';
import { InventoryRepository } from '../../inventory/repositories/inventory.repository.js';
import { UsersService } from '../../users/users.service.js';

function setup() {
  const variant = {
    id: 'variant',
    version: 7,
    size: 'M',
    price: 40000n,
    stock: 10,
    product: { name: 'Coffee', productToppings: [] },
  };

  const tx = {
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'user' }) },
    productVariant: {
      findFirst: vi.fn().mockResolvedValue(variant),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    order: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        ...data,
        id: 'order',
        items: [],
        createdAt: new Date(),
      })),
    },
    inventoryReservation: { create: vi.fn() },
    orderStatusHistory: { create: vi.fn() },
  };

  const prisma = {
    $transaction: vi.fn(async (callback) => callback(tx)),
  };

  // Mock repository của InventoryService mới.
  const inventoryRepository = {
    findVariant: vi.fn(),
    reserveStock: vi.fn(
      async (
        transaction,
        variantId,
        quantity,
        expectedVersion,
      ) => {
        return transaction.productVariant.updateMany({
          where: {
            id: variantId,
            version: expectedVersion,
            stock: { gte: quantity },
            isActive: true,
          },
          data: {
            stock: { decrement: quantity },
            version: { increment: 1 },
          },
        });
      },
    ),
    createReservation: vi.fn(
      async (
        transaction,
        orderId,
        variantId,
        quantity,
        expiresAt,
      ) => {
        return transaction.inventoryReservation.create({
          data: {
            orderId,
            productVariantId: variantId,
            quantity,
            status: 'ACTIVE',
            expiresAt,
          },
        });
      },
    ),
  };

  const catalog = new CatalogService({} as any);

  const inventory = new InventoryService(
    prisma as any,
    inventoryRepository as any,
  );

  const service = new OrdersService(
    {} as any,
    prisma as any,
    {} as any,
    catalog,
    inventory,
    new UsersService(),
  );

  const dto = {
    items: [{ productVariantId: 'variant', quantity: 1 }],
  };

  return { service, tx, prisma, dto, variant };
}

describe('Order transaction regression checks', () => {
  it('quotes and updates within the same Serializable transaction with the expected version', async () => {
    const { service, tx, prisma, dto } = setup();
    await service.createOrder('user', dto);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'variant', version: 7, isActive: true, stock: { gte: 1 } },
      data: { stock: { decrement: 1 }, version: { increment: 1 } },
    });
  });

  it('re-quotes after a version conflict and snapshots the new price/version', async () => {
    const { service, tx, dto, variant } = setup();
    tx.productVariant.updateMany.mockResolvedValueOnce({ count: 0 });
    tx.productVariant.findFirst
      .mockResolvedValueOnce(variant)
      .mockResolvedValueOnce({ ...variant, version: 8, price: 45000n });
    const response = await service.createOrder('user', dto);
    expect(response.total).toBe(45000);
    expect(tx.productVariant.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 8 }),
      }),
    );
    expect(tx.orderStatusHistory.create).toHaveBeenCalledTimes(1);
  });

  it.each(['P2034', '40001', '40P01'])(
    'retries a whole transaction after %s',
    async (code) => {
      const { service, prisma, dto } = setup();
      prisma.$transaction.mockRejectedValueOnce({ code });
      await service.createOrder('user', dto);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    },
  );

  it('regenerates a colliding order number within its database length limit', async () => {
    const { service, tx, dto } = setup();
    tx.order.create.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['order_number'] },
    });
    await service.createOrder('user', dto);
    const numbers = tx.order.create.mock.calls.map(
      ([args]) => args.data.orderNumber,
    );
    expect(new Set(numbers).size).toBe(2);
    expect(numbers.every((value) => value.length <= 30)).toBe(true);
  });

  it('stops after three version conflicts with INVENTORY_CONFLICT', async () => {
    const { service, tx, prisma, dto } = setup();
    tx.productVariant.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.createOrder('user', dto)).rejects.toMatchObject({
      response: { error: { code: 'INVENTORY_CONFLICT' } },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry insufficient stock or an inactive principal', async () => {
    const { service, tx, prisma, dto, variant } = setup();
    tx.productVariant.findFirst.mockResolvedValue({ ...variant, stock: 0 });
    await expect(service.createOrder('user', dto)).rejects.toMatchObject({
      response: { error: { code: 'OUT_OF_STOCK' } },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    tx.user.findFirst.mockResolvedValue(null);
    await expect(service.createOrder('user', dto)).rejects.toMatchObject({
      status: 401,
    });
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('reserves multiple variants in UUID order with aggregated quantities', async () => {
    const { service, tx, dto, variant } = setup();
    tx.productVariant.findFirst.mockImplementation(async ({ where }) => ({
      ...variant,
      id: where.id,
    }));
    dto.items = [
      { productVariantId: 'b', quantity: 1 },
      { productVariantId: 'a', quantity: 1 },
      { productVariantId: 'b', quantity: 2 },
    ];
    await service.createOrder('user', dto);
    expect(
      tx.productVariant.updateMany.mock.calls.map(([args]) => [
        args.where.id,
        args.data.stock.decrement,
      ]),
    ).toEqual([
      ['a', 1],
      ['b', 3],
    ]);
  });
});

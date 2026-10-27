
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

import { OrdersRepository } from '../src/modules/orders/repositories/orders.repository.js';
import { OrdersService } from '../src/modules/orders/services/orders.service.js';

import { InventoryService } from '../src/modules/inventory/inventory.service.js';

import { CatalogRepository } from '../src/modules/catalog/repositories/catalog.repository.js';
import { CatalogService } from '../src/modules/catalog/services/catalog.service.js';

import { PromotionsRepository } from '../src/modules/promotions/repositories/promotions.repository.js';
import { PromotionsService } from '../src/modules/promotions/services/promotions.service.js';

import { UsersService } from '../src/modules/users/users.service.js';

const connectionString = process.env.SMOKE_DATABASE_URL;

if (
  !connectionString ||
  !new URL(connectionString).pathname
    .slice(1)
    .startsWith('brewlite_foundation_smoke')
) {
  throw new Error(
    'Set SMOKE_DATABASE_URL to the disposable BrewLite smoke database',
  );
}

describe('Orders -> Inventory integration', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const ordersRepository = new OrdersRepository(prisma as never);

  const catalogService = new CatalogService(
    new CatalogRepository(prisma as never),
  );

  const promotionsService = new PromotionsService(
    new PromotionsRepository(prisma as never),
  );

  const usersService = new UsersService();
  const inventoryService = new InventoryService(catalogService);

  const ordersService = new OrdersService(
    ordersRepository,
    prisma as never,
    promotionsService,
    catalogService,
    inventoryService,
    usersService,
  );

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createFixture(stock: number) {
    const user = await prisma.user.create({
      data: {
        username: `orders-inventory-${randomUUID()}`,
        passwordHash: 'integration-test-only',
        role: 'CUSTOMER',
        isActive: true,
      },
    });

    const product = await prisma.product.create({
      data: {
        sku: `OI-${randomUUID()}`,
        name: 'Orders inventory integration product',
        imageUrl: '/orders-inventory-test.png',
        variants: {
          create: {
            size: 'M',
            price: 40000n,
            stock,
          },
        },
      },
      include: {
        variants: true,
      },
    });

    const variant = product.variants[0];

    if (!variant) {
      throw new Error('Integration fixture did not create a product variant');
    }

    return { user, variant };
  }

  it('creates an order and reserves stock in the same transaction', async () => {
    const { user, variant } = await createFixture(3);

    const order = await ordersService.createOrder(user.id, {
      items: [
        {
          productVariantId: variant.id,
          quantity: 2,
        },
      ],
    });

    const savedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        items: true,
        inventoryReservations: true,
      },
    });

    const variantAfter = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    });

    expect(savedOrder.items).toHaveLength(1);
    expect(savedOrder.items[0].quantity).toBe(2);

    expect(savedOrder.inventoryReservations).toHaveLength(1);
    expect(savedOrder.inventoryReservations[0].quantity).toBe(2);
    expect(savedOrder.inventoryReservations[0].status).toBe('ACTIVE');

    expect(variantAfter.stock).toBe(1);
    expect(variantAfter.version).toBe(1);
  });

  it('rolls back the order and stock when inventory reservation fails', async () => {
    const { user, variant } = await createFixture(3);

    // Tạo CatalogService riêng để gây lỗi trong bước reserve của transaction.
    const failingCatalogService = new CatalogService(
      new CatalogRepository(prisma as never),
    );

    failingCatalogService.reserveVariant = async () => {
      throw new Error('Injected reservation creation failure');
    };

    const failingInventoryService = new InventoryService(
      failingCatalogService,
    );

    const failingOrdersService = new OrdersService(
      ordersRepository,
      prisma as never,
      promotionsService,
      failingCatalogService,
      failingInventoryService,
      usersService,
    );

    const ordersBefore = await prisma.order.count({
      where: { userId: user.id },
    });

    await expect(
      failingOrdersService.createOrder(user.id, {
        items: [
          {
            productVariantId: variant.id,
            quantity: 2,
          },
        ],
      }),
    ).rejects.toThrow('Injected reservation creation failure');

    const ordersAfter = await prisma.order.count({
      where: { userId: user.id },
    });

    const variantAfter = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    });

    const reservations = await prisma.inventoryReservation.findMany({
      where: { productVariantId: variant.id },
    });

    expect(ordersAfter).toBe(ordersBefore);
    expect(variantAfter.stock).toBe(3);
    expect(variantAfter.version).toBe(0);
    expect(reservations).toHaveLength(0);
  });
});

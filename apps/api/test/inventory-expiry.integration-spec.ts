import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client.js';

import { InventoryRepository } from '../src/modules/inventory/repositories/inventory.repository.js';
import { OrdersRepository } from '../src/modules/orders/repositories/orders.repository.js';
import { OrderExpiryJob } from '../src/modules/orders/services/order-expiry.job.js';
import { InventoryService } from '../src/modules/inventory/services/inventory.service.js';
import { PromotionsRepository } from '../src/modules/promotions/repositories/promotions.repository.js';
import { PromotionsService } from '../src/modules/promotions/services/promotions.service.js';

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

describe('SD-13 inventory expiry job', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const inventoryRepository = new InventoryRepository();
  const ordersRepository = new OrdersRepository(prisma as never);

  const inventoryService = new InventoryService(
    prisma as never,
    inventoryRepository,
  );
  const promotionsService = new PromotionsService(
    new PromotionsRepository(prisma as never),
  );

  const expiryJob = new OrderExpiryJob(
    prisma as never,
    ordersRepository,
    inventoryService,
    promotionsService,
  );

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('expires overdue reservations and restores stock exactly once', async () => {
    const user = await prisma.user.create({
      data: {
        username: `expiry-job-${randomUUID()}`,
        passwordHash: 'integration-test-only',
      },
    });

    // Mỗi ly dùng 10g; kho có 20g nên làm được tối đa 2 ly.
    const ingredient = await prisma.ingredient.create({
      data: {
        code: `EXPJOB-BEAN-${randomUUID()}`,
        name: 'Expiry job coffee beans',
        unit: 'G',
        stockQuantity: 20,
      },
    });

    const product = await prisma.product.create({
      data: {
        sku: `EXPJOB-${randomUUID()}`,
        name: 'Expiry job integration product',
        imageUrl: '/expiry-job-test.png',
        variants: {
          create: {
            size: 'M',
            price: 40000n,
            recipeItems: {
              create: { ingredientId: ingredient.id, quantity: 10 },
            },
          },
        },
      },
      include: {
        variants: true,
      },
    });

    const variant = product.variants[0];

    if (!variant) {
      throw new Error('Product variant was not created');
    }

    const futureExpiry = new Date(Date.now() + 15 * 60 * 1000);

    const order = await prisma.order.create({
      data: {
        orderNumber: `EXPJOB-${randomUUID().slice(0, 8)}`,
        userId: user.id,
        subtotal: 40000n,
        total: 40000n,
        reservationExpiresAt: futureExpiry,
        items: {
          create: {
            productVariantId: variant.id,
            productNameSnapshot: product.name,
            variantNameSnapshot: 'M',
            unitPrice: 40000n,
            quantity: 1,
          },
        },
        statusHistories: {
          create: {
            toStatus: 'PENDING',
          },
        },
      },
    });

    const reservations = await prisma.$transaction((tx) =>
      inventoryService.reserve(
        tx,
        order.id,
        [
          {
            productVariantId: variant.id,
            quantity: 1,
          },
        ],
        futureExpiry,
      ),
    );

    const reservation = reservations[0];

    if (!reservation) {
      throw new Error('Inventory reservation was not created');
    }

    // Đưa cả đơn hàng và reservation về trạng thái quá hạn.
    // Job kiểm tra reservationExpiresAt của đơn hàng.
    const expiredAt = new Date(Date.now() - 60 * 1000);

    await prisma.inventoryReservation.update({
      where: {
        id: reservation.id,
      },
      data: {
        expiresAt: expiredAt,
      },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { reservationExpiresAt: expiredAt },
    });

    const stockAfterReserve = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredient.id },
    });

    expect(stockAfterReserve.stockQuantity).toBe(10);
    expect(stockAfterReserve.version).toBe(1);

    // Chạy job lần thứ nhất.
    await expiryJob.handleExpiredOrders();

    const expiredReservation =
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: {
          id: reservation.id,
        },
      });

    const stockAfterExpiry = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredient.id },
    });

    expect(expiredReservation.status).toBe('EXPIRED');
    expect(stockAfterExpiry.stockQuantity).toBe(20);
    expect(stockAfterExpiry.version).toBe(2);

    // Chạy lại job: reservation đã EXPIRED nên không được hoàn nguyên liệu lần nữa.
    await expiryJob.handleExpiredOrders();

    const stockAfterSecondRun = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredient.id },
    });

    expect(stockAfterSecondRun.stockQuantity).toBe(20);
    expect(stockAfterSecondRun.version).toBe(2);
  });
});

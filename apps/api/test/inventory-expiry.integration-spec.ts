import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

import { InventoryRepository } from '../src/modules/inventory/repositories/inventory.repository.js';
import { InventoryService } from '../src/modules/inventory/services/inventory.service.js';

import { OrdersRepository } from '../src/modules/orders/repositories/orders.repository.js';
import { OrderExpiryJob } from '../src/modules/orders/services/order-expiry.job.js';

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

  const expiryJob = new OrderExpiryJob(
    prisma as never,
    ordersRepository,
    inventoryService,
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

    const product = await prisma.product.create({
      data: {
        sku: `EXPJOB-${randomUUID()}`,
        name: 'Expiry job integration product',
        imageUrl: '/expiry-job-test.png',
        variants: {
          create: {
            size: 'M',
            price: 40000n,
            stock: 2,
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
      where: {
        id: order.id,
      },
      data: {
        reservationExpiresAt: expiredAt,
      },
    });

    // Kiểm tra tồn kho sau khi reserve.
    const stockAfterReserve =
      await prisma.productVariant.findUniqueOrThrow({
        where: {
          id: variant.id,
        },
      });

    expect(stockAfterReserve.stock).toBe(1);
    expect(stockAfterReserve.version).toBe(1);

    // Chạy job lần thứ nhất.
    await expiryJob.handleExpiredOrders();

    const expiredReservation =
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: {
          id: reservation.id,
        },
      });

    const stockAfterExpiry =
      await prisma.productVariant.findUniqueOrThrow({
        where: {
          id: variant.id,
        },
      });

    expect(expiredReservation.status).toBe('EXPIRED');
    expect(stockAfterExpiry.stock).toBe(2);
    expect(stockAfterExpiry.version).toBe(2);

    // Chạy job lần thứ hai.
    // Reservation đã EXPIRED nên không được hoàn kho thêm lần nữa.
    await expiryJob.handleExpiredOrders();

    const stockAfterSecondRun =
      await prisma.productVariant.findUniqueOrThrow({
        where: {
          id: variant.id,
        },
      });

    expect(stockAfterSecondRun.stock).toBe(2);
    expect(stockAfterSecondRun.version).toBe(2);

    console.log('\n===== INVENTORY EXPIRY JOB RESULT =====');
    console.log('Reservation status:', expiredReservation.status);
    console.log('Stock before expiry:', stockAfterReserve.stock);
    console.log('Stock after expiry:', stockAfterExpiry.stock);
    console.log('Version after expiry:', stockAfterExpiry.version);
    console.log('Stock after second run:', stockAfterSecondRun.stock);
    console.log('=======================================\n');
  });
});
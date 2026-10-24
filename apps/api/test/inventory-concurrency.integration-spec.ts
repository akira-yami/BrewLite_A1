
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { InventoryRepository } from '../src/modules/inventory/repositories/inventory.repository.js';
import { InventoryService } from '../src/modules/inventory/services/inventory.service.js';

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

describe('SD-13 inventory concurrency on PostgreSQL', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const repository = new InventoryRepository();
  const service = new InventoryService(
    prisma as never,
    repository,
  );

  let variantId: string;
  let orderIds: string[];
  
it('release restores stock exactly once', async () => {
  const user = await prisma.user.create({
    data: {
      username: `release-${randomUUID()}`,
      passwordHash: 'integration-test-only',
    },
  });

  const product = await prisma.product.create({
    data: {
      sku: `REL-${randomUUID()}`,
      name: 'Release test product',
      imageUrl: '/release-test.png',
      variants: {
        create: {
          size: 'M',
          price: 40000n,
          stock: 2,
        },
      },
    },
    include: { variants: true },
  });

  const variant = product.variants[0];
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const reservation = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNumber: `REL-${randomUUID().slice(0, 8)}`,
        userId: user.id,
        subtotal: 40000n,
        total: 40000n,
        reservationExpiresAt: expiresAt,
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
          create: { toStatus: 'PENDING' },
        },
      },
    });

    const reservations = await service.reserve(
      tx,
      order.id,
      [{ productVariantId: variant.id, quantity: 1 }],
      expiresAt,
    );

    return reservations[0];
  });

  const result = await service.release(reservation.id);

  const variantAfter = await prisma.productVariant.findUniqueOrThrow({
    where: { id: variant.id },
  });

  const savedReservation =
    await prisma.inventoryReservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });

  expect(result.status).toBe('RELEASED');
  expect(savedReservation.status).toBe('RELEASED');
  expect(variantAfter.stock).toBe(2);
  expect(variantAfter.version).toBe(2);

  console.log('\n========== RELEASE TEST RESULT ==========');
  console.log('Reservation status:', savedReservation.status);
  console.log('Stock after release:', variantAfter.stock);
  console.log('Version after release:', variantAfter.version);
  console.log('=========================================\n');
});

it('expires an overdue reservation and restores stock exactly once', async () => {
  const user = await prisma.user.create({
    data: {
      username: `expiry-${randomUUID()}`,
      passwordHash: 'integration-test-only',
    },
  });

  const product = await prisma.product.create({
    data: {
      sku: `EXP-${randomUUID()}`,
      name: 'Expiry test product',
      imageUrl: '/expiry-test.png',
      variants: {
        create: {
          size: 'M',
          price: 40000n,
          stock: 2,
        },
      },
    },
    include: { variants: true },
  });

  const variant = product.variants[0];
  // Thời điểm hết hạn đã ở trong quá khứ.
  const expiresAt = new Date(Date.now() - 60_000);

  const reservation = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNumber: `EXP-${randomUUID().slice(0, 8)}`,
        userId: user.id,
        subtotal: 40000n,
        total: 40000n,
        reservationExpiresAt: new Date(Date.now() + 900_000),
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
          create: { toStatus: 'PENDING' },
        },
      },
    });

    // Giữ hàng bằng một expiry còn ở tương lai trước.
    const reservations = await service.reserve(
      tx,
      order.id,
      [{ productVariantId: variant.id, quantity: 1 }],
      new Date(Date.now() + 900_000),
    );

    return reservations[0];
  });

  // Đưa expiry của reservation về quá khứ để mô phỏng hết hạn.
  await prisma.inventoryReservation.update({
    where: { id: reservation.id },
    data: { expiresAt },
  });

  const result = await service.release(reservation.id, true);

  const savedReservation =
    await prisma.inventoryReservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });

  const variantAfter = await prisma.productVariant.findUniqueOrThrow({
    where: { id: variant.id },
  });

  expect(result.status).toBe('EXPIRED');
  expect(savedReservation.status).toBe('EXPIRED');
  expect(variantAfter.stock).toBe(2);
  expect(variantAfter.version).toBe(2);

  // Gọi lại không được hoàn kho lần thứ hai.
  await expect(
    service.release(reservation.id, true),
  ).rejects.toThrow();

  const variantAfterSecondAttempt =
    await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    });

  expect(variantAfterSecondAttempt.stock).toBe(2);
  expect(variantAfterSecondAttempt.version).toBe(2);

  console.log('\n========== EXPIRY TEST RESULT ==========');
  console.log('Reservation status:', savedReservation.status);
  console.log('Stock after expiry:', variantAfterSecondAttempt.stock);
  console.log('Version after expiry:', variantAfterSecondAttempt.version);
  console.log('Second expiry attempt: rejected');
  console.log('========================================\n');
});


  
it('consume changes ACTIVE reservation to CONSUMED without restoring stock', async () => {
  const user = await prisma.user.create({
    data: {
      username: `consume-${randomUUID()}`,
      passwordHash: 'integration-test-only',
    },
  });

  const product = await prisma.product.create({
    data: {
      sku: `CON-${randomUUID()}`,
      name: 'Consume test product',
      imageUrl: '/consume-test.png',
      variants: {
        create: {
          size: 'M',
          price: 40000n,
          stock: 2,
        },
      },
    },
    include: { variants: true },
  });

  const variant = product.variants[0];
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNumber: `CON-${randomUUID().slice(0, 8)}`,
        userId: user.id,
        subtotal: 40000n,
        total: 40000n,
        reservationExpiresAt: expiresAt,
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
          create: { toStatus: 'PENDING' },
        },
      },
    });

    const reservations = await service.reserve(
      tx,
      order.id,
      [{ productVariantId: variant.id, quantity: 1 }],
      expiresAt,
    );

    return reservations[0];
  });

  const consumed = await service.consume(result.id);

  const reservation = await prisma.inventoryReservation.findUniqueOrThrow({
    where: { id: result.id },
  });

  const variantAfter = await prisma.productVariant.findUniqueOrThrow({
    where: { id: variant.id },
  });

  expect(consumed.status).toBe('CONSUMED');
  expect(reservation.status).toBe('CONSUMED');
  expect(variantAfter.stock).toBe(1);
  expect(variantAfter.version).toBe(1);

  console.log('\n========== CONSUME TEST RESULT ==========');
  console.log('Reservation status:', reservation.status);
  console.log('Stock after consume:', variantAfter.stock);
  console.log('Version after consume:', variantAfter.version);
  console.log('=========================================\n');
});


  beforeAll(async () => {
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        username: `inventory-${randomUUID()}`,
        passwordHash: 'integration-test-only',
      },
    });

    const product = await prisma.product.create({
      data: {
        sku: `INV-${randomUUID()}`,
        name: 'Inventory concurrency test product',
        imageUrl: '/inventory-test.png',
        variants: {
          create: {
            size: 'M',
            price: 40000n,
            stock: 1,
          },
        },
      },
      include: { variants: true },
    });

    variantId = product.variants[0].id;

    orderIds = await Promise.all(
      [1, 2].map(async () => {
        const order = await prisma.order.create({
          data: {
            orderNumber: `INV-${randomUUID().slice(0, 8)}`,
            userId: user.id,
            subtotal: 40000n,
            total: 40000n,
            reservationExpiresAt: new Date(Date.now() + 900000),
            items: {
              create: {
                productVariantId: variantId,
                productNameSnapshot: product.name,
                variantNameSnapshot: 'M',
                unitPrice: 40000n,
                quantity: 1,
              },
            },
            statusHistories: {
              create: { toStatus: 'PENDING' },
            },
          },
        });

        return order.id;
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows only one of two concurrent reservations for the last item', async () => {
    const results = await Promise.allSettled(
      orderIds.map((orderId) =>
        prisma.$transaction((tx) =>
          service.reserve(
            tx,
            orderId,
            [{ productVariantId: variantId, quantity: 1 }],
            new Date(Date.now() + 15 * 60 * 1000),
          ),
        ),
      ),
    );

    const successes = results.filter(
      (result) => result.status === 'fulfilled',
    );
    const failures = results.filter(
      (result) => result.status === 'rejected',
    );

    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    });

    const reservations = await prisma.inventoryReservation.findMany({
      where: {
        orderId: { in: orderIds },
        productVariantId: variantId,
      },
    });

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(variant.stock).toBe(0);
    expect(variant.version).toBe(1);
    expect(reservations).toHaveLength(1);
    expect(reservations[0].status).toBe('ACTIVE');
    console.log('\n========== SD-13 TEST RESULT ==========');
console.log('Số giao dịch thành công:', successes.length);
console.log('Số giao dịch thất bại:', failures.length);
console.log('Tồn kho cuối cùng:', variant.stock);
console.log('Version cuối cùng:', variant.version);
console.log('Số reservation được tạo:', reservations.length);
console.log('Trạng thái reservation:', reservations[0].status);
console.log('=======================================\n');
  });
});

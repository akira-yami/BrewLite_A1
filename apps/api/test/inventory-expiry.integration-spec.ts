import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PromotionsRepository } from '../src/modules/promotions/repositories/promotions.repository.js';
import { InventoryRepository } from '../src/modules/inventory/repositories/inventory.repository.js';
import { OrdersRepository } from '../src/modules/orders/repositories/orders.repository.js';
import { OrderExpiryJob } from '../src/modules/orders/services/order-expiry.job.js';
import { InventoryService } from '../src/modules/inventory/services/inventory.service.js';
import { vi } from 'vitest';
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
  const promotionsRepository = new PromotionsService(new PromotionsRepository(prisma as never));

  const inventoryService = new InventoryService(
    prisma as never,
    inventoryRepository,
  );

  const expiryJob = new OrderExpiryJob(
    prisma as never,
    ordersRepository,
    inventoryService,
    promotionsRepository,
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
    // Tạo coupon thật trong database để kiểm tra job giải phóng coupon.
const coupon = await prisma.coupon.create({
  data: {
    code: `EXPJOB-${randomUUID()}`,
    discountType: 'FIXED_AMOUNT',
    discountValue: 5000n,
    startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
});

// Gắn coupon với đơn hàng bằng trạng thái RESERVED.
const couponRedemption = await prisma.couponRedemption.create({
  data: {
    couponId: coupon.id,
    userId: user.id,
    orderId: order.id,
    discountAmount: 5000n,
    status: 'RESERVED',
    expiresAt: futureExpiry,
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
    // Kiểm tra coupon đã được giải phóng trong database.
    const expiredCouponRedemption =
  await prisma.couponRedemption.findUniqueOrThrow({
    where: {
      id: couponRedemption.id,
    },
  });

expect(expiredCouponRedemption.status).toBe('EXPIRED');
expect(expiredCouponRedemption.releasedAt).not.toBeNull();

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
    // Chạy job lần hai không được xử lý lại coupon.
const couponAfterSecondRun =
  await prisma.couponRedemption.findUniqueOrThrow({
    where: {
      id: couponRedemption.id,
    },
  });

expect(couponAfterSecondRun.status).toBe('EXPIRED');
expect(couponAfterSecondRun.releasedAt).toEqual(
  expiredCouponRedemption.releasedAt,
);
  });
  it('expires PAYMENT_FAILED orders and releases inventory and coupon exactly once', async () => {
    const user = await prisma.user.create({
      data: {
        username: `expiry-payment-failed-${randomUUID()}`,
        passwordHash: 'integration-test-only',
      },
    });

    const ingredient = await prisma.ingredient.create({
      data: {
        code: `EXPFAILED-${randomUUID()}`,
        name: 'Payment failed coffee beans',
        unit: 'G',
        stockQuantity: 20,
      },
    });

    const product = await prisma.product.create({
      data: {
        sku: `EXPFAILED-${randomUUID()}`,
        name: 'Payment failed integration product',
        imageUrl: '/payment-failed-test.png',
        variants: {
          create: {
            size: 'M',
            price: 40000n,
            recipeItems: {
              create: {
                ingredientId: ingredient.id,
                quantity: 10,
              },
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

    // Tạo đơn ở trạng thái PAYMENT_FAILED ngay từ đầu.
    const order = await prisma.order.create({
      data: {
        orderNumber: `EXPFAILED-${randomUUID().slice(0, 8)}`,
        userId: user.id,
        subtotal: 40000n,
        total: 40000n,
        status: 'PAYMENT_FAILED',
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
            toStatus: 'PAYMENT_FAILED',
          },
        },
      },
    });

    // Tạo coupon và redemption đang được giữ.
    const coupon = await prisma.coupon.create({
      data: {
        code: `EXPFAILED-${randomUUID()}`,
        discountType: 'FIXED_AMOUNT',
        discountValue: 5000n,
        startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const couponRedemption = await prisma.couponRedemption.create({
      data: {
        couponId: coupon.id,
        userId: user.id,
        orderId: order.id,
        discountAmount: 5000n,
        status: 'RESERVED',
        expiresAt: futureExpiry,
      },
    });

    // Giữ 10g nguyên liệu cho đơn hàng.
    const reservations = await prisma.$transaction((tx) =>
      inventoryService.reserve(
        tx,
        order.id,
        [{ productVariantId: variant.id, quantity: 1 }],
        futureExpiry,
      ),
    );

    const reservation = reservations[0];

    if (!reservation) {
      throw new Error('Inventory reservation was not created');
    }

    // Đưa thời hạn đơn hàng và reservation về quá khứ.
    const expiredAt = new Date(Date.now() - 60 * 1000);

    await prisma.inventoryReservation.update({
      where: { id: reservation.id },
      data: { expiresAt: expiredAt },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { reservationExpiresAt: expiredAt },
    });

    const stockBeforeExpiry = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredient.id },
    });

    expect(stockBeforeExpiry.stockQuantity).toBe(10);
    expect(stockBeforeExpiry.version).toBe(1);

    // Lần chạy thứ nhất: job phải hủy đơn và giải phóng tài nguyên.
    await expiryJob.handleExpiredOrders();

    const orderAfterExpiry = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });

    const reservationAfterExpiry =
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });

    const stockAfterExpiry = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredient.id },
    });

    const couponAfterExpiry =
      await prisma.couponRedemption.findUniqueOrThrow({
        where: { id: couponRedemption.id },
      });

    expect(orderAfterExpiry.status).toBe('CANCELLED');
    expect(reservationAfterExpiry.status).toBe('EXPIRED');
    expect(stockAfterExpiry.stockQuantity).toBe(20);
    expect(stockAfterExpiry.version).toBe(2);
    expect(couponAfterExpiry.status).toBe('EXPIRED');
    expect(couponAfterExpiry.releasedAt).not.toBeNull();

    const firstReleasedAt = couponAfterExpiry.releasedAt;

    // Lần chạy thứ hai: không được giải phóng thêm lần nữa.
    await expiryJob.handleExpiredOrders();

    const orderAfterSecondRun = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });

    const reservationAfterSecondRun =
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });

    const stockAfterSecondRun = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredient.id },
    });

    const couponAfterSecondRun =
      await prisma.couponRedemption.findUniqueOrThrow({
        where: { id: couponRedemption.id },
      });

    expect(orderAfterSecondRun.status).toBe('CANCELLED');
    expect(reservationAfterSecondRun.status).toBe('EXPIRED');
    expect(stockAfterSecondRun.stockQuantity).toBe(20);
    expect(stockAfterSecondRun.version).toBe(2);
    expect(couponAfterSecondRun.status).toBe('EXPIRED');
    expect(couponAfterSecondRun.releasedAt).toEqual(firstReleasedAt);
  });
  it('rolls back order, inventory and coupon when coupon release fails', async () => {
    const user = await prisma.user.create({
      data: {
        username: `expiry-rollback-${randomUUID()}`,
        passwordHash: 'integration-test-only',
      },
    });

    // Tạo nguyên liệu có 20g tồn kho.
    const ingredient = await prisma.ingredient.create({
      data: {
        code: `EXPROLLBACK-${randomUUID()}`,
        name: 'Expiry rollback coffee beans',
        unit: 'G',
        stockQuantity: 20,
      },
    });

    // Tạo sản phẩm có công thức sử dụng 10g nguyên liệu.
    const product = await prisma.product.create({
      data: {
        sku: `EXPROLLBACK-${randomUUID()}`,
        name: 'Expiry rollback integration product',
        imageUrl: '/expiry-rollback-test.png',
        variants: {
          create: {
            size: 'M',
            price: 40000n,
            recipeItems: {
              create: {
                ingredientId: ingredient.id,
                quantity: 10,
              },
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

    // Tạo đơn hàng PENDING.
    const order = await prisma.order.create({
      data: {
        orderNumber: `EXPROLLBACK-${randomUUID().slice(0, 8)}`,
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

    // Tạo coupon và redemption RESERVED.
    const coupon = await prisma.coupon.create({
      data: {
        code: `EXPROLLBACK-${randomUUID()}`,
        discountType: 'FIXED_AMOUNT',
        discountValue: 5000n,
        startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const couponRedemption = await prisma.couponRedemption.create({
      data: {
        couponId: coupon.id,
        userId: user.id,
        orderId: order.id,
        discountAmount: 5000n,
        status: 'RESERVED',
        expiresAt: futureExpiry,
      },
    });

    // Đặt trước nguyên liệu trong kho.
    const reservations = await prisma.$transaction((tx) =>
      inventoryService.reserve(
        tx,
        order.id,
        [{ productVariantId: variant.id, quantity: 1 }],
        futureExpiry,
      ),
    );

    const reservation = reservations[0];

    if (!reservation) {
      throw new Error('Inventory reservation was not created');
    }

    // Chuyển thời hạn đơn hàng và reservation về quá khứ.
    const expiredAt = new Date(Date.now() - 60 * 1000);

    await prisma.inventoryReservation.update({
      where: { id: reservation.id },
      data: { expiresAt: expiredAt },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { reservationExpiresAt: expiredAt },
    });

    // Xác nhận trạng thái ban đầu sau khi đặt trước nguyên liệu.
    const stockBeforeExpiry = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredient.id },
    });

    expect(stockBeforeExpiry.stockQuantity).toBe(10);
    expect(stockBeforeExpiry.version).toBe(1);

    // Chỉ giả lập lỗi giải phóng coupon của đơn hàng đang kiểm thử.
    // Các đơn hàng khác vẫn sử dụng repository thật.
    const originalReleaseByOrderId =
      promotionsRepository.releaseByOrderId.bind(promotionsRepository);

    const releaseSpy = vi
      .spyOn(promotionsRepository, 'releaseByOrderId')
      .mockImplementation(async (orderId, targetStatus, releasedAt, tx) => {
        if (orderId === order.id) {
          throw new Error('Forced coupon release failure');
        }

        return originalReleaseByOrderId(
          orderId,
          targetStatus,
          releasedAt,
          tx,
        );
      });

    try {
      // Job sẽ hủy đơn, hoàn kho rồi gặp lỗi khi giải phóng coupon.
      await expiryJob.handleExpiredOrders();
    } finally {
      releaseSpy.mockRestore();
    }

    // Đọc lại dữ liệu thật từ PostgreSQL để kiểm tra rollback.
    const orderAfterFailure = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });

    const reservationAfterFailure =
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });

    const stockAfterFailure = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredient.id },
    });

    const couponAfterFailure =
      await prisma.couponRedemption.findUniqueOrThrow({
        where: { id: couponRedemption.id },
      });

    // Đơn hàng phải trở về trạng thái ban đầu.
    expect(orderAfterFailure.status).toBe('PENDING');

    // Reservation vẫn ACTIVE, chưa được giải phóng.
    expect(reservationAfterFailure.status).toBe('ACTIVE');

    // Kho vẫn giữ nguyên trạng thái đã đặt trước.
    expect(stockAfterFailure.stockQuantity).toBe(10);
    expect(stockAfterFailure.version).toBe(1);

    // Coupon vẫn RESERVED, chưa được giải phóng.
    expect(couponAfterFailure.status).toBe('RESERVED');
    expect(couponAfterFailure.releasedAt).toBeNull();
  });

});

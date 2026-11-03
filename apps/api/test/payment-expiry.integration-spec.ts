import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { loadAppConfig } from '../src/config/app-config.js';
import { InventoryRepository } from '../src/modules/inventory/repositories/inventory.repository.js';
import { InventoryService } from '../src/modules/inventory/services/inventory.service.js';
import { OrdersRepository } from '../src/modules/orders/repositories/orders.repository.js';
import { OrdersService } from '../src/modules/orders/services/orders.service.js';
import { OrderExpiryJob } from '../src/modules/orders/services/order-expiry.job.js';
import { PaymentsRepository } from '../src/modules/payments/repositories/payments.repository.js';
import { PaymentsService } from '../src/modules/payments/services/payments.service.js';
import { PromotionsRepository } from '../src/modules/promotions/repositories/promotions.repository.js';
import { PromotionsService } from '../src/modules/promotions/services/promotions.service.js';

const connectionString = process.env.SMOKE_DATABASE_URL;
if (!connectionString || !new URL(connectionString).pathname.slice(1).startsWith('brewlite_foundation_smoke')) {
  throw new Error('Set SMOKE_DATABASE_URL to the disposable BrewLite smoke database');
}

describe('payment admission and reservation expiry (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const ordersRepo = new OrdersRepository(prisma as never);
  const inventory = new InventoryService(prisma as never, new InventoryRepository());
  const promotionsRepo = new PromotionsRepository(prisma as never);
  const promotions = new PromotionsService(promotionsRepo);
  const orders = new OrdersService(ordersRepo, prisma as never, promotions, {} as never, inventory, {} as never, loadAppConfig({ NODE_ENV: 'test' }));
  const job = () => new OrderExpiryJob(prisma as never, ordersRepo, inventory, promotions);

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  afterEach(() => vi.restoreAllMocks());

  async function fixture(status: 'PENDING' | 'PAYMENT_FAILED' = 'PENDING') {
    const user = await prisma.user.create({ data: { username: `ttl-${randomUUID()}`, passwordHash: 'test-only' } });
    const ingredient = await prisma.ingredient.create({ data: { code: `TTL-${randomUUID()}`, name: 'TTL beans', unit: 'G', stockQuantity: 20 } });
    const product = await prisma.product.create({
      data: { sku: `TTL-${randomUUID()}`, name: 'TTL coffee', imageUrl: '/test.png', variants: { create: { size: 'M', price: 40000n, recipeItems: { create: { ingredientId: ingredient.id, quantity: 10 } } } } },
      include: { variants: true },
    });
    const coupon = await prisma.coupon.create({ data: {
      code: `TTL-${randomUUID()}`, discountType: 'FIXED_AMOUNT', discountValue: 1000n,
      startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000), usageLimit: 1, perUserLimit: 1,
    } });
    const expiresAt = new Date(Date.now() + 60000);
    const order = await prisma.$transaction(async tx => {
      const order = await tx.order.create({ data: {
        orderNumber: `TTL-${randomUUID().slice(0, 20)}`, userId: user.id, status,
        subtotal: 40000n, discountAmount: 1000n, total: 39000n, reservationExpiresAt: expiresAt,
      } });
      await inventory.reserve(tx, order.id, [{ productVariantId: product.variants[0].id, quantity: 1 }], expiresAt);
      await promotionsRepo.createRedemption({ couponId: coupon.id, userId: user.id, orderId: order.id, discountAmount: 1000n, expiresAt }, tx);
      return order;
    });
    const expire = async () => {
      const past = new Date(Date.now() - 1000);
      await prisma.order.update({ where: { id: order.id }, data: { reservationExpiresAt: past } });
      await prisma.inventoryReservation.updateMany({ where: { orderId: order.id }, data: { expiresAt: past } });
      await prisma.couponRedemption.updateMany({ where: { orderId: order.id }, data: { expiresAt: past } });
    };
    const state = async () => ({
      order: await prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      stock: await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } }),
      reservation: await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: order.id } }),
      coupon: await prisma.couponRedemption.findUniqueOrThrow({ where: { orderId: order.id } }),
      cancellations: await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: 'CANCELLED' } }),
    });
    const params = { orderId: order.id, userId: user.id, amount: 39000n, method: 'E_WALLET' as const, idempotencyKey: randomUUID() };
    return { order, user, coupon, expire, state, params };
  }

  it.each(['PENDING', 'PAYMENT_FAILED'] as const)('expires %s stock and coupon exactly once across workers', async status => {
    const f = await fixture(status);
    await f.expire();
    await Promise.all([job().handleExpiredOrders(), job().handleExpiredOrders()]);
    const first = await f.state();
    expect(first.order.status).toBe('CANCELLED');
    expect(first.reservation.status).toBe('EXPIRED');
    expect(first.coupon.status).toBe('EXPIRED');
    expect(first.coupon.releasedAt).not.toBeNull();
    expect(first.stock.stockQuantity).toBe(20);
    expect(first.stock.version).toBe(2);
    expect(first.cancellations).toBe(1);
    expect(await promotions.validateCoupon(f.coupon.code, 40000, f.user.id, new Date())).toMatchObject({ discountAmount: 1000 });
    await job().handleExpiredOrders();
    expect(await f.state()).toEqual(first);
  });

  it('rolls back order, inventory and history if coupon cleanup fails', async () => {
    const f = await fixture();
    await f.expire();
    const before = await f.state();
    vi.spyOn(promotions, 'releaseByOrderId').mockRejectedValueOnce(new Error('coupon write failed'));
    await job().handleExpiredOrders();
    expect(await f.state()).toEqual(before);
    await job().handleExpiredOrders();
    expect((await f.state()).order.status).toBe('CANCELLED');
  });

  for (const success of [true, false]) {
    it(`settles a gateway ${success ? 'success' : 'failure'} that finishes after TTL`, async () => {
      const f = await fixture();
      let finish!: (value: { success: boolean; gatewayTransactionId?: string; errorCode?: string }) => void;
      let entered!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const result = new Promise<{ success: boolean; gatewayTransactionId?: string; errorCode?: string }>(resolve => { finish = resolve; });
      const gateway = { charge: vi.fn(() => { entered(); return result; }) };
      const payments = new PaymentsService(new PaymentsRepository(prisma as never), orders, gateway as never, prisma as never);
      const pending = payments.processPayment(f.params);
      try {
        await started;
        // Another key cannot charge the same order while gateway I/O is running.
        await expect(payments.processPayment({ ...f.params, idempotencyKey: randomUUID() })).rejects.toMatchObject({ response: { code: 'PAYMENT_IN_PROGRESS' } });
        await f.expire();
        await job().handleExpiredOrders();
        const during = await f.state();
        expect(during.order.status).toBe('PENDING');
        expect(during.reservation.status).toBe('ACTIVE');
        expect(during.coupon.status).toBe('RESERVED');
        expect(during.stock.stockQuantity).toBe(10);
        expect(await promotionsRepo.countTotalRedemptions(f.coupon.id, new Date())).toBe(1);
        expect(await promotionsRepo.countRedemptions(f.coupon.id, f.user.id, new Date())).toBe(1);
      } finally {
        finish(success ? { success, gatewayTransactionId: 'GW-TTL' } : { success, errorCode: 'DECLINED' });
      }
      expect(await pending).toMatchObject({ success, status: success ? 'SUCCEEDED' : 'FAILED' });
      await job().handleExpiredOrders();
      const after = await f.state();
      expect(after.order.status).toBe(success ? 'PAID' : 'CANCELLED');
      expect(after.reservation.status).toBe(success ? 'CONSUMED' : 'EXPIRED');
      expect(after.coupon.status).toBe(success ? 'CONSUMED' : 'EXPIRED');
      expect(after.stock.stockQuantity).toBe(success ? 10 : 20);
      expect(await payments.processPayment(f.params)).toMatchObject({ success, isRetried: true });
      expect(gateway.charge).toHaveBeenCalledTimes(1);
    });
  }

  it('rejects an expired order before contacting the gateway', async () => {
    const f = await fixture('PAYMENT_FAILED');
    await f.expire();
    const gateway = { charge: vi.fn() };
    const payments = new PaymentsService(new PaymentsRepository(prisma as never), orders, gateway as never, prisma as never);
    await expect(payments.processPayment(f.params)).rejects.toMatchObject({ response: { code: 'ORDER_EXPIRED' } });
    await job().handleExpiredOrders();
    await expect(payments.processPayment(f.params)).rejects.toMatchObject({ response: { code: 'ORDER_INVALID_TRANSITION' } });
    expect(gateway.charge).not.toHaveBeenCalled();
    expect(await prisma.payment.count({ where: { orderId: f.order.id } })).toBe(0);
  });

  it('rejects coupon validation and locked quotation at its exact expiry', async () => {
    const f = await fixture();
    await expect(promotions.validateCoupon(f.coupon.code, 40000, f.user.id, f.coupon.endsAt)).rejects.toMatchObject({ status: 422 });
    await expect(prisma.$transaction(tx => promotions.quoteAndLock(tx, f.user.id, f.coupon.code, 40000n, f.coupon.endsAt))).rejects.toMatchObject({ status: 422 });
  });
});

import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PaymentMethod } from '../src/modules/payments/dto/create-payment.js';
import { PaymentStatus } from '../src/modules/payments/dto/payment-response.js';

const connectionString = process.env.SMOKE_DATABASE_URL;
if (!connectionString || !new URL(connectionString).pathname.slice(1).startsWith('brewlite_foundation_smoke')) {
  throw new Error('Integration tests require SMOKE_DATABASE_URL pointing to brewlite_foundation_smoke*');
}

describe('Foundation on migrated PostgreSQL', () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  let userId: string;
  let variantId: string;
  let orderId: string;
  const payment = () => ({
    orderId, idempotencyKey: randomUUID(), requestHash: 'a'.repeat(64),
    method: PaymentMethod.CARD, amount: 40000n,
  });

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({ data: { username: `smoke-${randomUUID()}`, passwordHash: 'test-hash' } });
    userId = user.id;
    const product = await prisma.product.create({ data: {
      sku: randomUUID(), name: 'Smoke product', imageUrl: '/smoke.png',
      variants: { create: { size: 'M', price: 40000n, stock: 2 } },
    }, include: { variants: true } });
    variantId = product.variants[0].id;
    const order = await prisma.order.create({ data: {
      orderNumber: `SMOKE-${randomUUID().slice(0, 20)}`, userId,
      subtotal: 40000n, total: 40000n, reservationExpiresAt: new Date(Date.now() + 900000),
      items: { create: { productVariantId: variantId, productNameSnapshot: product.name, variantNameSnapshot: 'M', unitPrice: 40000n, quantity: 1 } },
      statusHistories: { create: { toStatus: 'PENDING' } },
    } });
    orderId = order.id;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('supports only customer and barista accounts; the gateway is not an account role', async () => {
    const roles = await prisma.$queryRaw<Array<{ role: string }>>`
      SELECT e.enumlabel AS role FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'UserRole' ORDER BY e.enumsortorder
    `;
    expect(roles.map(row => row.role)).toEqual(['CUSTOMER', 'BARISTA']);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).role).toBe('CUSTOMER');
    const barista = await prisma.user.create({ data: {
      username: `barista-${randomUUID()}`, passwordHash: 'test-hash', role: 'BARISTA',
    } });
    expect(barista.role).toBe('BARISTA');
  });

  it('has all 14 domain tables and the default stock version', async () => {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    expect(tables.map(t => t.tablename).sort()).toEqual([
      'users', 'products', 'product_variants', 'toppings', 'product_toppings', 'orders',
      'order_items', 'order_item_toppings', 'payments', 'order_status_histories',
      'inventory_reservations', 'coupons', 'coupon_redemptions', 'loyalty_transactions',
    ].sort());
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).version).toBe(0);
  });

  it('rejects negative stock, invalid order totals and zero item quantities', async () => {
    await expect(prisma.productVariant.update({ where: { id: variantId }, data: { stock: -1 } })).rejects.toThrow();
    await expect(prisma.order.update({ where: { id: orderId }, data: { total: 1n } })).rejects.toThrow();
    await expect(prisma.orderItem.updateMany({ where: { orderId }, data: { quantity: 0 } })).rejects.toThrow();
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock).toBe(2);
  });

  it('rejects invalid coupon percentage and time window', async () => {
    const coupon = { code: randomUUID(), discountType: 'PERCENTAGE' as const, discountValue: 101n,
      startsAt: new Date('2026-10-01T00:00:00Z'), endsAt: new Date('2026-11-01T00:00:00Z') };
    await expect(prisma.coupon.create({ data: coupon })).rejects.toThrow();
    await expect(prisma.coupon.create({ data: { ...coupon, discountValue: 10n, endsAt: coupon.startsAt } })).rejects.toThrow();
  });

  it('allows failed attempts but only one successful payment and one idempotency key', async () => {
    await prisma.payment.create({ data: { ...payment(), status: PaymentStatus.FAILED } });
    const succeeded = await prisma.payment.create({ data: { ...payment(), status: PaymentStatus.SUCCEEDED } });
    expect({ method: succeeded.method, status: succeeded.status }).toEqual({ method: 'CARD', status: 'SUCCEEDED' });
    await expect(prisma.payment.create({ data: { ...payment(), status: PaymentStatus.SUCCEEDED } })).rejects.toThrow();
    await expect(prisma.payment.create({ data: { ...payment(), idempotencyKey: succeeded.idempotencyKey } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.payment.count({ where: { orderId, status: 'SUCCEEDED' } })).toBe(1);
  });

  it('allows only one EARN per order and preserves a reversal', async () => {
    await prisma.loyaltyTransaction.create({ data: { userId, orderId, type: 'EARN', points: 4, balanceAfter: 4, reason: 'smoke' } });
    await expect(prisma.loyaltyTransaction.create({ data: { userId, orderId, type: 'EARN', points: 4, balanceAfter: 8, reason: 'duplicate' } })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.loyaltyTransaction.create({ data: { userId, orderId, type: 'REVERSAL', points: -4, balanceAfter: 0, reason: 'smoke reversal' } });
    expect(await prisma.loyaltyTransaction.count({ where: { orderId } })).toBe(2);
  });

  it('enforces foreign keys and rolls back the whole transaction on a CHECK violation', async () => {
    await expect(prisma.inventoryReservation.create({ data: { orderId, productVariantId: randomUUID(), quantity: 1, expiresAt: new Date() } })).rejects.toMatchObject({ code: 'P2003' });
    const before = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    await expect(prisma.$transaction(async tx => {
      await tx.productVariant.update({ where: { id: variantId }, data: { stock: { decrement: 1 }, version: { increment: 1 } } });
      await tx.order.update({ where: { id: orderId }, data: { discountAmount: 50000n } });
    })).rejects.toThrow();
    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect({ stock: after.stock, version: after.version }).toEqual({ stock: before.stock, version: before.version });
  });
});

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const expectedDatabase = 'brewlite_foundation_smoke_trello_audit';
if (new URL(process.env.DATABASE_URL).pathname !== `/${expectedDatabase}`) {
  throw new Error('Only the isolated Trello audit database is permitted');
}
const { AppModule } = await import('../../apps/api/dist/app.module.js');
const { PrismaService } = await import('../../apps/api/dist/database/prisma.service.js');
const { MockGatewayService } = await import('../../apps/api/dist/modules/payments/services/mock-gateway.service.js');
const app = await NestFactory.create(AppModule, { logger: false });
app.setGlobalPrefix('api/v1');
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
await app.init();
const result = {};
try {
  const prisma = app.get(PrismaService);
  const gateway = app.get(MockGatewayService);
  const server = app.getHttpServer();
  const registration = await request(server).post('/api/v1/auth/register').send({
    username: `trello-audit-${randomUUID().slice(0, 8)}`, password: 'Audit-only-29Oct2026!',
  });
  if (registration.status !== 201) throw new Error(`Register failed: ${registration.status}`);
  const token = registration.body.data.accessToken;
  const userId = registration.body.data.user.id;
  const variant = await prisma.productVariant.findFirstOrThrow({
    where: { isActive: true, stock: { gte: 3 }, product: { isActive: true } },
  });
  const coupon = await prisma.coupon.create({ data: {
    code: `AUDIT-${randomUUID().slice(0, 8)}`, discountType: 'PERCENTAGE', discountValue: 10n,
    minOrderValue: 0n, usageLimit: 10, perUserLimit: 3,
    startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000),
  } });
  const order = async () => {
    const response = await request(server).post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productVariantId: variant.id, quantity: 1 }], couponCode: coupon.code });
    if (response.status !== 201) throw new Error(`Order failed: ${response.status} ${JSON.stringify(response.body)}`);
    return response.body.data;
  };
  const pay = (orderId, key) => request(server).post('/api/v1/payments')
    .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key)
    .send({ orderId, method: 'CARD' });
  const first = await order();
  gateway.charge = async () => ({ success: true, gatewayTransactionId: `AUDIT-${randomUUID()}` });
  const paid = await pay(first.id, randomUUID());
  const firstStored = await prisma.order.findUniqueOrThrow({ where: { id: first.id } });
  result.checkoutSuccess = {
    httpStatus: paid.status, response: paid.body,
    databaseOrderStatus: firstStored.status,
    checkoutFailureBranch: paid.body.data.paymentStatus !== 'SUCCEEDED' || paid.body.data.success === false,
    missingFieldsExpectedByFrontend: ['paymentStatus', 'orderId', 'failureCode'].filter(field => !(field in paid.body.data)),
  };
  const second = await order();
  gateway.charge = async () => ({ success: false, errorCode: 'INSUFFICIENT_FUNDS' });
  const failedKey = randomUUID();
  const failed = await pay(second.id, failedKey);
  gateway.charge = async () => ({ success: true, gatewayTransactionId: `AUDIT-${randomUUID()}` });
  const retry = await pay(second.id, randomUUID());
  const replay = await pay(second.id, failedKey);
  result.retry = {
    firstHttpStatus: failed.status, firstResponse: failed.body,
    newKeyHttpStatus: retry.status, newKeyResponse: retry.body,
    sameKeyHttpStatus: replay.status, sameKeyResponse: replay.body,
    databaseOrderStatus: (await prisma.order.findUniqueOrThrow({ where: { id: second.id } })).status,
    couponRedemptions: await prisma.couponRedemption.count({ where: { orderId: second.id } }),
  };
  const third = await order();
  const expiredAt = new Date(Date.now() - 60000);
  await prisma.order.update({ where: { id: third.id }, data: { reservationExpiresAt: expiredAt } });
  await prisma.inventoryReservation.updateMany({ where: { orderId: third.id }, data: { expiresAt: expiredAt } });
  await prisma.couponRedemption.updateMany({ where: { orderId: third.id }, data: { expiresAt: expiredAt } });
  const expired = await pay(third.id, randomUUID());
  result.expiredReservation = {
    httpStatus: expired.status, response: expired.body,
    databaseOrderStatus: (await prisma.order.findUniqueOrThrow({ where: { id: third.id } })).status,
    couponStates: (await prisma.couponRedemption.findMany({ where: { orderId: third.id }, select: { status: true } })).map(x => x.status),
  };
  result.loyaltyLedgerEntries = await prisma.loyaltyTransaction.count({ where: { userId } });
  writeFileSync(new URL('./payment-reproduction.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await app.close();
}

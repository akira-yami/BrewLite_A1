import { randomUUID } from 'node:crypto';
import { ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PromotionsService } from '../src/modules/promotions/services/promotions.service.js';
import { OrderExpiryJob } from '../src/modules/orders/services/order-expiry.job.js';

const connectionString = process.env.SMOKE_DATABASE_URL;
if (
  !connectionString ||
  !new URL(connectionString).pathname
    .slice(1)
    .startsWith('brewlite_foundation_smoke')
) {
  throw new Error(
    'Orders tests require a disposable brewlite_foundation_smoke* database',
  );
}

describe('Week 3 Orders: real HTTP and PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let otherUserId: string;
  let token: string;
  let otherToken: string;
  let baristaToken: string;
  const previousUrl = process.env.DATABASE_URL;
  const auth = (req: request.Test, bearer = token) =>
    req.set('Authorization', `Bearer ${bearer}`);
  // Cho phép chỉ định người dùng khi kiểm thử giới hạn coupon giữa nhiều khách hàng.
  const post = (items: unknown[], couponCode?: string, bearer = token) =>
    auth(request(app.getHttpServer()).post('/api/v1/orders'), bearer).send({
      items,
      ...(couponCode ? { couponCode } : {}),
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = connectionString;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const users = await Promise.all(
      (['CUSTOMER', 'CUSTOMER', 'BARISTA'] as const).map((role) =>
        prisma.user.create({
          data: {
            username: `orders-${randomUUID()}`,
            passwordHash: 'test-only',
            role,
          },
        }),
      ),
    );
    userId = users[0].id;
    otherUserId = users[1].id;
    [token, otherToken, baristaToken] = users.map((user) =>
      jwt.sign({ sub: user.id, role: user.role, username: user.username }),
    );
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  });

  async function product(stock = 20, price = 40000n) {
    const row = await prisma.product.create({
      data: {
        sku: randomUUID(),
        name: 'Original coffee',
        imageUrl: '/test.png',
        variants: { create: { size: 'M', stock, price } },
      },
      include: { variants: true },
    });
    return { productId: row.id, id: row.variants[0].id };
  }
  // Cho phép cấu hình riêng hai loại quota để test không vô tình phụ thuộc lẫn nhau.
  async function coupon(options: {
    usageLimit?: number | null;
    perUserLimit?: number;
  } = {}) {
    return prisma.coupon.create({
      data: {
        code: `TEST-${randomUUID()}`,
        discountType: 'FIXED_AMOUNT',
        discountValue: 5000n,
        startsAt: new Date(Date.now() - 60000),
        endsAt: new Date(Date.now() + 3600000),
        usageLimit: options.usageLimit === undefined ? 1 : options.usageLimit,
        perUserLimit: options.perUserLimit ?? 1,
      },
    });
  }

  it('merges normalized lines, preserves 0/null preferences, snapshots and ownership', async () => {
    const variant = await product();
    const item = {
      productVariantId: variant.id,
      quantity: 1,
      sugarLevel: 0,
      iceLevel: 25,
      note: '  Separate ice  ',
    };
    const response = await post([
      item,
      {
        ...item,
        productVariantId: variant.id.toUpperCase(),
        note: 'Separate ice',
      },
      { productVariantId: variant.id, quantity: 1 },
    ])
      .set('X-Request-Id', 'orders-integration')
      .expect(201);
    expect(response.headers['x-request-id']).toBe('orders-integration');
    expect(response.body.meta.requestId).toBe('orders-integration');
    const order = response.body.data;
    expect(order).toMatchObject({
      status: 'PENDING',
      subtotal: 120000,
      total: 120000,
    });
    expect(order.items).toHaveLength(2);
    expect(order.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quantity: 2,
          sugarLevel: 0,
          iceLevel: 25,
          note: 'Separate ice',
        }),
        expect.objectContaining({
          quantity: 1,
          sugarLevel: null,
          iceLevel: null,
          note: null,
        }),
      ]),
    );
    expect(
      await prisma.inventoryReservation.count({ where: { orderId: order.id } }),
    ).toBe(1);
    expect(
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      }),
    ).toMatchObject({ stock: 17, version: 1 });
    await prisma.product.update({
      where: { id: variant.productId },
      data: { name: 'Renamed coffee' },
    });
    const detail = await auth(
      request(app.getHttpServer()).get(`/api/v1/orders/${order.id}`),
    ).expect(200);
    expect(detail.body.data.items[0].productName).toBe('Original coffee');
    expect(detail.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sugarLevel: 0,
          iceLevel: 25,
          note: 'Separate ice',
        }),
      ]),
    );
    expect(detail.body.data.timeline[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'PENDING',
    });
    const denied = await auth(
      request(app.getHttpServer()).get(`/api/v1/orders/${order.id}`),
      otherToken,
    ).expect(404);
    expect(denied.body.error.code).toBe('ORDER_NOT_FOUND');
    expect(denied.headers['x-request-id']).toBe(denied.body.error.requestId);
    const history = await auth(
      request(app.getHttpServer()).get('/api/v1/orders/me'),
      otherToken,
    ).expect(200);
    expect(history.body.data).toEqual([]);
  });

  it('enforces HTTP authentication and role guards on every order route', async () => {
    for (const path of [
      '/api/v1/orders/me',
      `/api/v1/orders/${randomUUID()}`,
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
      await auth(request(app.getHttpServer()).get(path), baristaToken).expect(
        403,
      );
    }
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({ items: [] })
      .expect(401);
    await auth(
      request(app.getHttpServer()).post('/api/v1/orders'),
      baristaToken,
    )
      .send({ items: [] })
      .expect(403);
  });

  it('rejects invalid preferences, forged prices, duplicate normalized toppings and quantities above 20', async () => {
    const variant = await product(100);
    const item = { productVariantId: variant.id, quantity: 1 };
    const topping = randomUUID();
    for (const items of [
      [{ ...item, sugarLevel: 101 }],
      [{ ...item, iceLevel: -1 }],
      [{ ...item, sugarLevel: '50' }],
      [{ ...item, unitPrice: 1 }],
      [{ ...item, toppingIds: [topping, topping.toUpperCase()] }],
      [
        { ...item, quantity: 15 },
        { ...item, quantity: 6 },
      ],
    ]) {
      const result = await post(items).expect(400);
      expect(result.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      }),
    ).toMatchObject({ stock: 100, version: 0 });
  });

  it('rolls back all order rows, stock/version, reservation and coupon after a late failure', async () => {
    const variant = await product();
    const promotion = await coupon();
    const topping = await prisma.topping.create({
      data: { code: randomUUID(), name: 'Pearl', price: 5000n },
    });
    await prisma.productTopping.create({
      data: { productId: variant.productId, toppingId: topping.id },
    });
    const counts = async () =>
      Promise.all([
        prisma.order.count({ where: { userId } }),
        prisma.orderItem.count(),
        prisma.orderItemTopping.count(),
        prisma.inventoryReservation.count(),
        prisma.orderStatusHistory.count(),
      ]);
    const before = await counts();
    const promotions = app.get(PromotionsService);
    const reserve = promotions.reserve.bind(promotions);
    vi.spyOn(promotions, 'reserve').mockImplementationOnce(async (...args) => {
      await reserve(...args);
      throw new Error('Injected failure after actual coupon/stock writes');
    });
    await post(
      [{ productVariantId: variant.id, quantity: 2, toppingIds: [topping.id] }],
      promotion.code,
    ).expect(500);
    expect(await counts()).toEqual(before);
    expect(
      await prisma.couponRedemption.count({
        where: { couponId: promotion.id },
      }),
    ).toBe(0);
    expect(
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      }),
    ).toMatchObject({ stock: 20, version: 0 });
  });

  it('rejects unavailable catalog options and inactive principals before writes', async () => {
    const variant = await product();
    const item = { productVariantId: variant.id, quantity: 1 };
    const invalidTopping = await post([
      { ...item, toppingIds: [randomUUID()] },
    ]).expect(400);
    expect(invalidTopping.body.error.code).toBe('INVALID_OPTION');
    await prisma.product.update({
      where: { id: variant.productId },
      data: { isActive: false },
    });
    const inactiveProduct = await post([item]).expect(400);
    expect(inactiveProduct.body.error.code).toBe('INVALID_OPTION');
    await prisma.product.update({
      where: { id: variant.productId },
      data: { isActive: true },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
    try {
      const inactiveUser = await post([item]).expect(401);
      expect(inactiveUser.body.error.code).toBe('UNAUTHORIZED');
    } finally {
      await prisma.user.update({
        where: { id: userId },
        data: { isActive: true },
      });
    }
    expect(
      await prisma.orderItem.count({ where: { productVariantId: variant.id } }),
    ).toBe(0);
  });

  it('allows exactly one of two concurrent buyers to reserve the last drink', async () => {
    const variant = await product(1);
    const results = await Promise.all([
      post([{ productVariantId: variant.id, quantity: 1 }]),
      post([{ productVariantId: variant.id, quantity: 1 }]),
    ]);
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expect(
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      }),
    ).toMatchObject({ stock: 0, version: 1 });
    expect(
      await prisma.inventoryReservation.count({
        where: { productVariantId: variant.id },
      }),
    ).toBe(1);
    expect(
      results.find((result) => result.status === 409)?.body.error.code,
    ).toBe('OUT_OF_STOCK');
  });

  it('reserves a limited coupon once under concurrent requests', async () => {
    const a = await product();
    const b = await product();
    const promotion = await coupon();
    const results = await Promise.all([
      post([{ productVariantId: a.id, quantity: 1 }], promotion.code),
      post([{ productVariantId: b.id, quantity: 1 }], promotion.code),
    ]);
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([201, 422]);
    expect(
      results.find((result) => result.status === 201)?.body.data,
    ).toMatchObject({
      subtotal: 40000,
      discountAmount: 5000,
      total: 35000,
    });
    expect(
      await prisma.couponRedemption.count({
        where: { couponId: promotion.id },
      }),
    ).toBe(1);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: [a.id, b.id] } },
    });
    expect(variants.reduce((sum, row) => sum + row.stock, 0)).toBe(39);
  });

  it('enforces per-user coupon limit independently under concurrent orders', async () => {
    // Tắt quota toàn cục để chỉ perUserLimit có thể từ chối request thứ hai.
    const firstVariant = await product();
    const secondVariant = await product();
    const promotion = await coupon({ usageLimit: null, perUserLimit: 1 });

    const results = await Promise.all([
      post([{ productVariantId: firstVariant.id, quantity: 1 }], promotion.code),
      post([{ productVariantId: secondVariant.id, quantity: 1 }], promotion.code),
    ]);

    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([201, 422]);
    expect(
      results.find((result) => result.status === 422)?.body.error.code,
    ).toBe('COUPON_NOT_APPLICABLE');
    expect(
      await prisma.couponRedemption.count({
        where: { couponId: promotion.id, userId },
      }),
    ).toBe(1);
  });

  it('enforces global coupon usage limit independently across different users', async () => {
    // Cho phép mỗi user dùng nhiều lần để chỉ usageLimit toàn cục quyết định kết quả.
    const firstVariant = await product();
    const secondVariant = await product();
    const promotion = await coupon({ usageLimit: 1, perUserLimit: 2 });

    const results = await Promise.all([
      post([{ productVariantId: firstVariant.id, quantity: 1 }], promotion.code, token),
      post([{ productVariantId: secondVariant.id, quantity: 1 }], promotion.code, otherToken),
    ]);

    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([201, 422]);
    expect(
      results.find((result) => result.status === 422)?.body.error.code,
    ).toBe('COUPON_NOT_APPLICABLE');

    const redemptions = await prisma.couponRedemption.findMany({
      where: { couponId: promotion.id },
      select: { userId: true },
    });
    expect(redemptions).toHaveLength(1);
    expect([userId, otherUserId]).toContain(redemptions[0].userId);
  });

  it('uses server-priced subtotal when creating an order after a client-side coupon preview', async () => {
    const variant = await product(5, 40000n);
    const promotion = await prisma.coupon.create({
      data: {
        code: `PREVIEW-${randomUUID()}`,
        discountType: 'PERCENTAGE',
        discountValue: 50n,
        minOrderValue: 0n,
        startsAt: new Date(Date.now() - 60000),
        endsAt: new Date(Date.now() + 3600000),
        usageLimit: 1,
        perUserLimit: 1,
      },
    });

    // Preview là ước tính theo subtotal client gửi; không được dùng để chốt số tiền Order.
    const preview = await auth(
      request(app.getHttpServer()).post('/api/v1/coupons/validate'),
    )
      .send({ code: promotion.code, subtotal: 100000 })
      .expect(200);
    expect(preview.body.data.discountAmount).toBe(50000);

    // Khi tạo Order, server tự đọc giá variant (40.000 VND) và tính lại discount (20.000 VND).
    const orderResponse = await post(
      [{ productVariantId: variant.id, quantity: 1 }],
      promotion.code,
    ).expect(201);
    expect(orderResponse.body.data).toMatchObject({
      subtotal: 40000,
      discountAmount: 20000,
      total: 20000,
    });

    const redemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { orderId: orderResponse.body.data.id },
    });
    expect(redemption.discountAmount).toBe(20000n);
  });

  it('fails before committing money outside the JSON integer range', async () => {
    const variant = await product(20, BigInt(Number.MAX_SAFE_INTEGER));
    const result = await post([
      { productVariantId: variant.id, quantity: 2 },
    ]).expect(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(
      await prisma.orderItem.count({ where: { productVariantId: variant.id } }),
    ).toBe(0);
    expect(
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      }),
    ).toMatchObject({ stock: 20, version: 0 });
  });

  it('paginates equal timestamps and validates history queries without leaking other users', async () => {
    const variant = await product();
    const first = await post([
      { productVariantId: variant.id, quantity: 1 },
    ]).expect(201);
    const second = await post([
      { productVariantId: variant.id, quantity: 1 },
    ]).expect(201);
    const ids = [first.body.data.id, second.body.data.id].sort(
      (a: string, b: string) => b.localeCompare(a),
    );
    await prisma.order.updateMany({
      where: { id: { in: ids } },
      data: { createdAt: new Date('2030-01-01T00:00:00Z') },
    });
    const page1 = await auth(
      request(app.getHttpServer()).get(
        '/api/v1/orders/me?limit=1&status=PENDING',
      ),
    ).expect(200);
    expect(page1.body.data[0].id).toBe(ids[0]);
    expect(page1.body.meta.nextCursor).toBe(ids[0]);
    const page2 = await auth(
      request(app.getHttpServer()).get(
        `/api/v1/orders/me?limit=1&cursor=${ids[0]}`,
      ),
    ).expect(200);
    expect(page2.body.data[0].id).toBe(ids[1]);
    const other = await auth(
      request(app.getHttpServer()).get(`/api/v1/orders/me?cursor=${ids[0]}`),
      otherToken,
    ).expect(200);
    expect(other.body.data).toEqual([]);
    for (const query of [
      'limit=0',
      'limit=101',
      'cursor=invalid',
      'status=INVALID',
    ]) {
      await auth(
        request(app.getHttpServer()).get(`/api/v1/orders/me?${query}`),
      ).expect(400);
    }
  });
  it('Regression: Payment FAILED → retry success consumes coupon once; expired FAILED order releases coupon and stock safely', async () => {
    // Chỉ mock Gateway bên ngoài; Order, Payment, Coupon và Inventory vẫn chạy trên PostgreSQL thật.
    const { PaymentsService } = await import('../src/modules/payments/services/payments.service.js');
    const { MockGatewayService } = await import('../src/modules/payments/services/mock-gateway.service.js');

    const paymentsService = app.get(PaymentsService);
    const mockGateway = app.get(MockGatewayService);
    const expiryJob = app.get(OrderExpiryJob);
    const gatewayCharge = vi.spyOn(mockGateway, 'charge');

    const variant = await product();
    const promotion = await coupon();

    // KỊCH BẢN 1: Thanh toán thất bại phải giữ coupon và inventory để khách retry.
    const orderResponse = await post(
      [{ productVariantId: variant.id, quantity: 1 }],
      promotion.code,
    ).expect(201);
    const orderId = orderResponse.body.data.id;
    const totalAmount = BigInt(orderResponse.body.data.total);

    let redemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { orderId },
    });
    expect(redemption.status).toBe('RESERVED');

    gatewayCharge.mockResolvedValueOnce({
      success: false,
      errorCode: 'INSUFFICIENT_FUNDS',
    });
    const failedPaymentResult = await paymentsService.processPayment({
      idempotencyKey: `fail-key-${randomUUID()}`,
      orderId,
      userId,
      method: 'E_WALLET',
      amount: totalAmount,
    });
    expect(failedPaymentResult.success).toBe(false);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
      .toMatchObject({ status: 'PAYMENT_FAILED' });
    expect(await prisma.payment.findFirstOrThrow({ where: { orderId } }))
      .toMatchObject({ status: 'FAILED', failureCode: 'INSUFFICIENT_FUNDS' });
    redemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { orderId },
    });
    expect(redemption.status).toBe('RESERVED');
    expect(await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId } }))
      .toMatchObject({ status: 'ACTIVE' });

    // KỊCH BẢN 2: Retry bằng key mới thành công; chỉ quyết toán coupon và Loyalty một lần.
    const successKey = `success-key-${randomUUID()}`;
    gatewayCharge.mockResolvedValueOnce({
      success: true,
      gatewayTransactionId: `GW-RETRY-${randomUUID()}`,
    });
    const successResult = await paymentsService.processPayment({
      idempotencyKey: successKey,
      orderId,
      userId,
      method: 'E_WALLET',
      amount: totalAmount,
    });
    expect(successResult.success).toBe(true);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
      .toMatchObject({ status: 'PAID' });
    expect(await prisma.couponRedemption.findFirstOrThrow({ where: { orderId } }))
      .toMatchObject({ status: 'CONSUMED', consumedAt: expect.any(Date) });
    expect(await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId } }))
      .toMatchObject({ status: 'CONSUMED' });
    expect(await prisma.payment.count({ where: { orderId } })).toBe(2);
    expect(await prisma.loyaltyTransaction.count({
      where: { orderId, type: 'EARN' },
    })).toBe(1);

    // Replay cùng key phải trả kết quả cũ, không gọi Gateway và không consume coupon lần hai.
    const gatewayCallsAfterSuccess = gatewayCharge.mock.calls.length;
    const replayResult = await paymentsService.processPayment({
      idempotencyKey: successKey,
      orderId,
      userId,
      method: 'E_WALLET',
      amount: totalAmount,
    });
    expect(replayResult).toMatchObject({
      success: true,
      isRetried: true,
      status: 'SUCCEEDED',
    });
    expect(gatewayCharge).toHaveBeenCalledTimes(gatewayCallsAfterSuccess);
    expect(await prisma.couponRedemption.count({
      where: { orderId, status: 'CONSUMED' },
    })).toBe(1);
    expect(await prisma.loyaltyTransaction.count({
      where: { orderId, type: 'EARN' },
    })).toBe(1);

    // KỊCH BẢN 3: Payment FAILED rồi hết hạn; Cron thật phải hủy Order, release coupon và hoàn kho.
    const promotion2 = await coupon();
    const orderResponse2 = await post(
      [{ productVariantId: variant.id, quantity: 1 }],
      promotion2.code,
    ).expect(201);
    const expiredOrderId = orderResponse2.body.data.id;
    const expiredOrderAmount = BigInt(orderResponse2.body.data.total);
    const stockAfterReservation = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    });

    gatewayCharge.mockResolvedValueOnce({
      success: false,
      errorCode: 'INSUFFICIENT_FUNDS',
    });
    await paymentsService.processPayment({
      idempotencyKey: `expiry-fail-key-${randomUUID()}`,
      orderId: expiredOrderId,
      userId,
      method: 'E_WALLET',
      amount: expiredOrderAmount,
    });
    expect(await prisma.order.findUniqueOrThrow({
      where: { id: expiredOrderId },
    })).toMatchObject({ status: 'PAYMENT_FAILED' });
    const expiryRedemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { orderId: expiredOrderId },
    });
    const expiryReservation = await prisma.inventoryReservation.findFirstOrThrow({
      where: { orderId: expiredOrderId },
    });
    expect(expiryRedemption.status).toBe('RESERVED');
    expect(expiryReservation.status).toBe('ACTIVE');

    // Đẩy hạn giữ chỗ của Order, Coupon và Inventory về quá khứ để kiểm tra nhánh expiry.
    const expiredAt = new Date(Date.now() - 60_000);
    await prisma.order.update({
      where: { id: expiredOrderId },
      data: { reservationExpiresAt: expiredAt },
    });
    await prisma.couponRedemption.update({
      where: { id: expiryRedemption.id },
      data: { expiresAt: expiredAt },
    });
    await prisma.inventoryReservation.update({
      where: { id: expiryReservation.id },
      data: { expiresAt: expiredAt },
    });

    // Retry trước khi Cron chạy phải bị chặn ngay bởi deadline đã qua.
    const gatewayCallsBeforeExpiredRetry = gatewayCharge.mock.calls.length;
    const expiredRetryError = await paymentsService.processPayment({
      idempotencyKey: `expired-retry-key-${randomUUID()}`,
      orderId: expiredOrderId,
      userId,
      method: 'E_WALLET',
      amount: expiredOrderAmount,
    }).then(() => null, (error: unknown) => error);
    expect(expiredRetryError).toBeInstanceOf(ConflictException);
    expect((expiredRetryError as ConflictException).getResponse()).toMatchObject({
      code: 'ORDER_EXPIRED',
    });
    expect(gatewayCharge).toHaveBeenCalledTimes(gatewayCallsBeforeExpiredRetry);

    // Cron job thật phải kết thúc toàn bộ vòng đời trong cùng transaction.
    await expiryJob.handleExpiredOrders();
    expect(await prisma.order.findUniqueOrThrow({
      where: { id: expiredOrderId },
    })).toMatchObject({ status: 'CANCELLED' });
    expect(await prisma.couponRedemption.findUniqueOrThrow({
      where: { id: expiryRedemption.id },
    })).toMatchObject({ status: 'EXPIRED', releasedAt: expect.any(Date) });
    expect(await prisma.inventoryReservation.findUniqueOrThrow({
      where: { id: expiryReservation.id },
    })).toMatchObject({ status: 'EXPIRED' });
    const stockAfterExpiry = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    });
    expect(stockAfterExpiry).toMatchObject({
      stock: stockAfterReservation.stock,
      version: stockAfterReservation.version + 1,
    });

    // Chạy Cron lặp và retry sau khi đã CANCELLED đều không được tạo side effect lần hai.
    await expiryJob.handleExpiredOrders();
    expect(await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })).toMatchObject({
      stock: stockAfterReservation.stock,
      version: stockAfterReservation.version + 1,
    });
    expect(await prisma.couponRedemption.findUniqueOrThrow({
      where: { id: expiryRedemption.id },
    })).toMatchObject({ status: 'EXPIRED' });

    const cancelledRetryError = await paymentsService.processPayment({
      idempotencyKey: `cancelled-retry-key-${randomUUID()}`,
      orderId: expiredOrderId,
      userId,
      method: 'E_WALLET',
      amount: expiredOrderAmount,
    }).then(() => null, (error: unknown) => error);
    expect(cancelledRetryError).toBeInstanceOf(ConflictException);
    expect((cancelledRetryError as ConflictException).getResponse()).toMatchObject({
      code: 'ORDER_INVALID_TRANSITION',
    });
    expect(gatewayCharge).toHaveBeenCalledTimes(gatewayCallsBeforeExpiredRetry);
    expect(await prisma.payment.count({ where: { orderId: expiredOrderId } })).toBe(1);
    expect(await prisma.couponRedemption.count({
      where: { orderId: expiredOrderId, status: 'CONSUMED' },
    })).toBe(0);
  });

  it('customer cancellation atomically releases a RESERVED coupon and ACTIVE inventory', async () => {
    // Gọi service thật trên PostgreSQL vì hiện tại OrdersController chưa expose endpoint hủy đơn.
    const { OrdersService } = await import('../src/modules/orders/services/orders.service.js');
    const ordersService = app.get(OrdersService);
    const variant = await product();
    const promotion = await coupon();

    const orderResponse = await post(
      [{ productVariantId: variant.id, quantity: 1 }],
      promotion.code,
    ).expect(201);
    const orderId = orderResponse.body.data.id;
    const stockAfterReservation = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    });
    const redemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { orderId },
    });
    const reservation = await prisma.inventoryReservation.findFirstOrThrow({
      where: { orderId },
    });
    expect(redemption.status).toBe('RESERVED');
    expect(reservation.status).toBe('ACTIVE');

    await ordersService.cancelOrder(
      orderId,
      userId,
      'Khách hàng chủ động hủy đơn',
      false,
    );

    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
      .toMatchObject({ status: 'CANCELLED' });
    expect(await prisma.couponRedemption.findUniqueOrThrow({
      where: { id: redemption.id },
    })).toMatchObject({ status: 'RELEASED', releasedAt: expect.any(Date) });
    expect(await prisma.inventoryReservation.findUniqueOrThrow({
      where: { id: reservation.id },
    })).toMatchObject({ status: 'RELEASED' });
    expect(await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })).toMatchObject({
      stock: stockAfterReservation.stock + 1,
      version: stockAfterReservation.version + 1,
    });

    // Gọi hủy lặp không được release coupon hoặc hoàn kho lần thứ hai.
    const repeatError = await ordersService.cancelOrder(
      orderId,
      userId,
      'Hủy lặp',
      false,
    ).then(() => null, (error: unknown) => error);
    expect(repeatError).toBeInstanceOf(ConflictException);
    expect(await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })).toMatchObject({
      stock: stockAfterReservation.stock + 1,
      version: stockAfterReservation.version + 1,
    });
    expect(await prisma.couponRedemption.findUniqueOrThrow({
      where: { id: redemption.id },
    })).toMatchObject({ status: 'RELEASED' });
  });

  it('blocks a second PROCESSING payment for the same order even when its idempotency key differs', async () => {
    // Giữ Gateway của request đầu ở trạng thái chờ để request thứ hai va vào ràng buộc DB.
    const { PaymentsService } = await import('../src/modules/payments/services/payments.service.js');
    const { MockGatewayService } = await import('../src/modules/payments/services/mock-gateway.service.js');
    const paymentsService = app.get(PaymentsService);
    const mockGateway = app.get(MockGatewayService);

    const variant = await product();
    const orderResponse = await post([
      { productVariantId: variant.id, quantity: 1 },
    ]).expect(201);
    const orderId = orderResponse.body.data.id;
    const totalAmount = BigInt(orderResponse.body.data.total);

    let releaseGateway!: (result: {
      success: boolean;
      errorCode?: string;
      gatewayTransactionId?: string;
    }) => void;
    const blockedGatewayResponse = new Promise<{
      success: boolean;
      errorCode?: string;
      gatewayTransactionId?: string;
    }>((resolve) => {
      releaseGateway = resolve;
    });

    vi.spyOn(mockGateway, 'charge').mockReturnValueOnce(blockedGatewayResponse);

    const firstPayment = paymentsService.processPayment({
      idempotencyKey: `first-${randomUUID()}`,
      orderId,
      userId,
      method: 'E_WALLET',
      amount: totalAmount,
    });

    try {
      // Chờ đến khi request đầu đã ghi Payment PROCESSING vào PostgreSQL.
      let processingPaymentExists = false;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const payment = await prisma.payment.findFirst({
          where: { orderId, status: 'PROCESSING' },
        });
        if (payment) {
          processingPaymentExists = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(processingPaymentExists).toBe(true);

      // Request thứ hai dùng key khác nhưng phải bị DB bảo vệ trước khi gọi Gateway.
      await expect(
        paymentsService.processPayment({
          idempotencyKey: `second-${randomUUID()}`,
          orderId,
          userId,
          method: 'E_WALLET',
          amount: totalAmount,
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'PAYMENT_IN_PROGRESS',
        },
      });
    } finally {
      // Luôn giải phóng Gateway giả lập để không để request đầu bị treo khi test fail.
      releaseGateway({ success: false, errorCode: 'TEST_DECLINED' });
    }

    await firstPayment;
    expect(
      await prisma.payment.count({ where: { orderId } }),
    ).toBe(1);
    expect(
      await prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
    ).toMatchObject({ status: 'PAYMENT_FAILED' });
  });
});

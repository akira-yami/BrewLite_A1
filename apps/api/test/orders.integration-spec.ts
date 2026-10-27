import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PromotionsService } from '../src/modules/promotions/services/promotions.service.js';

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
  let token: string;
  let otherToken: string;
  let baristaToken: string;
  const previousUrl = process.env.DATABASE_URL;
  const auth = (req: request.Test, bearer = token) =>
    req.set('Authorization', `Bearer ${bearer}`);
  const post = (items: unknown[], couponCode?: string) =>
    auth(request(app.getHttpServer()).post('/api/v1/orders')).send({
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
  async function coupon() {
    return prisma.coupon.create({
      data: {
        code: `TEST-${randomUUID()}`,
        discountType: 'FIXED_AMOUNT',
        discountValue: 5000n,
        startsAt: new Date(Date.now() - 60000),
        endsAt: new Date(Date.now() + 3600000),
        usageLimit: 1,
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
});

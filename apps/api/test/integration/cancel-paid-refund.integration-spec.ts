/**
 * Integration tests: Hủy đơn PAID → Hoàn tiền thành Store Credit (điểm tích lũy)
 *
 * Kiểm tra nghiệp vụ cancelPaidOrder() trên PostgreSQL thật.
 * Yêu cầu SMOKE_DATABASE_URL trỏ đến brewlite_foundation_smoke* database.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { OrderStatus } from '../../src/generated/prisma/client.js';
import { OrdersService } from '../../src/modules/orders/services/orders.service.js';

const connectionString = process.env.SMOKE_DATABASE_URL;
if (
  !connectionString ||
  !new URL(connectionString).pathname
    .slice(1)
    .startsWith('brewlite_foundation_smoke')
) {
  throw new Error(
    'cancel-paid-refund integration tests require a disposable brewlite_foundation_smoke* database',
  );
}

describe('cancelPaidOrder: hủy PAID → hoàn tiền Store Credit (PostgreSQL thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  let customerId: string;
  let baristaId: string;
  let customerToken: string;
  let baristaToken: string;
  let variantId: string;
  const previousUrl = process.env.DATABASE_URL;

  const bearer = (token: string) => `Bearer ${token}`;

  /** Tạo đơn PENDING qua API và trả về order info */
  async function newOrder() {
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', bearer(customerToken))
      .send({ items: [{ productVariantId: variantId, quantity: 1 }] })
      .expect(201);
    return {
      id: response.body.data.id as string,
      total: BigInt(response.body.data.total),
    };
  }

  /** Đưa đơn sang PAID bằng đúng đường chạy thanh toán */
  async function newPaidOrder() {
    const order = await newOrder();
    await prisma.$transaction((tx) =>
      orders.markOrderPaid(order.id, customerId, order.total, tx),
    );
    return order;
  }

  const orderPath = (id: string) => `/api/v1/orders/${id}`;
  const staffPath = (id: string) => `/api/v1/staff/orders/${id}`;

  function requestRefund(id: string) {
    return request(app.getHttpServer())
      .post(`${orderPath(id)}/refund-request`)
      .set('Authorization', bearer(customerToken));
  }

  function reviewRefund(id: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
    return request(app.getHttpServer())
      .patch(`${staffPath(id)}/refund-request`)
      .set('Authorization', bearer(baristaToken))
      .send({ decision, reason });
  }

  function startPreparing(id: string) {
    return request(app.getHttpServer())
      .patch(`${staffPath(id)}/status`)
      .set('Authorization', bearer(baristaToken))
      .send({ status: 'PREPARING' });
  }

  async function approveRefund(id: string) {
    await requestRefund(id).expect(200);
    return reviewRefund(id, 'APPROVED').expect(200);
  }

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
    orders = app.get(OrdersService, { strict: false });
    const jwt = app.get(JwtService);

    // Tạo Customer và Barista cho bộ test này
    const [customer, barista] = await Promise.all(
      (['CUSTOMER', 'BARISTA'] as const).map((role) =>
        prisma.user.create({
          data: {
            username: `cancel-paid-${randomUUID()}`,
            passwordHash: 'test-only',
            role,
          },
        }),
      ),
    );
    customerId = customer.id;
    baristaId = barista.id;

    customerToken = jwt.sign({
      sub: customer.id,
      role: customer.role,
      username: customer.username,
    });
    baristaToken = jwt.sign({
      sub: barista.id,
      role: barista.role,
      username: barista.username,
    });

    // Tạo ingredient + topping + variant để tạo đơn được
    const ingredient = await prisma.ingredient.create({
      data: {
        code: `CP-BEAN-${randomUUID()}`,
        name: 'Cancel Paid Test Beans',
        unit: 'G',
        stockQuantity: 10000,
      },
    });

    const product = await prisma.product.create({
      data: {
        sku: `CP-PROD-${randomUUID()}`,
        name: 'Cancel Paid Test Product',
        imageUrl: 'https://example.com/img.png',
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        size: 'M',
        price: 55000n,
      },
    });
    variantId = variant.id;

    // Thêm công thức cho variant (BOM)
    await prisma.recipeItem.create({
      data: {
        productVariantId: variant.id,
        ingredientId: ingredient.id,
        quantity: 10,
      },
    });
  });

  afterAll(async () => {
    process.env.DATABASE_URL = previousUrl;
    await app.close();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Customer hủy đơn PAID thành công → nhận Store Credit
  // ─────────────────────────────────────────────────────────────────────────────
  it('chỉ hoàn Store Credit sau khi barista duyệt yêu cầu của khách', async () => {
    const earlier = await newPaidOrder();
    const order = await newPaidOrder();

    // Lấy balance trước khi hủy (đã được cộng EARN khi PAID)
    const userBefore = await prisma.user.findUniqueOrThrow({
      where: { id: customerId },
      select: { loyaltyBalance: true },
    });

    // Gọi API hủy đơn PAID
    const pending = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/cancel-paid`)
      .set('Authorization', bearer(customerToken))
      .expect(200);
    expect(pending.body.data).toMatchObject({ status: 'PENDING', points: Number(order.total) });
    expect((await requestRefund(order.id).expect(200)).body.data).toEqual(pending.body.data);
    expect(await prisma.loyaltyTransaction.count({ where: { orderId: order.id, type: 'REFUND_CREDIT' } })).toBe(0);
    const pendingDetail = await request(app.getHttpServer()).get(orderPath(order.id))
      .set('Authorization', bearer(customerToken)).expect(200);
    expect(pendingDetail.body.data).toMatchObject({ status: 'PAID', refundRequest: { status: 'PENDING' } });

    const staffQueue = await request(app.getHttpServer()).get('/api/v1/staff/orders?status=PAID&limit=1')
      .set('Authorization', bearer(baristaToken)).expect(200);
    expect(staffQueue.body.data[0]).toMatchObject({ id: order.id, refundRequest: { status: 'PENDING' } });
    const fullQueue = await request(app.getHttpServer()).get('/api/v1/staff/orders?status=PAID&limit=2')
      .set('Authorization', bearer(baristaToken)).expect(200);
    expect(fullQueue.body.data.map(({ id }: { id: string }) => id)).toEqual([order.id, earlier.id]);
    const response = await reviewRefund(order.id, 'APPROVED').expect(200);

    // Kiểm tra response structure
    expect(response.body.data).toMatchObject({ status: 'APPROVED', points: Number(order.total) });
    const approvedDetail = await request(app.getHttpServer()).get(orderPath(order.id))
      .set('Authorization', bearer(customerToken)).expect(200);
    expect(approvedDetail.body.data).toMatchObject({ status: 'CANCELLED', refundRequest: { status: 'APPROVED' } });

    // Kiểm tra trạng thái đơn hàng
    const cancelledOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(cancelledOrder.status).toBe(OrderStatus.CANCELLED);

    // Kiểm tra OrderStatusHistory ghi lại chuyển tiếp PAID → CANCELLED
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });
    const lastHistory = history[history.length - 1];
    expect(lastHistory.fromStatus).toBe(OrderStatus.PAID);
    expect(lastHistory.toStatus).toBe(OrderStatus.CANCELLED);

    // Kiểm tra REVERSAL transaction (thu hồi EARN cũ)
    const reversalTx = await prisma.loyaltyTransaction.findFirst({
      where: { orderId: order.id, type: 'REVERSAL' },
    });
    expect(reversalTx).not.toBeNull();
    expect(reversalTx!.points).toBeLessThan(0); // REVERSAL phải âm

    // Kiểm tra REFUND_CREDIT transaction (hoàn tiền dưới dạng điểm)
    const refundTx = await prisma.loyaltyTransaction.findFirst({
      where: { orderId: order.id, type: 'REFUND_CREDIT' },
    });
    expect(refundTx).not.toBeNull();
    expect(refundTx!.points).toBe(Number(order.total)); // 1 VND = 1 điểm
    // Thứ tự nghiệp vụ: REFUND_CREDIT được ghi trước, sau đó mới REVERSAL.
    expect(refundTx!.balanceAfter).toBe(
      userBefore.loyaltyBalance + Number(order.total),
    );
    expect(reversalTx!.balanceAfter).toBe(
      refundTx!.balanceAfter + reversalTx!.points,
    );

    // Kiểm tra loyaltyBalance cuối cùng
    // = balance_trước - EARN + (-EARN_âm) + REFUND = balance_trước - EARN + EARN + order.total = balance_trước + order.total
    // (REVERSAL thu hồi EARN, REFUND_CREDIT cộng order.total)
    const earnTx = await prisma.loyaltyTransaction.findFirst({
      where: { orderId: order.id, type: 'EARN' },
    });
    const userAfter = await prisma.user.findUniqueOrThrow({
      where: { id: customerId },
      select: { loyaltyBalance: true },
    });
    const expectedBalance =
      userBefore.loyaltyBalance -
      (earnTx?.points ?? 0) + // trừ EARN đã cộng lúc PAID
      Number(order.total);     // cộng REFUND_CREDIT (1 VND = 1 điểm)
    expect(userAfter.loyaltyBalance).toBe(expectedBalance);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Inventory được hoàn lại từ snapshot CONSUMED
  // ─────────────────────────────────────────────────────────────────────────────
  it('inventory: nguyên liệu được cộng lại đúng bằng snapshot đã giữ khi tạo đơn', async () => {
    const order = await newPaidOrder();

    // Lấy snapshot nguyên liệu và tồn kho trước khi hủy
    const reservation = await prisma.inventoryReservation.findFirstOrThrow({
      where: { orderId: order.id },
      include: { items: true },
    });
    expect(reservation.status).toBe('CONSUMED'); // PAID → CONSUMED

    const item = reservation.items[0];
    const ingredientBefore = await prisma.ingredient.findUniqueOrThrow({
      where: { id: item.ingredientId },
    });

    // Hủy đơn
    await approveRefund(order.id);

    // Reservation phải chuyển CONSUMED → RELEASED
    const reservationAfter = await prisma.inventoryReservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(reservationAfter.status).toBe('RELEASED');

    // Tồn kho phải tăng đúng bằng snapshot
    const ingredientAfter = await prisma.ingredient.findUniqueOrThrow({
      where: { id: item.ingredientId },
    });
    expect(ingredientAfter.stockQuantity).toBe(
      ingredientBefore.stockQuantity + item.quantity,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Payment SUCCEEDED → REFUNDED
  // ─────────────────────────────────────────────────────────────────────────────
  it('payment: trạng thái SUCCEEDED được đổi thành REFUNDED sau khi hủy', async () => {
    const order = await newPaidOrder();

    // Thêm payment SUCCEEDED để test
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        amount: order.total,
        method: 'E_WALLET',
        status: 'SUCCEEDED',
        processedAt: new Date(),
      },
    });

    await approveRefund(order.id);

    const paymentAfter = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(paymentAfter.status).toBe('REFUNDED');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: Duyệt lại trả cùng kết quả, kho không bị hoàn 2 lần
  // ─────────────────────────────────────────────────────────────────────────────
  it('duyệt lại cùng yêu cầu giữ nguyên kết quả và tồn kho', async () => {
    const order = await newPaidOrder();

    const reservation = await prisma.inventoryReservation.findFirstOrThrow({
      where: { orderId: order.id },
      include: { items: true },
    });
    const item = reservation.items[0];

    // Lần hủy đầu tiên — phải thành công
    const first = await approveRefund(order.id);

    const stockAfterFirst = (await prisma.ingredient.findUniqueOrThrow({
      where: { id: item.ingredientId },
    })).stockQuantity;

    const response = await reviewRefund(order.id, 'APPROVED').expect(200);
    expect(response.body.data).toEqual(first.body.data);
    await reviewRefund(order.id, 'REJECTED', 'Từ chối sau duyệt').expect(409);

    // Tồn kho không thay đổi sau lần hủy thứ 2
    const stockAfterSecond = (await prisma.ingredient.findUniqueOrThrow({
      where: { id: item.ingredientId },
    })).stockQuantity;
    expect(stockAfterSecond).toBe(stockAfterFirst);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Không thể hủy đơn không phải PAID (PENDING, PREPARING, COMPLETED…)
  // ─────────────────────────────────────────────────────────────────────────────
  it('từ chối hủy đơn không ở trạng thái PAID (PENDING → 409)', async () => {
    const order = await newOrder(); // Chỉ tạo đơn, chưa thanh toán → PENDING

    const response = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/cancel-paid`)
      .set('Authorization', bearer(customerToken))
      .expect(409);

    expect(response.body.error?.code).toBe('ORDER_INVALID_TRANSITION');
  });

  it('hoàn Store Credit đúng một lần khi hai thao tác duyệt chạy đồng thời', async () => {
    const order = await newPaidOrder();
    await requestRefund(order.id).expect(200);

    const responses = await Promise.all([
      reviewRefund(order.id, 'APPROVED').expect(200),
      reviewRefund(order.id, 'APPROVED').expect(200),
    ]);

    expect(responses[0].body.data).toEqual(responses[1].body.data);
    expect(await prisma.loyaltyTransaction.findMany({
      where: { orderId: order.id, type: 'REFUND_CREDIT' },
      select: { userId: true, points: true },
    })).toEqual([{ userId: customerId, points: Number(order.total) }]);
  });

  it('từ chối có lý do, giữ nguyên điểm và mở lại nút nhận pha chế', async () => {
    const order = await newPaidOrder();
    await requestRefund(order.id).expect(200);
    const blocked = await startPreparing(order.id).expect(409);
    expect(blocked.body.error.code).toBe('REFUND_REQUEST_PENDING');
    await reviewRefund(order.id, 'REJECTED', '  ').expect(400);
    const reason = 'Quầy đã xác nhận giữ đơn với khách';
    await reviewRefund(order.id, 'REJECTED', reason).expect(200);
    const detail = await request(app.getHttpServer()).get(orderPath(order.id))
      .set('Authorization', bearer(customerToken)).expect(200);
    expect(detail.body.data).toMatchObject({ status: 'PAID', refundRequest: { status: 'REJECTED', rejectionReason: reason } });
    expect(await prisma.loyaltyTransaction.count({ where: { orderId: order.id, type: 'REFUND_CREDIT' } })).toBe(0);
    await startPreparing(order.id).expect(200);
  });

  it('khóa thứ tự giữa gửi yêu cầu và nhận pha chế', async () => {
    const order = await newPaidOrder();
    const [requested, accepted] = await Promise.all([requestRefund(order.id), startPreparing(order.id)]);
    expect([requested.status, accepted.status].sort()).toEqual([200, 409]);

    const started = await newPaidOrder();
    await startPreparing(started.id).expect(200);
    const rejected = await requestRefund(started.id).expect(409);
    expect(rejected.body.error.code).toBe('ORDER_INVALID_TRANSITION');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Customer không thể hủy đơn của người khác (404 để tránh dò quét)
  // ─────────────────────────────────────────────────────────────────────────────
  it('customer không thể hủy đơn của người khác → 404', async () => {
    const order = await newPaidOrder();

    // Tạo customer khác
    const stranger = await prisma.user.create({
      data: {
        username: `stranger-${randomUUID()}`,
        passwordHash: 'test-only',
        role: 'CUSTOMER',
      },
    });
    const jwt = app.get(JwtService);
    const strangerToken = jwt.sign({
      sub: stranger.id,
      role: stranger.role,
      username: stranger.username,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/cancel-paid`)
      .set('Authorization', bearer(strangerToken))
      .expect(404);

    // Đơn vẫn còn PAID
    const stillPaid = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(stillPaid.status).toBe(OrderStatus.PAID);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: Barista hủy đơn PAID (kèm reason) thành công
  // ─────────────────────────────────────────────────────────────────────────────
  it('barista hủy đơn PAID với lý do → thành công và hoàn điểm cho khách', async () => {
    const order = await newPaidOrder();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/staff/orders/${order.id}/cancel-paid`)
      .set('Authorization', bearer(baristaToken))
      .send({ reason: 'Hết nguyên liệu đột xuất' })
      .expect(200);

    expect(response.body.data.status).toBe('CANCELLED');
    expect(response.body.data.refund.refundPoints).toBe(Number(order.total));

    const cancelledOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(cancelledOrder.status).toBe(OrderStatus.CANCELLED);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 8: Barista hủy phải có reason (body validation)
  // ─────────────────────────────────────────────────────────────────────────────
  it('barista hủy không có reason → 400 validation error', async () => {
    const order = await newPaidOrder();

    // Gửi không có body reason
    await request(app.getHttpServer())
      .post(`/api/v1/staff/orders/${order.id}/cancel-paid`)
      .set('Authorization', bearer(baristaToken))
      .send({ reason: '' })
      .expect(400);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 9: Chặn hủy đơn khi payment đang MANUAL_REVIEW
  // ─────────────────────────────────────────────────────────────────────────────
  it('từ chối hủy khi payment đang MANUAL_REVIEW → 409 PAYMENT_IN_PROGRESS', async () => {
    const order = await newPaidOrder();

    // Tạo payment MANUAL_REVIEW
    await prisma.payment.create({
      data: {
        orderId: order.id,
        idempotencyKey: randomUUID(),
        requestHash: 'b'.repeat(64),
        amount: order.total,
        method: 'E_WALLET',
        status: 'MANUAL_REVIEW',
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/cancel-paid`)
      .set('Authorization', bearer(customerToken))
      .expect(409);

    expect(response.body.error?.code ?? response.body.code).toBe('PAYMENT_IN_PROGRESS');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 10: Customer không thể dùng endpoint barista và ngược lại
  // ─────────────────────────────────────────────────────────────────────────────
  it('customer không được dùng endpoint staff → 403; barista không được dùng endpoint customer → 403', async () => {
    const order = await newPaidOrder();

    // Barista gọi vào endpoint customer
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/cancel-paid`)
      .set('Authorization', bearer(baristaToken))
      .expect(403);

    // Customer gọi vào endpoint staff
    await request(app.getHttpServer())
      .post(`/api/v1/staff/orders/${order.id}/cancel-paid`)
      .set('Authorization', bearer(customerToken))
      .expect(403);

    await request(app.getHttpServer()).patch(`${staffPath(order.id)}/refund-request`)
      .set('Authorization', bearer(customerToken)).send({ decision: 'APPROVED' }).expect(403);
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

const url = process.env.SMOKE_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.slice(1).startsWith('brewlite_foundation_smoke')
)
  throw new Error('Use an isolated smoke database');

describe('Staff inventory: HTTP, PostgreSQL and concurrent stock', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staff: string;
  let customer: string;
  let staffId: string;
  const previous = process.env.DATABASE_URL;
  const prefix = `INV-${randomUUID().slice(0, 8)}`;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const create = (stockQuantity = 1000) =>
    prisma.ingredient.create({
      data: {
        code: `${prefix}-${randomUUID()}`,
        name: 'Audit coffee beans',
        unit: 'G',
        stockQuantity,
      },
    });
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
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
    for (const role of ['BARISTA', 'CUSTOMER'] as const) {
      const user = await prisma.user.create({
        data: { username: randomUUID(), passwordHash: 'test-only', role },
      });
      const token = jwt.sign({ sub: user.id, role, username: user.username });
      if (role === 'BARISTA') {
        staff = token;
        staffId = user.id;
      } else customer = token;
    }
  });
  afterAll(async () => {
    await app?.close();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });

  it('requires JWT and blocks CUSTOMER on list, detail and stock writes', async () => {
    const item = await create();
    for (const path of ['/staff/inventory', `/staff/inventory/${item.id}`]) {
      await request(app.getHttpServer()).get(`/api/v1${path}`).expect(401);
      await request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .set(bearer(customer))
        .expect(403);
    }
    await request(app.getHttpServer())
      .patch(`/api/v1/staff/inventory/${item.id}/stock`)
      .send({ stockQuantity: 0, version: 0 })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/staff/inventory/${item.id}/stock`)
      .set(bearer(customer))
      .send({ stockQuantity: 0, version: 0 })
      .expect(403);
    expect(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: item.id } }))
        .stockQuantity,
    ).toBe(1000);
  });

  it('searches, filters stock levels and pages without duplicate rows', async () => {
    const items = await Promise.all([create(0), create(100), create(1000)]);
    const first = await request(app.getHttpServer())
      .get(`/api/v1/staff/inventory?q=${prefix}&limit=2`)
      .set(bearer(staff))
      .expect(200);
    expect(first.body.data).toHaveLength(2);
    const second = await request(app.getHttpServer())
      .get(
        `/api/v1/staff/inventory?q=${prefix}&limit=2&cursor=${first.body.meta.nextCursor}`,
      )
      .set(bearer(staff))
      .expect(200);
    const ids = [...first.body.data, ...second.body.data].map(
      (i: { id: string }) => i.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const [index, status] of [
      'OUT_OF_STOCK',
      'LOW_STOCK',
      'IN_STOCK',
    ].entries()) {
      const result = await request(app.getHttpServer())
        .get(`/api/v1/staff/inventory?q=${prefix}&status=${status}`)
        .set(bearer(staff))
        .expect(200);
      expect(
        result.body.data.every((i: { status: string }) => i.status === status),
      ).toBe(true);
      expect(
        result.body.data.some((i: { id: string }) => i.id === items[index].id),
      ).toBe(true);
    }
  });

  it('detail exposes units/version and validates identifiers', async () => {
    const item = await create();
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/staff/inventory/${item.id}`)
      .set(bearer(staff))
      .expect(200);
    expect(detail.body.data).toMatchObject({
      unit: 'G',
      version: 0,
      stockQuantity: 1000,
    });
    await request(app.getHttpServer())
      .get('/api/v1/staff/inventory/not-a-uuid')
      .set(bearer(staff))
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/staff/inventory/${randomUUID()}`)
      .set(bearer(staff))
      .expect(404);
  });

  it('BARISTA can read stock but cannot change quantity even using the API directly', async () => {
    const item = await create();
    for (const data of [
      { stockQuantity: 0, version: 0 },
      { stockQuantity: 250, version: 0 },
      { stockQuantity: -1 },
      { role: 'MANAGER', stockQuantity: 0 },
    ]) {
      const result = await request(app.getHttpServer())
        .patch(`/api/v1/staff/inventory/${item.id}/stock`)
        .set(bearer(staff))
        .send(data)
        .expect(403);
      expect(result.body.error.code).toBe('FORBIDDEN_RESOURCE');
    }
    const row = await prisma.ingredient.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(row.stockQuantity).toBe(1000);
    expect(row.version).toBe(0);
  });

  it('revoked barista cannot read the queue or inventory with an unexpired JWT', async () => {
    await prisma.user.update({
      where: { id: staffId },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get('/api/v1/staff/inventory')
      .set(bearer(staff))
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/staff/orders')
      .set(bearer(staff))
      .expect(401);
    await prisma.user.update({
      where: { id: staffId },
      data: { isActive: true },
    });
  });
});

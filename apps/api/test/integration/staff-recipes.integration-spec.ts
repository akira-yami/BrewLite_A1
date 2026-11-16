import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';

const connectionString = process.env.SMOKE_DATABASE_URL;
if (!connectionString || !new URL(connectionString).pathname.startsWith('/brewlite_foundation_smoke')) {
  throw new Error('Staff recipes integration tests require a disposable smoke database');
}

describe('Staff recipes: HTTP and PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previousUrl = process.env.DATABASE_URL;
  const path = '/api/v1/staff/recipes';

  beforeAll(async () => {
    process.env.DATABASE_URL = connectionString;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  });

  async function signIn(role: 'CUSTOMER' | 'BARISTA', isActive = true) {
    const user = await prisma.user.create({
      data: { username: randomUUID(), passwordHash: 'test-only', role, isActive },
    });
    return app.get(JwtService).sign({ sub: user.id, role, username: user.username });
  }

  it('rejects anonymous customers and tokens from deactivated baristas', async () => {
    const customer = await signIn('CUSTOMER');
    const inactiveStaff = await signIn('BARISTA', false);

    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer()).get(path).auth(customer, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get(path).auth(inactiveStaff, { type: 'bearer' }).expect(401);
  });

  it('returns quantities by active drink size and topping for baristas', async () => {
    const staff = await signIn('BARISTA');
    const ingredient = await prisma.ingredient.create({
      data: { code: randomUUID(), name: 'Sữa kiểm thử', unit: 'ML', stockQuantity: 500 },
    });
    const product = await prisma.product.create({
      data: {
        sku: randomUUID(),
        name: 'Cà phê kiểm thử',
        imageUrl: '/recipe-test.png',
        variants: { create: [
          { size: 'L', price: 45000n, recipeItems: { create: { ingredientId: ingredient.id, quantity: 120 } } },
          { size: 'S', price: 50000n, recipeItems: { create: { ingredientId: ingredient.id, quantity: 80 } } },
          { size: 'M', price: 40000n, isActive: false },
        ] },
        productToppings: { create: [
          { topping: { create: {
            code: randomUUID(), name: 'Kem sữa', price: 5000n,
            recipeItems: { create: { ingredientId: ingredient.id, quantity: 15 } },
          } } },
          { topping: { create: { code: randomUUID(), name: 'Topping ngừng bán', price: 5000n, isActive: false } } },
        ] },
      },
    });
    const ingredientView = {
      id: ingredient.id, name: ingredient.name, unit: 'ML', isActive: true,
    };

    const response = await request(app.getHttpServer())
      .get(path)
      .auth(staff, { type: 'bearer' })
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(response.body.data).toContainEqual({
      id: product.id,
      sku: product.sku,
      name: product.name,
      variants: [
        { id: expect.any(String), size: 'S', ingredients: [{ ...ingredientView, quantity: 80 }] },
        { id: expect.any(String), size: 'L', ingredients: [{ ...ingredientView, quantity: 120 }] },
      ],
      toppings: [
        { id: expect.any(String), name: 'Kem sữa', ingredients: [{ ...ingredientView, quantity: 15 }] },
      ],
    });
  });
});

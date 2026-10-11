import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedCatalog } from '../prisma/seed-catalog.js';

const connectionString = process.env.SMOKE_DATABASE_URL;
if (
  !connectionString ||
  !new URL(connectionString).pathname
    .slice(1)
    .startsWith('brewlite_foundation_smoke')
) {
  throw new Error(
    'Seed tests require a disposable brewlite_foundation_smoke* database',
  );
}

describe('Non-destructive catalog seed', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  let productId: string;
  let variantId: string;
  let toppingId: string;
  let orderId: string;

  beforeAll(async () => {
    const product = await prisma.product.create({
      data: {
        sku: 'COFFEE-CAU-DAT-01',
        name: 'Tên riêng',
        description: 'Mô tả riêng',
        imageUrl: '/custom.png',
        isActive: false,
        variants: {
          create: {
            size: 'M',
            price: 99000n,
            stock: 3,
            version: 7,
            isActive: false,
          },
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0].id;
    const topping = await prisma.topping.create({
      data: {
        code: 'TOP_PEARL',
        name: 'Topping riêng',
        price: 9000n,
        isActive: false,
      },
    });
    toppingId = topping.id;
    await prisma.productTopping.create({ data: { productId, toppingId } });
    const user = await prisma.user.create({
      data: {
        username: `seed-${randomUUID()}`,
        passwordHash: 'test-only-hash',
      },
    });
    const expiresAt = new Date(Date.now() + 900000);
    const order = await prisma.order.create({
      data: {
        orderNumber: `SEED-${randomUUID().slice(0, 20)}`,
        userId: user.id,
        subtotal: 108000n,
        total: 108000n,
        reservationExpiresAt: expiresAt,
        items: {
          create: {
            productVariantId: variantId,
            productNameSnapshot: product.name,
            variantNameSnapshot: 'M',
            unitPrice: 99000n,
            quantity: 1,
            sugarLevel: 0,
            iceLevel: 25,
            note: 'Ghi chú cần giữ',
            orderItemToppings: {
              create: {
                toppingId,
                toppingNameSnapshot: topping.name,
                unitPrice: 9000n,
                quantity: 1,
              },
            },
          },
        },
        inventoryReservations: {
          create: { productVariantId: variantId, quantity: 1, expiresAt },
        },
      },
    });
    orderId = order.id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const existing = async () => ({
    product: await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    }),
    variant: await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    }),
    topping: await prisma.topping.findUniqueOrThrow({
      where: { id: toppingId },
    }),
    order: await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: { include: { orderItemToppings: true } },
        inventoryReservations: true,
      },
    }),
  });
  const catalog = async () => ({
    products: await prisma.product.findMany({
      where: {
        sku: {
          in: [
            'COFFEE-CAU-DAT-01',
            'COLD-BREW-ICE-02',
            'CAPPUCCINO-HEARTH-03',
            'TEA-PEACH-ORANGE-04',
            'TEA-OOLONG-EGG-05',
            'COFFEE-AMERICANO-06',
          ],
        },
      },
      orderBy: { sku: 'asc' },
      include: {
        variants: { orderBy: { size: 'asc' } },
        productToppings: { orderBy: { toppingId: 'asc' } },
      },
    }),
    toppings: await prisma.topping.findMany({
      where: {
        code: { in: ['TOP_PEARL', 'TOP_CHEESE', 'TOP_ESPRESSO'] },
      },
      orderBy: { code: 'asc' },
    }),
  });

  it('reports errors and rolls back partial catalog additions', async () => {
    const before = await catalog();
    const failing = prisma.$extends({
      query: {
        productVariant: {
          upsert() {
            throw new Error('Injected seed failure');
          },
        },
      },
    });
    await expect(
      seedCatalog(failing as unknown as PrismaClient),
    ).rejects.toThrow('Injected seed failure');
    expect(await catalog()).toEqual(before);
  });

  it('adds missing samples while preserving existing orders, reservations and catalog edits', async () => {
    const before = await existing();
    await seedCatalog(prisma);
    expect(await existing()).toEqual(before);
    const result = await catalog();
    expect(result.products).toHaveLength(6);
    expect(result.toppings).toHaveLength(3);
    expect(result.products.flatMap((product) => product.variants)).toHaveLength(
      17,
    );
    expect(
      result.products.flatMap((product) => product.productToppings),
    ).toHaveLength(18);
  });

  it('repeated runs preserve IDs, timestamps and stock without creating duplicates', async () => {
    const beforeCatalog = await catalog();
    const beforeExisting = await existing();
    await seedCatalog(prisma);
    expect(await catalog()).toEqual(beforeCatalog);
    expect(await existing()).toEqual(beforeExisting);
  });
});

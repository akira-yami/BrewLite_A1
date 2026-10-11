import {
  ProductSize,
  type PrismaClient,
} from '../src/generated/prisma/client.js';

// Add missing sample catalog entries; never overwrite existing business data.
export async function seedCatalog(prisma: PrismaClient) {
  const toppingsData = [
    {
      code: 'TOP_PEARL',
      name: 'Trân châu trắng tuyết hoa',
      price: BigInt(8000),
      isActive: true,
    },
    {
      code: 'TOP_CHEESE',
      name: 'Kem cheese mật ong béo ngậy',
      price: BigInt(10000),
      isActive: true,
    },
    {
      code: 'TOP_ESPRESSO',
      name: 'Extra Shot Espresso Cầu Đất',
      price: BigInt(12000),
      isActive: true,
    },
  ];

  const productsData = [
    {
      sku: 'COFFEE-CAU-DAT-01',
      name: 'Cà phê sữa Cầu Đất',
      description: 'Rang mộc · Đậm vị, thơm lâu',
      imageUrl:
        'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=800&q=80',
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(30000), stock: 100 },
        { size: ProductSize.M, price: BigInt(35000), stock: 100 },
        { size: ProductSize.L, price: BigInt(40000), stock: 100 },
      ],
    },
    {
      sku: 'COLD-BREW-ICE-02',
      name: 'Cold Brew Tuyết Trắng',
      description: 'Êm dịu · Hương cacao và cam',
      imageUrl:
        'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=800&auto=format&fit=crop&q=85',
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(38000), stock: 50 },
        { size: ProductSize.M, price: BigInt(42000), stock: 50 },
        { size: ProductSize.L, price: BigInt(48000), stock: 50 },
      ],
    },
    {
      sku: 'CAPPUCCINO-HEARTH-03',
      name: 'Cappuccino Hoa Quế',
      description: 'Bọt sữa mịn · Hương quế ấm',
      imageUrl:
        'https://images.unsplash.com/photo-1534778101976-62847782c213?w=800&auto=format&fit=crop&q=85',
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(40000), stock: 50 },
        { size: ProductSize.M, price: BigInt(45000), stock: 50 },
        { size: ProductSize.L, price: BigInt(50000), stock: 50 },
      ],
    },
    {
      sku: 'TEA-PEACH-ORANGE-04',
      name: 'Trà đào cam sả',
      description: 'Thanh mát · Cam vàng, sả thơm',
      imageUrl:
        'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&auto=format&fit=crop&q=85',
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(35000), stock: 80 },
        { size: ProductSize.M, price: BigInt(39000), stock: 80 },
        { size: ProductSize.L, price: BigInt(44000), stock: 80 },
      ],
    },
    {
      sku: 'TEA-OOLONG-EGG-05',
      name: 'Oolong kem trứng khò',
      description: 'Trà rang thơm · Kem trứng béo',
      imageUrl:
        'https://images.unsplash.com/photo-1558857563-b371033873b8?auto=format&fit=crop&w=800&q=80',
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(40000), stock: 80 },
        { size: ProductSize.M, price: BigInt(45000), stock: 80 },
        { size: ProductSize.L, price: BigInt(50000), stock: 80 },
      ],
    },
    {
      sku: 'COFFEE-AMERICANO-06',
      name: 'Americano',
      description: 'Espresso nguyên chất · Đậm hương',
      imageUrl:
        'https://images.unsplash.com/photo-1509785307050-d4066910ec1e?w=800&auto=format&fit=crop&q=85',
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(35000), stock: 60 },
        { size: ProductSize.M, price: BigInt(40000), stock: 60 },
      ],
    },
  ];

  await prisma.$transaction(async (tx) => {
    const toppings = await Promise.all(
      toppingsData.map((topping) =>
        tx.topping.upsert({
          where: { code: topping.code },
          update: {},
          create: topping,
        }),
      ),
    );

    for (const { variants, ...productData } of productsData) {
      const product = await tx.product.upsert({
        where: { sku: productData.sku },
        update: {},
        create: productData,
      });

      for (const variant of variants) {
        await tx.productVariant.upsert({
          where: {
            productId_size: { productId: product.id, size: variant.size },
          },
          update: {},
          create: { ...variant, productId: product.id },
        });
      }

      if (!productData.sku.startsWith('PASTRY')) {
        await tx.productTopping.createMany({
          data: toppings.map((topping) => ({
            productId: product.id,
            toppingId: topping.id,
          })),
          skipDuplicates: true,
        });
      }
    }
  });
}

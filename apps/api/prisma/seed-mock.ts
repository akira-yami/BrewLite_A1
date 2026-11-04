import type { PrismaClient } from '../src/generated/prisma/client.js';

type Size = 'S' | 'M' | 'L';
type RecipeLine = [string, number]; // [mã nguyên liệu, lượng theo đơn vị cơ sở]
type FamilyKey = 'coffee' | 'cappuccino' | 'tea_peach' | 'tea_honey' | 'tea_oolong' | 'cold';
type Family = { prices: number[]; recipe: Record<Size, RecipeLine[]> };

const SIZES: Size[] = ['S', 'M', 'L'];
const cup = (size: Size): RecipeLine => [`CUP_${size}`, 1];

// Giá và công thức theo nhóm đồ uống. Mã nguyên liệu phải khớp seed-catalog.ts.
const FAMILIES: Record<FamilyKey, Family> = {
  coffee: {
    prices: [30000, 35000, 40000],
    recipe: {
      S: [['COFFEE_BEAN_CAU_DAT', 15], ['CONDENSED_MILK', 25], cup('S')],
      M: [['COFFEE_BEAN_CAU_DAT', 20], ['CONDENSED_MILK', 35], cup('M')],
      L: [['COFFEE_BEAN_CAU_DAT', 25], ['CONDENSED_MILK', 45], cup('L')],
    },
  },
  cappuccino: {
    prices: [40000, 45000, 50000],
    recipe: {
      S: [['COFFEE_BEAN_CAU_DAT', 18], ['FRESH_MILK', 120], cup('S')],
      M: [['COFFEE_BEAN_CAU_DAT', 22], ['FRESH_MILK', 160], cup('M')],
      L: [['COFFEE_BEAN_CAU_DAT', 26], ['FRESH_MILK', 200], cup('L')],
    },
  },
  tea_peach: {
    prices: [35000, 39000, 44000],
    recipe: {
      S: [['BLACK_TEA', 6], ['PEACH_SYRUP', 30], cup('S')],
      M: [['BLACK_TEA', 8], ['PEACH_SYRUP', 40], cup('M')],
      L: [['BLACK_TEA', 10], ['PEACH_SYRUP', 50], cup('L')],
    },
  },
  tea_honey: {
    prices: [33000, 37000, 42000],
    recipe: {
      S: [['BLACK_TEA', 6], ['HONEY', 15], cup('S')],
      M: [['BLACK_TEA', 8], ['HONEY', 20], cup('M')],
      L: [['BLACK_TEA', 10], ['HONEY', 25], cup('L')],
    },
  },
  tea_oolong: {
    prices: [40000, 45000, 50000],
    recipe: {
      S: [['OOLONG_TEA', 6], ['FRESH_MILK', 40], cup('S')],
      M: [['OOLONG_TEA', 8], ['FRESH_MILK', 50], cup('M')],
      L: [['OOLONG_TEA', 10], ['FRESH_MILK', 60], cup('L')],
    },
  },
  cold: {
    prices: [38000, 42000, 48000],
    recipe: {
      S: [['COLD_BREW_CONCENTRATE', 120], ['FRESH_MILK', 30], cup('S')],
      M: [['COLD_BREW_CONCENTRATE', 160], ['FRESH_MILK', 40], cup('M')],
      L: [['COLD_BREW_CONCENTRATE', 200], ['FRESH_MILK', 50], cup('L')],
    },
  },
};

type MockProduct = { sku: string; name: string; description: string; family: FamilyKey };

// 24 món, SKU đánh số tiếp từ 07 để không trùng 6 món thật.
const MOCK_PRODUCTS: MockProduct[] = [
  { sku: 'COFFEE-BAC-XIU-07', name: 'Bạc xỉu Sài Gòn', description: 'Sữa đặc béo ngậy · Cà phê nhẹ nhàng', family: 'coffee' },
  { sku: 'COFFEE-DEN-DA-08', name: 'Cà phê đen đá', description: 'Rang mộc · Đắng đậm, tỉnh táo', family: 'coffee' },
  { sku: 'COFFEE-ESPRESSO-09', name: 'Espresso đôi', description: 'Hai shot nguyên chất · Hậu vị caramel', family: 'coffee' },
  { sku: 'COFFEE-MOCHA-10', name: 'Mocha cacao đậm', description: 'Cacao đen · Sữa tươi · Kem mỏng', family: 'coffee' },
  { sku: 'COFFEE-DUA-11', name: 'Cà phê dừa', description: 'Dừa tươi · Mát lạnh dễ uống', family: 'coffee' },
  { sku: 'COFFEE-MUOI-12', name: 'Cà phê muối', description: 'Kem muối béo mặn · Đậm đà', family: 'coffee' },
  { sku: 'COFFEE-SAIGON-13', name: 'Cà phê phin Sài Gòn', description: 'Phin truyền thống · Đậm hương Việt', family: 'coffee' },
  { sku: 'CAPPUCCINO-VANI-14', name: 'Cappuccino vani', description: 'Bọt sữa dày · Vani ngọt dịu', family: 'cappuccino' },
  { sku: 'CAPPUCCINO-CACAO-15', name: 'Cappuccino cacao', description: 'Phủ bột cacao · Bọt mịn thơm lừng', family: 'cappuccino' },
  { sku: 'CAPPUCCINO-CARAMEL-16', name: 'Caramel cappuccino', description: 'Sốt caramel tự làm · Ngọt vừa phải', family: 'cappuccino' },
  { sku: 'TEA-DAO-HONG-17', name: 'Trà đào hồng', description: 'Đào ngâm mộc · Trà đen thanh mát', family: 'tea_peach' },
  { sku: 'TEA-VAI-18', name: 'Trà vải hoa hồng', description: 'Vải tươi · Hoa hồng khô dịu nhẹ', family: 'tea_peach' },
  { sku: 'TEA-DAO-SEN-19', name: 'Trà đào sen', description: 'Sen ướp trà · Đào giòn ngọt', family: 'tea_peach' },
  { sku: 'TEA-DAO-XA-20', name: 'Trà đào sả', description: 'Đào ngâm cùng sả thơm nhẹ', family: 'tea_peach' },
  { sku: 'TEA-CHANH-SA-21', name: 'Trà chanh sả mật ong', description: 'Chanh tươi · Sả thơm · Giải nhiệt', family: 'tea_honey' },
  { sku: 'TEA-LAI-22', name: 'Trà lài mật ong', description: 'Hương lài thơm nhẹ · Mật ong nguyên chất', family: 'tea_honey' },
  { sku: 'TEA-GUNG-23', name: 'Trà gừng mật ong', description: 'Gừng ấm · Mật ong · Dễ chịu buổi tối', family: 'tea_honey' },
  { sku: 'TEA-OOLONG-KEM-24', name: 'Oolong kem sữa', description: 'Trà ô long rang · Kem sữa béo ngậy', family: 'tea_oolong' },
  { sku: 'TEA-OOLONG-SUA-25', name: 'Oolong sữa tươi', description: 'Ủ nhẹ · Sữa tươi thanh ngọt', family: 'tea_oolong' },
  { sku: 'COLD-BREW-SUA-26', name: 'Cold Brew sữa tươi', description: 'Ủ lạnh 18 giờ · Vị êm, ngọt tự nhiên', family: 'cold' },
  { sku: 'COLD-BREW-CAM-27', name: 'Cold Brew cam vàng', description: 'Cà phê ủ lạnh · Cam vàng tươi', family: 'cold' },
  { sku: 'COLD-BREW-CACAO-28', name: 'Cold Brew cacao muối', description: 'Cacao đen · Muối biển nhẹ', family: 'cold' },
  { sku: 'COLD-BREW-DUA-29', name: 'Cold Brew dừa', description: 'Nước dừa tươi · Mát lạnh sảng khoái', family: 'cold' },
  { sku: 'COLD-BREW-VANI-30', name: 'Cold Brew vani', description: 'Vani Madagascar · Ngọt thanh', family: 'cold' },
];

// Ảnh mock dùng cùng quy tắc với dữ liệu thật: /products/<SKU>.webp
const productImage = (sku: string) => `/products/${sku}.webp`;

export async function seedMock(prisma: PrismaClient) {
  console.log(`Bắt đầu tạo ${MOCK_PRODUCTS.length} sản phẩm mock...`);

  // seed-catalog.ts phải chạy trước để đã có nguyên liệu và topping.
  const ingredientIds = new Map<string, string>(
    (await prisma.ingredient.findMany({ select: { id: true, code: true } })).map(
      (i): [string, string] => [i.code, i.id],
    ),
  );
  const toppings = await prisma.topping.findMany({ select: { id: true } });

  for (const item of MOCK_PRODUCTS) {
    const family = FAMILIES[item.family];

    const product = await prisma.product.upsert({
      where: { sku: item.sku },
      update: {},
      create: {
        sku: item.sku,
        name: item.name,
        description: item.description,
        imageUrl: productImage(item.sku),
        isActive: true,
      },
    });

    for (const [index, size] of SIZES.entries()) {
      const variant = await prisma.productVariant.upsert({
        where: { productId_size: { productId: product.id, size } },
        update: {},
        create: { productId: product.id, size, price: BigInt(family.prices[index]) },
      });

      const lines = family.recipe[size].map(([code, quantity]) => {
        const ingredientId = ingredientIds.get(code);
        if (!ingredientId) throw new Error(`Thiếu nguyên liệu ${code}: hãy chạy seed-catalog trước`);
        return { productVariantId: variant.id, ingredientId, quantity };
      });
      await prisma.recipeItem.createMany({ data: lines, skipDuplicates: true });
    }

    await prisma.productTopping.createMany({
      data: toppings.map((t) => ({ productId: product.id, toppingId: t.id })),
      skipDuplicates: true,
    });
  }

  await retireLegacyMockProducts(prisma);
  console.log('Đã tạo xong sản phẩm mock!');
}
// Retire only the 30 exact SKUs generated by the old demo seed. Keep rows,
// recipes and foreign keys so historical orders/reservations remain valid.
export async function retireLegacyMockProducts(prisma: PrismaClient) {
  const skus = Array.from({ length: 30 }, (_, i) => `MOCK-PROD-${String(i + 1).padStart(3, '0')}`);
  return prisma.$transaction(async tx => {
    await tx.productVariant.updateMany({
      where: { isActive: true, product: { sku: { in: skus } } },
      data: { isActive: false },
    });
    return tx.product.updateMany({
      where: { isActive: true, sku: { in: skus } },
      data: { isActive: false },
    });
  });
}

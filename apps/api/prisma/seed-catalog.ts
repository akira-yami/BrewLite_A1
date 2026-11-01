import {
    IngredientUnit,
    ProductSize,
    ToppingType,
    type PrismaClient,
} from '../src/generated/prisma/client.js';
const productImage = (sku: string) => `/products/${sku}.webp`;

// Add missing sample catalog entries; never overwrite existing business data.
export async function seedCatalog(prisma: PrismaClient) {
  const toppingsData = [
    // Topping nhập sẵn: 1 phần = 1 định lượng nguyên liệu thô.
    {
      code: 'TOP_PEARL',
      name: 'Trân châu trắng tuyết hoa',
      type: ToppingType.PREPACKAGED,
      price: BigInt(8000),
      isActive: true,
    },
    {
      code: 'TOP_JELLY',
      name: 'Thạch hộp trái cây',
      type: ToppingType.PREPACKAGED,
      price: BigInt(7000),
      isActive: true,
    },
    {
      code: 'TOP_FLAN',
      name: 'Bánh flan đóng hộp',
      type: ToppingType.PREPACKAGED,
      price: BigInt(10000),
      isActive: true,
    },
    // Topping chế biến: bán thành phẩm làm từ nhiều nguyên liệu thô.
    {
      code: 'TOP_BLACK_PEARL',
      name: 'Trân châu đen đường đen',
      type: ToppingType.PREPARED,
      price: BigInt(9000),
      isActive: true,
    },
    {
      code: 'TOP_CHEESE',
      name: 'Kem cheese mật ong béo ngậy',
      type: ToppingType.PREPARED,
      price: BigInt(10000),
      isActive: true,
    },
    {
      code: 'TOP_ESPRESSO',
      name: 'Extra Shot Espresso Cầu Đất',
      type: ToppingType.PREPARED,
      price: BigInt(12000),
      isActive: true,
    },
  ];

  // Công thức của 1 phần topping: [mã nguyên liệu, lượng theo đơn vị cơ sở].
  const toppingRecipes: Record<string, Array<[string, number]>> = {
    // Nhập sẵn: đúng 1 dòng.
    TOP_PEARL: [['PEARL_3Q', 30]], // 1 phần = 30g trân châu 3Q đóng gói
    TOP_JELLY: [['JELLY_BOX', 25]],
    TOP_FLAN: [['FLAN_CUP', 1]],
    // Chế biến: nhiều nguyên liệu.
    TOP_BLACK_PEARL: [['TAPIOCA_STARCH', 20], ['BROWN_SUGAR', 15], ['FRESH_MILK', 10]],
    TOP_CHEESE: [['CREAM_CHEESE', 30], ['WHIPPING_CREAM', 40], ['HONEY', 8], ['FRESH_MILK', 15]],
    TOP_ESPRESSO: [['COFFEE_BEAN_CAU_DAT', 9]],
  };

  // Topping nhập sẵn bắt buộc có đúng 1 dòng công thức; topping chế biến cần ít nhất 1 dòng.
  for (const topping of toppingsData) {
    const lines = toppingRecipes[topping.code]?.length ?? 0;
    if (topping.type === ToppingType.PREPACKAGED ? lines !== 1 : lines < 1) {
      throw new Error(`Invalid recipe for topping ${topping.code}`);
    }
  }

  // Nguyên liệu thô. Tồn kho tính theo đơn vị cơ sở (g, ml, cái).
  // Thành phẩm (ly) không có tồn kho: số ly tối đa được tính từ công thức.
  const ingredientsData = [
    { code: 'COFFEE_BEAN_CAU_DAT', name: 'Cà phê rang xay Cầu Đất', unit: IngredientUnit.G, stockQuantity: 5000 },
    { code: 'COLD_BREW_CONCENTRATE', name: 'Cold brew đậm đặc', unit: IngredientUnit.ML, stockQuantity: 20000 },
    { code: 'CONDENSED_MILK', name: 'Sữa đặc', unit: IngredientUnit.ML, stockQuantity: 10000 },
    { code: 'FRESH_MILK', name: 'Sữa tươi', unit: IngredientUnit.ML, stockQuantity: 30000 },
    { code: 'BLACK_TEA', name: 'Trà đen', unit: IngredientUnit.G, stockQuantity: 2000 },
    { code: 'OOLONG_TEA', name: 'Trà oolong rang', unit: IngredientUnit.G, stockQuantity: 2000 },
    { code: 'PEACH_SYRUP', name: 'Siro đào', unit: IngredientUnit.ML, stockQuantity: 8000 },
    { code: 'ORANGE', name: 'Cam vàng', unit: IngredientUnit.PCS, stockQuantity: 200 },
    { code: 'LEMONGRASS', name: 'Sả', unit: IngredientUnit.G, stockQuantity: 1500 },
    { code: 'EGG_CREAM', name: 'Kem trứng', unit: IngredientUnit.ML, stockQuantity: 5000 },
    { code: 'CUP_S', name: 'Ly size S', unit: IngredientUnit.PCS, stockQuantity: 500 },
    { code: 'CUP_M', name: 'Ly size M', unit: IngredientUnit.PCS, stockQuantity: 500 },
    { code: 'CUP_L', name: 'Ly size L', unit: IngredientUnit.PCS, stockQuantity: 500 },
    { code: 'PEARL_3Q', name: 'Trân châu trắng 3Q đóng gói', unit: IngredientUnit.G, stockQuantity: 5000 },
    { code: 'JELLY_BOX', name: 'Thạch hộp trái cây', unit: IngredientUnit.G, stockQuantity: 3000 },
    { code: 'FLAN_CUP', name: 'Bánh flan đóng hộp', unit: IngredientUnit.PCS, stockQuantity: 200 },
    { code: 'TAPIOCA_STARCH', name: 'Bột năng', unit: IngredientUnit.G, stockQuantity: 5000 },
    { code: 'BROWN_SUGAR', name: 'Đường đen', unit: IngredientUnit.G, stockQuantity: 4000 },
    { code: 'CREAM_CHEESE', name: 'Phô mai kem', unit: IngredientUnit.G, stockQuantity: 3000 },
    { code: 'WHIPPING_CREAM', name: 'Kem tươi', unit: IngredientUnit.ML, stockQuantity: 5000 },
    { code: 'HONEY', name: 'Mật ong', unit: IngredientUnit.ML, stockQuantity: 2000 },
  ];

  // Công thức (BOM) cho 1 ly: [mã nguyên liệu, lượng theo đơn vị cơ sở].
  const cup = (size: ProductSize): [string, number] => [`CUP_${size}`, 1];
  const recipes: Record<string, Partial<Record<ProductSize, Array<[string, number]>>>> = {
    'COFFEE-CAU-DAT-01': {
      S: [['COFFEE_BEAN_CAU_DAT', 15], ['CONDENSED_MILK', 25], cup('S')],
      M: [['COFFEE_BEAN_CAU_DAT', 20], ['CONDENSED_MILK', 35], cup('M')],
      L: [['COFFEE_BEAN_CAU_DAT', 25], ['CONDENSED_MILK', 45], cup('L')],
    },
    'COLD-BREW-ICE-02': {
      S: [['COLD_BREW_CONCENTRATE', 120], ['FRESH_MILK', 30], cup('S')],
      M: [['COLD_BREW_CONCENTRATE', 160], ['FRESH_MILK', 40], cup('M')],
      L: [['COLD_BREW_CONCENTRATE', 200], ['FRESH_MILK', 50], cup('L')],
    },
    'CAPPUCCINO-HEARTH-03': {
      S: [['COFFEE_BEAN_CAU_DAT', 18], ['FRESH_MILK', 120], cup('S')],
      M: [['COFFEE_BEAN_CAU_DAT', 22], ['FRESH_MILK', 160], cup('M')],
      L: [['COFFEE_BEAN_CAU_DAT', 26], ['FRESH_MILK', 200], cup('L')],
    },
    'TEA-PEACH-ORANGE-04': {
      S: [['BLACK_TEA', 6], ['PEACH_SYRUP', 30], ['ORANGE', 1], ['LEMONGRASS', 5], cup('S')],
      M: [['BLACK_TEA', 8], ['PEACH_SYRUP', 40], ['ORANGE', 1], ['LEMONGRASS', 6], cup('M')],
      L: [['BLACK_TEA', 10], ['PEACH_SYRUP', 50], ['ORANGE', 2], ['LEMONGRASS', 8], cup('L')],
    },
    'TEA-OOLONG-EGG-05': {
      S: [['OOLONG_TEA', 6], ['EGG_CREAM', 40], cup('S')],
      M: [['OOLONG_TEA', 8], ['EGG_CREAM', 50], cup('M')],
      L: [['OOLONG_TEA', 10], ['EGG_CREAM', 60], cup('L')],
    },
    'COFFEE-AMERICANO-06': {
      S: [['COFFEE_BEAN_CAU_DAT', 18], cup('S')],
      M: [['COFFEE_BEAN_CAU_DAT', 22], cup('M')],
    },
  };

  const productsData = [
    {
      sku: 'COFFEE-CAU-DAT-01',
      name: 'Cà phê sữa Cầu Đất',
      description: 'Rang mộc · Đậm vị, thơm lâu',
      imageUrl: productImage('COFFEE-CAU-DAT-01'),
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(30000) },
        { size: ProductSize.M, price: BigInt(35000) },
        { size: ProductSize.L, price: BigInt(40000) },
      ],
    },
    {
      sku: 'COLD-BREW-ICE-02',
      name: 'Cold Brew Tuyết Trắng',
      description: 'Êm dịu · Hương cacao và cam',
      imageUrl: productImage('COLD-BREW-ICE-02'),
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(38000) },
        { size: ProductSize.M, price: BigInt(42000) },
        { size: ProductSize.L, price: BigInt(48000) },
      ],
    },
    {
      sku: 'CAPPUCCINO-HEARTH-03',
      name: 'Cappuccino Hoa Quế',
      description: 'Bọt sữa mịn · Hương quế ấm',
      imageUrl: productImage('CAPPUCCINO-HEARTH-03'),
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(40000) },
        { size: ProductSize.M, price: BigInt(45000) },
        { size: ProductSize.L, price: BigInt(50000) },
      ],
    },
    {
      sku: 'TEA-PEACH-ORANGE-04',
      name: 'Trà đào cam sả',
      description: 'Thanh mát · Cam vàng, sả thơm',
      imageUrl: productImage('TEA-PEACH-ORANGE-04'),
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(35000) },
        { size: ProductSize.M, price: BigInt(39000) },
        { size: ProductSize.L, price: BigInt(44000) },
      ],
    },
    {
      sku: 'TEA-OOLONG-EGG-05',
      name: 'Oolong kem trứng khò',
      description: 'Trà rang thơm · Kem trứng béo',
     imageUrl: productImage('TEA-OOLONG-EGG-05'),
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(40000) },
        { size: ProductSize.M, price: BigInt(45000) },
        { size: ProductSize.L, price: BigInt(50000) },
      ],
    },
    {
      sku: 'COFFEE-AMERICANO-06',
      name: 'Americano',
      description: 'Espresso nguyên chất · Đậm hương',
      imageUrl: productImage('COFFEE-AMERICANO-06'),
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(35000) },
        { size: ProductSize.M, price: BigInt(40000) },
      ],
    },
  ];

  await prisma.$transaction(async (tx) => {
    const ingredientIds = new Map<string, string>();
    for (const ingredient of ingredientsData) {
      // update rỗng: không đặt lại tồn kho nguyên liệu đã có.
      const saved = await tx.ingredient.upsert({
        where: { code: ingredient.code },
        update: {},
        create: ingredient,
      });
      ingredientIds.set(ingredient.code, saved.id);
    }

    const toppings = [];
    for (const topping of toppingsData) {
      const saved = await tx.topping.upsert({
        where: { code: topping.code },
        update: {},
        create: topping,
      });
      toppings.push(saved);

      // Chỉ bổ sung dòng công thức còn thiếu; không ghi đè công thức đã chỉnh.
      await tx.toppingRecipeItem.createMany({
        data: toppingRecipes[topping.code].map(([code, quantity]) => ({
          toppingId: saved.id,
          ingredientId: ingredientIds.get(code)!,
          quantity,
        })),
        skipDuplicates: true,
      });
    }

    for (const { variants, ...productData } of productsData) {
      const product = await tx.product.upsert({
        where: { sku: productData.sku },
        update: {},
        create: productData,
      });

      for (const variant of variants) {
        const savedVariant = await tx.productVariant.upsert({
          where: {
            productId_size: { productId: product.id, size: variant.size },
          },
          update: {},
          create: { ...variant, productId: product.id },
        });

        // Chỉ bổ sung dòng công thức còn thiếu; không ghi đè công thức đã chỉnh.
        const recipe = recipes[productData.sku]?.[variant.size] ?? [];
        await tx.recipeItem.createMany({
          data: recipe.map(([code, quantity]) => ({
            productVariantId: savedVariant.id,
            ingredientId: ingredientIds.get(code)!,
            quantity,
          })),
          skipDuplicates: true,
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

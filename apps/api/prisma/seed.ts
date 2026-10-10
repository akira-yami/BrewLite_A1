
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, ProductSize } from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });
async function main() {
  console.log('🌱 Bắt đầu seed Catalog Product / Variant / Topping...');

  // Dọn sạch dữ liệu cũ theo đúng thứ tự ràng buộc khóa ngoại
  await prisma.orderItemTopping.deleteMany().catch(() => {});
  await prisma.orderItem.deleteMany().catch(() => {});
  await prisma.inventoryReservation.deleteMany().catch(() => {});
  await prisma.productTopping.deleteMany().catch(() => {});
  await prisma.productVariant.deleteMany().catch(() => {});
  await prisma.product.deleteMany().catch(() => {});
  await prisma.topping.deleteMany().catch(() => {});

  // 1. Tạo Toppings (BigInt cho price, có code)
  const toppingsData = [
    { code: 'TOP_PEARL', name: 'Trân châu trắng tuyết hoa', price: BigInt(8000), isActive: true },
    { code: 'TOP_CHEESE', name: 'Kem cheese mật ong béo ngậy', price: BigInt(10000), isActive: true },
    { code: 'TOP_ESPRESSO', name: 'Extra Shot Espresso Cầu Đất', price: BigInt(12000), isActive: true },
  ];

  const createdToppings = await Promise.all(
    toppingsData.map((t) => prisma.topping.create({ data: t }))
  );

  // 2. Tạo Products & Variants
  const productsData = [
    {
      sku: 'COFFEE-CAU-DAT-01',
      name: 'Cà phê sữa Cầu Đất Mộc',
      description: 'Robusta Cầu Đất rang mộc vừa, chiết xuất phin hòa quyện cùng sữa đặc giữ nhiệt 70°C.',
      imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(30000), stock: 100 },
        { size: ProductSize.M, price: BigInt(35000), stock: 100 },
        { size: ProductSize.L, price: BigInt(40000), stock: 100 },
      ],
    },
    {
      sku: 'COLD-BREW-ICE-02',
      name: 'Cold Brew Tuyết Trắng Băng Giá',
      description: 'Espresso ủ lạnh 16 tiếng qua màng lọc thạch anh, nốt hương socola đen và vỏ cam sấy.',
      imageUrl: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600&auto=format&fit=crop&q=80',
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(38000), stock: 50 },
        { size: ProductSize.M, price: BigInt(42000), stock: 50 },
        { size: ProductSize.L, price: BigInt(48000), stock: 50 },
      ],
    },
    {
      sku: 'CAPPUCCINO-HEARTH-03',
      name: 'Cappuccino Hoa Quế Lò Sưởi',
      description: 'Lớp bọt sữa tươi mịn như tuyết ôm trọn dòng cà phê nóng, rắc bột quế hoa lửa thơm nồng.',
      imageUrl: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80',
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(40000), stock: 50 },
        { size: ProductSize.M, price: BigInt(45000), stock: 50 },
        { size: ProductSize.L, price: BigInt(50000), stock: 50 },
      ],
    },
    {
      sku: 'TEA-PEACH-ORANGE-04',
      name: 'Trà Đào Cam Sả Ủ Lửa Thảo Mộc',
      description: 'Lá trà xanh ướp sả tươi hòa cùng lát cam vàng mọng nước sưởi ấm cổ họng.',
      imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&auto=format&fit=crop&q=80',
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(35000), stock: 80 },
        { size: ProductSize.M, price: BigInt(39000), stock: 80 },
        { size: ProductSize.L, price: BigInt(44000), stock: 80 },
      ],
    },
    {
      sku: 'TEA-OOLONG-EGG-05',
      name: 'Trà Oolong Than Kem Trứng Khò',
      description: 'Trà Oolong sấy than củi thượng hạng phủ lớp kem trứng béo ngậy khò caramen thơm nức.',
      imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
      isActive: true,
      variants: [
        { size: ProductSize.S, price: BigInt(40000), stock: 80 },
        { size: ProductSize.M, price: BigInt(45000), stock: 80 },
        { size: ProductSize.L, price: BigInt(50000), stock: 80 },
      ],
    },
    {
      sku: 'PASTRY-CROISSANT-06',
      name: 'Bánh Croissant Bơ Pháp Nướng Nóng',
      description: 'Bánh sừng bò ngàn lớp nướng mới tại quầy, giữ trọn mùi thơm ngào ngạt của bơ tươi.',
      imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop&q=80',
      isActive: true,
      variants: [
        { size: ProductSize.M, price: BigInt(28000), stock: 30 },
      ],
    },
  ];

  for (const prod of productsData) {
    const { variants, ...productInfo } = prod;
    const createdProduct = await prisma.product.create({
      data: {
        ...productInfo,
        variants: {
          create: variants,
        },
      },
    });

    // Gán topping cho tất cả đồ uống
    if (!prod.sku.startsWith('PASTRY')) {
   await prisma.productTopping.createMany({
        data: createdToppings.map((t: any) => ({
          productId: createdProduct.id,
          toppingId: t.id,
        })),
      });
    }
  }

  console.log('✅ Seed dữ liệu Catalog hoàn tất!');
}

main()
  .catch((e) => {
    console.error('Lỗi khi seed dữ liệu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
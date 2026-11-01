import { ProductSize, type PrismaClient } from '../src/generated/prisma/client.js';
import { faker } from '@faker-js/faker/locale/vi';

export async function seedMock(prisma: PrismaClient) {
  console.log('Bắt đầu tạo 30 sản phẩm mock để test phân trang...');

  for (let i = 1; i <= 30; i++) {
    const sku = `MOCK-PROD-${String(i).padStart(3, '0')}`;
    
    await prisma.product.upsert({
      where: { sku },
      update: {},
      create: {
        sku,
        name: `Đồ uống Test ${i} - ${faker.commerce.productAdjective()}`,
        description: faker.commerce.productDescription(),
        imageUrl: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=800&q=80',
        isActive: true,
        variants: {
          create: [
            { size: ProductSize.S, price: BigInt(25000), stock: 50 },
            { size: ProductSize.M, price: BigInt(30000), stock: 50 },
          ],
        },
      },
    });
  }

  console.log('Đã tạo xong 30 sản phẩm mock!');
}

import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

import { seedCatalog } from './seed-catalog.js';
import { seedMock } from './seed-mock.js';
import { seedCoupons } from './seed-coupons.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    console.log('Bắt đầu seed dữ liệu...');

    // Bước 1: Seed nguyên liệu, topping, sản phẩm và biến thể.
    await seedCatalog(prisma);

    // Bước 2: Seed dữ liệu sản phẩm mock và công thức.
    await seedMock(prisma);

    // Bước 3: Seed coupon và dữ liệu redemption demo.
    await seedCoupons(prisma);

    console.log('Seed dữ liệu hoàn tất.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Seed database thất bại:', error);
  process.exitCode = 1;
});

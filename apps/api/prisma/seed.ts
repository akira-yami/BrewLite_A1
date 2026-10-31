import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedCatalog } from './seed-catalog.js';
import { seedMock } from './seed-mock.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error('DATABASE_URL is required to seed the database');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  
  try {
    console.log('Bổ sung dữ liệu Catalog...');
    await seedCatalog(prisma);
    console.log('Seed Catalog hoàn tất.');

    console.log('Đang tạo 30 dữ liệu mock...');
    await seedMock(prisma);
    console.log('Seed Mock Data hoàn tất.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Lỗi khi seed dữ liệu:', error);
  process.exitCode = 1;
});
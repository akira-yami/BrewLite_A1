import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedCatalog } from './seed-catalog.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error('DATABASE_URL is required to seed the catalog');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    console.log(
      'Bổ sung dữ liệu Catalog còn thiếu, giữ nguyên dữ liệu hiện có...',
    );
    await seedCatalog(prisma);
    console.log('Seed Catalog hoàn tất.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Lỗi khi seed dữ liệu:', error);
  process.exitCode = 1;
});

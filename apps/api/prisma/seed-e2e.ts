import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDemoUsers } from './seed-staff.js';
import { seedCatalog } from './seed-catalog.js';

// Chỉ seed catalog; không phụ thuộc dữ liệu đơn hàng/mock ngẫu nhiên của demo.
const connectionString = process.env.DATABASE_URL;
if (!connectionString || !new URL(connectionString).pathname.endsWith('_e2e')) {
  throw new Error('E2E seed requires a dedicated database whose name ends in _e2e');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  await seedCatalog(prisma);
  await seedDemoUsers(prisma);
} finally {
  await prisma.$disconnect();
}

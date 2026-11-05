import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedCatalog } from './seed-catalog.js';
import { seedDemoUsers } from './seed-staff.js';

// A reproducible demo catalog and staff account; no fabricated customer orders.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  await seedCatalog(prisma);
  await seedDemoUsers(prisma);
} finally {
  await prisma.$disconnect();
}

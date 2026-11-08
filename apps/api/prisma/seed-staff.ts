import bcrypt from 'bcryptjs';
import type { PrismaClient } from '../src/generated/prisma/client.js';

/** Fixed credentials for the local coursework demo. Passwords are hashed in DB. */
export const DEMO_ACCOUNTS = [
  { username: 'customer01', password: 'Customer@123', role: 'CUSTOMER' },
  { username: 'barista01', password: 'Barista@123', role: 'BARISTA' },
  { username: 'operator01', password: 'Operator@123', role: 'PAYMENT_OPERATOR' },
] as const;

export async function seedDemoUsers(prisma: PrismaClient) {
  for (const { username, password, role } of DEMO_ACCOUNTS) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
      where: { username },
      update: { passwordHash, role, isActive: true },
      create: { username, passwordHash, role },
    });
    console.log(`Demo account ready: ${username} (${role}).`);
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class UsersService {
  async assertActiveCustomer(tx: Prisma.TransactionClient, id: string) {
    const user = await tx.user.findFirst({
      where: { id, isActive: true, role: 'CUSTOMER' },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException();
  }
}

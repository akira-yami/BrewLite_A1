import type { OrderHistoryQueryDto } from '../dto/order-history-query.dto.js';
import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  OrderStatus,
  Prisma,
} from '../../../generated/prisma/client.js';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdAndUserId(id: string, userId: string) {
    return this.prisma.order.findUnique({ where: { id, userId } });
  }

  async findOrdersByUserId(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            orderItemToppings: true,
          },
        },
      },
    });
  }

  async findOrdersPage(userId: string, query: OrderHistoryQueryDto) {
    return this.prisma.order.findMany({
      where: { userId, ...(query.status ? { status: query.status } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: (query.limit ?? 20) + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor, userId }, skip: 1 }
        : {}),
      include: { items: { include: { orderItemToppings: true } } },
    });
  }

  async findOrderDetail(orderId: string, userId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: {
          include: {
            orderItemToppings: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            method: true,
            status: true,
            amount: true,
            gatewayTransactionId: true,
            processedAt: true,
            createdAt: true,
          },
        },
        statusHistories: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });
  }


async updateStatusWithHistory(
  orderId: string,
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
  userId: string,
  reason: string,
  tx?: Prisma.TransactionClient,
) {
  // Pháº§n xá»­ lÃ½ cáº­p nháº­t Ä‘Æ¡n vÃ  lá»‹ch sá»­.
  const execute = async (
    client: Prisma.TransactionClient,
  ) => {
    const updated = await client.order.updateMany({
      where: {
        id: orderId,
        status: currentStatus,
      },
      data: {
        status: newStatus,
      },
    });

    // KhÃ´ng cho phÃ©p hai tiáº¿n trÃ¬nh cÃ¹ng chuyá»ƒn tráº¡ng thÃ¡i.
    if (updated.count !== 1) {
      throw new ConflictException(
        'Order status changed; cannot update this order',
      );
    }

    // Chá»‰ ghi lá»‹ch sá»­ sau khi cáº­p nháº­t tráº¡ng thÃ¡i thÃ nh cÃ´ng.
    await client.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: currentStatus,
        toStatus: newStatus,
        changedByUserId: userId,
        reason,
      },
    });
  };

  // Náº¿u Ä‘Ã£ cÃ³ transaction thÃ¬ sá»­ dá»¥ng transaction Ä‘Ã³.
  if (tx) {
    return execute(tx);
  }

  // If there is no existing transaction, create one.
  return this.prisma.$transaction(execute);
}

async markAsPaid(
  orderId: string,
  currentStatus: OrderStatus,
  userId: string,
  orderTotal: bigint,
  tx: Prisma.TransactionClient,
) {
  const updated = await tx.order.updateMany({
    where: { id: orderId, status: currentStatus },
    data: { status: OrderStatus.PAID },
  });

  if (updated.count !== 1) {throw new ConflictException('Order status changed; cannot mark as paid');}

  // Ghi nhận lịch sử chuyển trạng thái sang PAID (A1-8.3 / SD-04)
  await tx.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: currentStatus,
      toStatus: OrderStatus.PAID,
      changedByUserId: userId,
      reason: 'Thanh toán thành công',
    },
  });

  await tx.inventoryReservation.updateMany({
    where: { orderId, status: 'ACTIVE' },
    data: { status: 'CONSUMED' },
  });

  await tx.couponRedemption.updateMany({
    where: { orderId, status: 'RESERVED' },
    data: { status: 'CONSUMED', consumedAt: new Date() },
  });

  const earnedPoints = Number(orderTotal / 10n);
  const user = await tx.user.update({
    where: { id: userId },
    data: { loyaltyBalance: { increment: earnedPoints } },
  });

  await tx.loyaltyTransaction.create({
    data: {
      userId,
      orderId,
      type: 'EARN',
      points: earnedPoints,
      balanceAfter: user.loyaltyBalance,
      reason: `Tích điểm đơn hàng ${orderId}`,
    },
  });
}
}

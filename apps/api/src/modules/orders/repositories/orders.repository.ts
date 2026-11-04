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

  async lockById(id: string, tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
    return tx.order.findUnique({ where: { id } });
  }

  async findByIdAndUserId(id: string, userId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).order.findUnique({ where: { id, userId } });
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
  // Phần xử lý cập nhật đơn và lịch sử.
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

    // Không cho phép hai tiến trình cùng chuyển trạng thái.
    if (updated.count !== 1) {
      throw new ConflictException(
        'Order status changed; cannot update this order',
      );
    }

    // Chỉ ghi lịch sử sau khi cập nhật trạng thái thành công.
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

  // Nếu đã có transaction thì sử dụng transaction đó.
  if (tx) {
    return execute(tx);
  }

  // Nếu không có thì tự tạo transaction.
  return this.prisma.$transaction(execute);
}



async markAsPaid(
  orderId: string,
  currentStatus: OrderStatus,
  userId: string,
  orderTotal: bigint,
  tx: Prisma.TransactionClient,
) {
  // Giành quyền chuyển đơn sang PAID.
  const updated = await tx.order.updateMany({
    where: {
      id: orderId,
      status: currentStatus,
    },
    data: {
      status: OrderStatus.PAID,
    },
  });

  if (updated.count !== 1) {
    throw new ConflictException(
      'Order status changed; cannot mark as paid',
    );
  }

  // Timeline là nguồn hiển thị cho customer history/detail, nên phải được
  // ghi trong cùng transaction với payment và state transition.
  await tx.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: currentStatus,
      toStatus: OrderStatus.PAID,
      changedByUserId: userId,
      reason: 'Thanh toán thành công',
    },
  });

  // Chỉ chuyển reservation còn ACTIVE thành CONSUMED.
  await tx.inventoryReservation.updateMany({
    where: {
      orderId,
      status: 'ACTIVE',
    },
    data: {
      status: 'CONSUMED',
    },
  });

  // Xác nhận coupon đã sử dụng.
  await tx.couponRedemption.updateMany({
    where: {
      orderId,
      status: 'RESERVED',
    },
    data: {
      status: 'CONSUMED',
      consumedAt: new Date(),
    },
  });

  // Tính điểm thưởng.
  const earnedPoints = Number(orderTotal / 10n);

  const user = await tx.user.update({
    where: {
      id: userId,
    },
    data: {
      loyaltyBalance: {
        increment: earnedPoints,
      },
    },
  });

  // Ghi lịch sử cộng điểm.
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

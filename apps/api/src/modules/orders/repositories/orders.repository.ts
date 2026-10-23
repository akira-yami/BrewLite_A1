import type { OrderHistoryQueryDto } from '../dto/order-history-query.dto.js';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { OrderStatus, Prisma } from '../../../generated/prisma/client.js';

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
    const client = tx ?? this.prisma;

    await client.order.update({
      where: { id: orderId, status: currentStatus as OrderStatus },
      data: { status: newStatus as OrderStatus },
    });

    await client.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: currentStatus,
        toStatus: newStatus,
        changedByUserId: userId,
        reason,
      },
    });
  }

  async markAsPaid(
    orderId: string,
    currentStatus: OrderStatus,
    userId: string,
    orderTotal: bigint,
    tx: Prisma.TransactionClient,
  ) {
    await tx.order.update({
      where: { id: orderId, status: currentStatus },
      data: { status: OrderStatus.PAID },
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

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { OrderStatus, Prisma } from '../../../generated/prisma/client.js';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveVariantById(variantId: string) {
    return this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        isActive: true,
        product: {
          isActive: true,
        },
      },
      include: {
        product: {
          include: {
            productToppings: {
              include: {
                topping: true,
              },
            },
          },
        },
      },
    });
  }

  async findByIdAndUserId(id: string, userId: string) {return this.prisma.order.findUnique({where: { id, userId },});}

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
      where: { id: orderId, status: currentStatus},
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
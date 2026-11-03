
import {
  Injectable,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../../database/prisma.service.js';
import { OrdersRepository } from '../repositories/orders.repository.js';
import { InventoryService } from '../../inventory/services/inventory.service.js';
import { PromotionsService } from '../../promotions/services/promotions.service.js';
import { OrderStatus } from '../../../generated/prisma/client.js';

@Injectable()
export class OrderExpiryJob {
  private readonly logger = new Logger(OrderExpiryJob.name);

  // Ngăn hai lần chạy job đồng thời trong cùng một instance.
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersRepo: OrdersRepository,
    private readonly inventoryService: InventoryService,
    private readonly promotionsService: PromotionsService,
  ) {}

  // Tự động kiểm tra đơn hàng hết hạn mỗi phút.
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredOrders(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const now = new Date();

      // Both unpaid states must release their reservations after the TTL.
      const expiredOrders = await this.prisma.order.findMany({
        where: {
          status: { in: [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] },
          reservationExpiresAt: {
            lte: now,
          },
        },
        select: {
          id: true,
          userId: true,
        },
      });

      for (const order of expiredOrders) {
        try {
          const cancelled = await this.prisma.$transaction(async (tx) => {
            // Payment admission uses the same row lock. Recheck after waiting:
            // a payment admitted before TTL owns the reservation until it settles.
            const current = await this.ordersRepo.lockById(order.id, tx);
            if (!current ||
                (current.status !== OrderStatus.PENDING && current.status !== OrderStatus.PAYMENT_FAILED) ||
                current.reservationExpiresAt > now) return false;
            const processing = await tx.payment.findFirst({
              where: { orderId: order.id, status: 'PROCESSING' },
              select: { id: true },
            });
            if (processing) return false;
            // Chuyển trạng thái đơn và ghi lịch sử trong transaction.
            // Nếu đơn đã bị tiến trình khác xử lý, thao tác sẽ thất bại.
            await this.ordersRepo.updateStatusWithHistory(
              order.id,
              current.status,
              OrderStatus.CANCELLED,
              order.userId,
              `Hủy tự động do đơn hàng hết thời hạn thanh toán: ${order.id}`,
              tx,
            );

            // Lấy các reservation còn ACTIVE của đơn hàng.
            const reservations =
              await tx.inventoryReservation.findMany({
                where: {
                  orderId: order.id,
                  status: 'ACTIVE',
                },
                select: {
                  id: true,
                },
              });

            // Chuyển reservation sang EXPIRED và hoàn kho.
            // Thao tác dùng chung transaction với việc hủy đơn.
            for (const reservation of reservations) {
              await this.inventoryService.releaseInTransaction(
                tx,
                reservation.id,
                true,
              );
            }

            await this.promotionsService.releaseByOrderId(
              order.id,
              'EXPIRED',
              now,
              tx,
            );
            return true;
          });

          if (cancelled) this.logger.log(
            `Đã hủy đơn ${order.id}, hết hạn reservation và hoàn kho/coupon thành công.`,
          );
        } catch (error) {
          if (error instanceof ConflictException) {
            this.logger.warn(
              `Bỏ qua đơn ${order.id}: ${error.message}`,
            );
          } else {
            this.logger.error(
              `Lỗi xử lý đơn ${order.id}: ${
                error instanceof Error
                  ? error.message
                  : String(error)
              }`,
              error instanceof Error ? error.stack : undefined,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(
        'Lỗi quét các đơn hàng hết hạn.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.isRunning = false;
    }
  }
}


import {
  Injectable,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../../database/prisma.service.js';
import { OrdersRepository } from '../repositories/orders.repository.js';
import { InventoryService } from '../../inventory/services/inventory.service.js';
import { PromotionsRepository } from '../../promotions/repositories/promotions.repository.js';
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
    private readonly promotionsRepo: PromotionsRepository,
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

      // Tìm cả đơn PENDING và PAYMENT_FAILED đã hết hạn.
      const expiredOrders = await this.prisma.order.findMany({
        where: {
          status: {
            in: [
              OrderStatus.PENDING,
              OrderStatus.PAYMENT_FAILED,
            ],
          },
          reservationExpiresAt: {
            lte: now,
          },
        },
        select: {
          id: true,
          userId: true,
          status: true,
        },
      });

      for (const order of expiredOrders) {
        try {
          await this.prisma.$transaction(async (tx) => {
            // Chỉ hủy nếu đơn vẫn giữ trạng thái đã đọc được.
            // Nếu tiến trình khác đã xử lý đơn, transaction rollback.
            await this.ordersRepo.updateStatusWithHistory(
              order.id,
              order.status,
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
            for (const reservation of reservations) {
              await this.inventoryService.releaseInTransaction(
                tx,
                reservation.id,
                true,
              );
            }

            // Giải phóng coupon còn RESERVED.
            // Chỉ cập nhật một lần nhờ điều kiện status.
            await this.promotionsRepo.releaseByOrderId(
              order.id,
              'EXPIRED',
              now,
              tx,
            );
          });

          this.logger.log(
            `Đã hủy đơn ${order.id}, hết hạn reservation, hoàn kho và giải phóng coupon thành công.`,
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

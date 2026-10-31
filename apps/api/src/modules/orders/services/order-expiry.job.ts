import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../database/prisma.service.js';
import { OrdersRepository } from '../repositories/orders.repository.js';
import { InventoryService } from '../../inventory/services/inventory.service.js';
import { OrderStatus } from '../../../generated/prisma/client.js';

@Injectable()
export class OrderExpiryJob {
  private readonly logger = new Logger(OrderExpiryJob.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersRepo: OrdersRepository,
    private readonly inventoryService: InventoryService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredOrders() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const now = new Date();
      // Tìm các đơn PENDING đã quá hạn
      const expiredOrders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.PENDING,
          reservationExpiresAt: { lte: now },
        },
        select: { id: true, userId: true },
        take: 50,
      });

      for (const order of expiredOrders) {
        try {
          // A. Dùng Transaction để Hủy đơn & Hoàn mã giảm giá
          await this.prisma.$transaction(async (tx) => {
            const check = await tx.order.findUnique({ where: { id: order.id } });
            if (check?.status !== OrderStatus.PENDING) return;

            await this.ordersRepo.updateStatusWithHistory(
              order.id,
              OrderStatus.PENDING,
              OrderStatus.CANCELLED,
              order.userId,
              'Hủy tự động do quá thời gian giữ chỗ',
              tx,
            );

            await tx.couponRedemption.updateMany({
              where: { orderId: order.id, status: 'RESERVED' },
              data: { status: 'EXPIRED', releasedAt: now },
            });
          });

          // B. Gọi InventoryService để nhả kho (Service này tự quản lý Transaction an toàn)
          const reservations = await this.prisma.inventoryReservation.findMany({
            where: { orderId: order.id, status: 'ACTIVE' },
          });

          for (const res of reservations) {
            await this.inventoryService.release(res.id, true).catch((e) => {
              this.logger.warn(`Lỗi nhả kho ${res.id}: ${e.message}`);
            });
          }

          this.logger.log(`Đã hủy tự động đơn hàng hết hạn: ${order.id}`);
        } catch (error) {
          this.logger.error(`Lỗi xử lý đơn ${order.id}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Lỗi quét đơn hết hạn', error);
    } finally {
      this.isRunning = false;
    }
  }
}
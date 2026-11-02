
import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../database/prisma.service.js';
import { InventoryService } from './inventory.service.js';
import { PaymentStatus, ReservationStatus } from '../../../generated/prisma/enums.js';

@Injectable()
export class InventoryExpiryJob {
  private readonly logger = new Logger(InventoryExpiryJob.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  // Chạy mỗi phút để xử lý các reservation đã hết hạn.
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredReservations() {
    this.logger.log('Inventory expiry cron triggered');
    // Tránh hai lượt chạy chồng lên nhau trong cùng tiến trình.
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      // Không giải phóng kho của Order còn Payment PROCESSING: kết quả gateway
      // có thể chưa được ghi xuống DB sau khi tiến trình bị gián đoạn.
      const reservations = await this.prisma.inventoryReservation.findMany({
          where: {
            status: ReservationStatus.ACTIVE,
            expiresAt: { lte: new Date() },
            order: {
              payments: {
                none: { status: PaymentStatus.PROCESSING },
              },
            },
          },
          select: { id: true },
          orderBy: { expiresAt: 'asc' },
          take: 100,
        });

      for (const reservation of reservations) {
        try {
          await this.inventoryService.release(
            reservation.id,
            true,
          );
        } catch (error) {
          // Luồng khác đã xử lý reservation này thì bỏ qua.
          if (error instanceof ConflictException) {
            continue;
          }

          // Ghi lỗi để có thể kiểm tra khi job gặp sự cố.
          this.logger.error(
            `Failed to expire reservation ${reservation.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Failed to query expired reservations',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }
}

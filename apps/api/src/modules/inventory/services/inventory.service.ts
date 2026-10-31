import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { InventoryRepository } from '../repositories/inventory.repository.js';

// Lỗi riêng khi version tồn kho đã thay đổi.
// OrdersService sẽ bắt lỗi này để retry transaction tạo đơn.
export class InventoryVersionConflict extends Error {
  constructor() {
    super('Inventory version changed; please retry');
    this.name = 'InventoryVersionConflict';
  }
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: InventoryRepository,
  ) {}

  /**
   * Giữ hàng cho đơn hàng.
   * Phải được gọi bên trong transaction tạo Order.
   *
   * needs lấy từ OrdersService.validateAndPriceItems().
   */
    // Cách gọi mới từ OrdersService: dùng version đã đọc khi báo giá.
  async reserve(
    tx: Prisma.TransactionClient,
    orderId: string,
    expiresAt: Date,
    needs: Map<string, { quantity: number; version: number }>,
  ): Promise<void>;

  // Cách gọi cũ từ các test/integration: tự đọc version hiện tại.
  async reserve(
    tx: Prisma.TransactionClient,
    orderId: string,
    items: Array<{
      productVariantId: string;
      quantity: number;
    }>,
    expiresAt: Date,
  ): Promise<
    Awaited<ReturnType<InventoryRepository['createReservation']>>[]
  >;

  async reserve(
  tx: Prisma.TransactionClient,
  orderId: string,
  third:
    | Date
    | Array<{ productVariantId: string; quantity: number }>,
  fourth:
    | Map<string, { quantity: number; version: number }>
    | Date,
): Promise<any> {
    // Trường hợp mới: OrdersService truyền Date trước, Map sau.
    if (third instanceof Date) {
      const expiresAt = third;
      const needs = fourth as Map<
        string,
        { quantity: number; version: number }
      >;

      if (expiresAt <= new Date()) {
        throw new ConflictException(
          'Reservation expiry must be in the future',
        );
      }

      const sortedNeeds = [...needs.entries()].sort(
        ([a], [b]) => a.localeCompare(b),
      );

      for (const [variantId, need] of sortedNeeds) {
        if (!Number.isInteger(need.quantity) || need.quantity <= 0) {
          throw new ConflictException('Invalid reservation quantity');
        }

        const updated = await this.repository.reserveStock(
          tx,
          variantId,
          need.version,
          need.quantity,
        );

        if (updated.count !== 1) {
          throw new InventoryVersionConflict();
        }

        await this.repository.createReservation(
          tx,
          orderId,
          variantId,
          need.quantity,
          expiresAt,
        );
      }

      return;
    }

    // Trường hợp cũ: các test truyền mảng items trước, Date sau.
    const items = third;
    const expiresAt = fourth as Date;

    if (expiresAt <= new Date()) {
      throw new ConflictException(
        'Reservation expiry must be in the future',
      );
    }

    // Gộp các dòng sản phẩm trùng variantId.
    const grouped = new Map<string, number>();

    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ConflictException('Invalid reservation quantity');
      }

      grouped.set(
        item.productVariantId,
        (grouped.get(item.productVariantId) ?? 0) + item.quantity,
      );
    }

    const reservations: Awaited<
      ReturnType<InventoryRepository['createReservation']>
    >[] = [];

    const sortedItems = [...grouped.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    );

    for (const [variantId, quantity] of sortedItems) {
      const variant = await this.repository.findVariant(tx, variantId);

      if (!variant || !variant.isActive) {
        throw new NotFoundException(
          'Product variant not found or inactive',
        );
      }

      if (variant.stock < quantity) {
        throw new ConflictException('Insufficient stock');
      }

      const updated = await this.repository.reserveStock(
        tx,
        variantId,
        variant.version,
        quantity,
      );

      if (updated.count !== 1) {
        throw new ConflictException(
          'Inventory changed concurrently; please retry',
        );
      }

      const reservation = await this.repository.createReservation(
        tx,
        orderId,
        variantId,
        quantity,
        expiresAt,
      );

      reservations.push(reservation);
    }

    return reservations;
  }

  /**
   * Xác nhận hàng đã được sử dụng.
   * Không trừ kho lần nữa vì kho đã giảm lúc reserve.
   */
  async consume(reservationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const reservation =
        await this.repository.findReservation(tx, reservationId);

      if (!reservation) {
        throw new NotFoundException(
          'Inventory reservation not found',
        );
      }

      if (reservation.status !== 'ACTIVE') {
        throw new ConflictException(
          'Reservation is no longer active',
        );
      }

      if (reservation.expiresAt <= new Date()) {
        throw new ConflictException(
          'Reservation has expired',
        );
      }

      const updated =
        await this.repository.transitionActiveReservation(
          tx,
          reservationId,
          'CONSUMED',
          'NOT_EXPIRED',
        );

      if (updated.count !== 1) {
        throw new ConflictException(
          'Reservation changed concurrently; please retry',
        );
      }

      return {
        reservationId,
        status: 'CONSUMED' as const,
      };
    });
  }

  /**
   * Nhả kho bên trong transaction có sẵn.
   * Dùng cho OrderExpiryJob.
   */
  async releaseInTransaction(
    tx: Prisma.TransactionClient,
    reservationId: string,
    expired = false,
  ) {
    const reservation =
      await this.repository.findReservation(tx, reservationId);

    if (!reservation) {
      throw new NotFoundException(
        'Inventory reservation not found',
      );
    }

    if (reservation.status !== 'ACTIVE') {
      throw new ConflictException(
        'Reservation is no longer active',
      );
    }

    const now = new Date();

    if (expired && reservation.expiresAt > now) {
      throw new ConflictException(
        'Reservation has not expired',
      );
    }

    if (!expired && reservation.expiresAt <= now) {
      throw new ConflictException(
        'Reservation has expired',
      );
    }

    // Chỉ reservation chuyển trạng thái thành công mới được hoàn kho.
    const updated =
      await this.repository.transitionActiveReservation(
        tx,
        reservationId,
        expired ? 'EXPIRED' : 'RELEASED',
        expired ? 'EXPIRED' : 'NOT_EXPIRED',
      );

    if (updated.count !== 1) {
      throw new ConflictException(
        'Reservation changed concurrently; please retry',
      );
    }

    await this.repository.restoreStock(
      tx,
      reservation.productVariantId,
      reservation.quantity,
    );

    return {
      reservationId,
      status: expired ? ('EXPIRED' as const) : ('RELEASED' as const),
    };
  }

  /**
   * Nhả kho độc lập.
   * Những nơi đang sử dụng release() không cần thay đổi.
   */
  async release(
    reservationId: string,
    expired = false,
  ) {
    return this.prisma.$transaction((tx) =>
      this.releaseInTransaction(tx, reservationId, expired),
    );
  }
}
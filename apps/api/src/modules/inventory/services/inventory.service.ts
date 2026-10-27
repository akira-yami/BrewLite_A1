
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { InventoryRepository } from '../repositories/inventory.repository.js';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: InventoryRepository,
  ) {}

  /**
   * Giữ hàng cho một đơn đã được tạo trong cùng transaction.
   * Gọi hàm này từ luồng tạo đơn sau khi đã tạo Order.
   */
  async reserve(
    tx: Prisma.TransactionClient,
    orderId: string,
    items: Array<{ productVariantId: string; quantity: number }>,
    expiresAt: Date,
  ) {
    if (items.length === 0) {
      throw new ConflictException('Order must contain at least one item');
    }

    if (expiresAt <= new Date()) {
      throw new ConflictException('Reservation expiry must be in the future');
    }

    // Gộp các dòng trùng biến thể để tránh vi phạm unique(orderId, productVariantId).
    const quantities = new Map<string, number>();

    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ConflictException('Quantity must be a positive integer');
      }

      quantities.set(
        item.productVariantId,
        (quantities.get(item.productVariantId) ?? 0) + item.quantity,
      );
    }

    // Sắp xếp ID để các transaction xử lý nhiều biến thể theo cùng thứ tự.
    const sortedItems = [...quantities.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );

    const reservations = [];

    for (const [variantId, quantity] of sortedItems) {
      const variant = await this.repository.findVariant(tx, variantId);

      if (!variant || !variant.isActive) {
        throw new NotFoundException('Product variant not found or inactive');
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
          'Stock changed during reservation; please retry',
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
    const reservation = await this.repository.findReservation(
      tx,
      reservationId,
    );

    if (!reservation) {
      throw new NotFoundException('Inventory reservation not found');
    }

    if (reservation.status !== 'ACTIVE') {
      throw new ConflictException('Reservation is no longer active');
    }

    if (reservation.expiresAt <= new Date()) {
      throw new ConflictException('Reservation has expired');
    }

    // Chỉ chuyển sang CONSUMED nếu reservation vẫn chưa hết hạn.
    const updated = await this.repository.transitionActiveReservation(
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

    return { reservationId, status: 'CONSUMED' as const };
  });
}


  /**
   * Trả hàng vào kho nếu reservation còn ACTIVE.
   * Chỉ transaction thắng quyền chuyển trạng thái mới được cộng kho.
   */
  
  async release(reservationId: string, expired = false) {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await this.repository.findReservation(
        tx,
        reservationId,
      );

      if (!reservation) {
        throw new NotFoundException('Inventory reservation not found');
      }

      if (reservation.status !== 'ACTIVE') {
        throw new ConflictException('Reservation is no longer active');
      }

      const now = new Date();

      if (expired && reservation.expiresAt > now) {
        throw new ConflictException('Reservation has not expired');
      }

      if (!expired && reservation.expiresAt <= now) {
        throw new ConflictException('Reservation has expired');
      }

      const updated = await this.repository.transitionActiveReservation(
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
    });
  }

  
  
}

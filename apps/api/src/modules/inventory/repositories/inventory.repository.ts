
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';

@Injectable()
export class InventoryRepository {
  // Đọc tồn kho và version hiện tại của một biến thể sản phẩm.
  async findVariant(tx: Prisma.TransactionClient, variantId: string) {
    return tx.productVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        stock: true,
        version: true,
        isActive: true,
      },
    });
  }

  // Trừ kho có điều kiện: version phải khớp và tồn kho phải đủ.
  async reserveStock(
    tx: Prisma.TransactionClient,
    variantId: string,
    expectedVersion: number,
    quantity: number,
  ) {
    return tx.productVariant.updateMany({
      where: {
        id: variantId,
        version: expectedVersion,
        stock: { gte: quantity },
        isActive: true,
      },
      data: {
        stock: { decrement: quantity },
        version: { increment: 1 },
      },
    });
  }

  // Ghi nhận số lượng hàng đã giữ cho một đơn hàng.
  async createReservation(
    tx: Prisma.TransactionClient,
    orderId: string,
    variantId: string,
    quantity: number,
    expiresAt: Date,
  ) {
    return tx.inventoryReservation.create({
      data: {
        orderId,
        productVariantId: variantId,
        quantity,
        expiresAt,
      },
    });
  }

  // Đọc bản ghi giữ hàng.
  async findReservation(
    tx: Prisma.TransactionClient,
    reservationId: string,
  ) {
    return tx.inventoryReservation.findUnique({
      where: { id: reservationId },
    });
  }

 
  // Chỉ chuyển trạng thái nếu reservation vẫn ACTIVE
  // và điều kiện hết hạn phù hợp với thao tác.
  async transitionActiveReservation(
    tx: Prisma.TransactionClient,
    reservationId: string,
    nextStatus: 'CONSUMED' | 'RELEASED' | 'EXPIRED',
    expiryCondition?: 'NOT_EXPIRED' | 'EXPIRED',
  ) {
    return tx.inventoryReservation.updateMany({
      where: {
        id: reservationId,
        status: 'ACTIVE',
        ...(expiryCondition === 'NOT_EXPIRED'
          ? { expiresAt: { gt: new Date() } }
          : {}),
        ...(expiryCondition === 'EXPIRED'
          ? { expiresAt: { lte: new Date() } }
          : {}),
      },
      data: {
        status: nextStatus,
      },
    });
  }

  // Hoàn trả hàng vào kho và tăng version.
  async restoreStock(
    tx: Prisma.TransactionClient,
    variantId: string,
    quantity: number,
  ) {
    return tx.productVariant.update({
      where: { id: variantId },
      data: {
        stock: { increment: quantity },
        version: { increment: 1 },
      },
    });
  }
}

import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';

@Injectable()
export class InventoryRepository {
  // Đọc variant cùng công thức (BOM) và tồn kho/version hiện tại của từng nguyên liệu.
  async findVariantWithRecipe(tx: Prisma.TransactionClient, variantId: string) {
    return tx.productVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        isActive: true,
        recipeItems: {
          select: {
            ingredientId: true,
            quantity: true,
            ingredient: {
              select: {
                id: true,
                stockQuantity: true,
                version: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
  }

  // Trừ nguyên liệu có điều kiện: version phải khớp và tồn kho phải đủ.
  async reserveIngredient(
    tx: Prisma.TransactionClient,
    ingredientId: string,
    expectedVersion: number,
    quantity: number,
  ) {
    return tx.ingredient.updateMany({
      where: {
        id: ingredientId,
        version: expectedVersion,
        stockQuantity: { gte: quantity },
        isActive: true,
      },
      data: {
        stockQuantity: { decrement: quantity },
        version: { increment: 1 },
      },
    });
  }

  // Ghi nhận số ly và lượng nguyên liệu đã giữ cho một đơn hàng.
  async createReservation(
    tx: Prisma.TransactionClient,
    orderId: string,
    variantId: string,
    quantity: number,
    expiresAt: Date,
    items: Array<{ ingredientId: string; quantity: number }>,
  ) {
    return tx.inventoryReservation.create({
      data: {
        orderId,
        productVariantId: variantId,
        quantity,
         status: 'ACTIVE',
        expiresAt,
        items: { create: items },
      },
    });
  }

  // Đọc bản ghi giữ hàng kèm lượng nguyên liệu đã giữ.
  async findReservation(tx: Prisma.TransactionClient, reservationId: string) {
    return tx.inventoryReservation.findUnique({
      where: { id: reservationId },
      include: { items: true },
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

  // Hoàn nguyên liệu đã giữ vào kho và tăng version.
  async restoreIngredient(
    tx: Prisma.TransactionClient,
    ingredientId: string,
    quantity: number,
  ) {
    return tx.ingredient.update({
      where: { id: ingredientId },
      data: {
        stockQuantity: { increment: quantity },
        version: { increment: 1 },
      },
    });
  }
}

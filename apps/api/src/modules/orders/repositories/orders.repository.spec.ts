
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersRepository } from './orders.repository.js';
import { PrismaService } from '../../../database/prisma.service.js';

describe('OrdersRepository (Unit Test - TDD)', () => {
  let repository: OrdersRepository;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      $queryRaw: vi.fn(),
      productVariant: { findFirst: vi.fn() },
      order: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      orderStatusHistory: { create: vi.fn() },
      inventoryReservation: { updateMany: vi.fn() },
      couponRedemption: { updateMany: vi.fn() },
      loyaltyTransaction: { create: vi.fn() },
      user: { update: vi.fn() },
    };

    repository = new OrdersRepository(
      prismaMock as unknown as PrismaService,
    );
  });

  it('findByIdAndUserId - trả về order nếu đúng chủ đơn', async () => {
    const mockOrder = {
      id: 'o-1',
      userId: 'u-1',
      status: 'PENDING',
      total: 100000n,
    };

    prismaMock.order.findUnique.mockResolvedValue(mockOrder);

    const result = await repository.findByIdAndUserId('o-1', 'u-1');

    expect(prismaMock.order.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'o-1',
        userId: 'u-1',
      },
    });

    expect(result).toEqual(mockOrder);
  });

  it('findByIdAndUserIdForUpdate - khóa bản ghi theo cả orderId và userId trước khi trả dữ liệu', async () => {
    const tx = prismaMock;
    const mockOrder = { id: 'o-1', userId: 'u-1', status: 'PENDING' };
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'o-1' }]);
    prismaMock.order.findUnique.mockResolvedValue(mockOrder);

    const result = await repository.findByIdAndUserIdForUpdate(
      'o-1',
      'u-1',
      tx,
    );

    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(prismaMock.order.findUnique).toHaveBeenCalledWith({
      where: { id: 'o-1', userId: 'u-1' },
    });
    expect(result).toEqual(mockOrder);
  });

  it('findByIdForUpdate - trả về null nếu Order không còn tồn tại', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    const result = await repository.findByIdForUpdate('o-1', prismaMock);

    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('findOrdersByUserId - tìm tất cả đơn hàng theo userId, sắp xếp createdAt desc kèm items và toppings', async () => {
    const mockOrders = [{ id: 'o-1', userId: 'u-1' }];

    prismaMock.order.findMany.mockResolvedValue(mockOrders);

    const result = await repository.findOrdersByUserId('u-1');

    expect(prismaMock.order.findMany).toHaveBeenCalledWith({
      where: { userId: 'u-1' },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            orderItemToppings: true,
          },
        },
      },
    });

    expect(result).toEqual(mockOrders);
  });

  it('findOrderDetail - tìm chi tiết đơn hàng theo orderId và userId kèm items, payments, statusHistories', async () => {
    const mockDetail = {
      id: 'o-1',
      userId: 'u-1',
      payments: [],
      statusHistories: [],
    };

    prismaMock.order.findFirst.mockResolvedValue(mockDetail);

    const result = await repository.findOrderDetail('o-1', 'u-1');

    expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'o-1',
        userId: 'u-1',
      },
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

    expect(result).toEqual(mockDetail);
  });

  it('updateStatusWithHistory - cập nhật trạng thái và ghi log history', async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });

    await repository.updateStatusWithHistory(
      'o-1',
      'PENDING',
      'PAYMENT_FAILED',
      'u-1',
      'Lỗi Gateway',
      prismaMock,
    );

    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'o-1',
        status: 'PENDING',
      },
      data: {
        status: 'PAYMENT_FAILED',
      },
    });

    expect(prismaMock.orderStatusHistory.create).toHaveBeenCalledWith({
      data: {
        orderId: 'o-1',
        fromStatus: 'PENDING',
        toStatus: 'PAYMENT_FAILED',
        changedByUserId: 'u-1',
        reason: 'Lỗi Gateway',
      },
    });
  });

  it('markAsPaid - cập nhật PAID, consume inventory và cộng điểm loyalty EARN; không tự consume coupon', async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });

    prismaMock.user.update.mockResolvedValue({
      loyaltyBalance: 10000,
    });

    // Tỷ lệ quy đổi điểm giả định: 100.000 VND = 10.000 điểm.
    await repository.markAsPaid(
      'o-1',
      'PENDING',
      'u-1',
      100000n,
      prismaMock,
    );

    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'o-1',
        status: 'PENDING',
      },
      data: {
        status: 'PAID',
      },
    });

    expect(
      prismaMock.inventoryReservation.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        orderId: 'o-1',
        status: 'ACTIVE',
      },
      data: {
        status: 'CONSUMED',
      },
    });

    // Coupon được consume duy nhất ở PromotionsService, không phải trong OrdersRepository.
    expect(prismaMock.couponRedemption.updateMany).not.toHaveBeenCalled();

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: {
        loyaltyBalance: {
          increment: 10000,
        },
      },
    });

    expect(prismaMock.loyaltyTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u-1',
        orderId: 'o-1',
        type: 'EARN',
        points: 10000,
        balanceAfter: 10000,
        reason: 'Tích điểm đơn hàng o-1',
      },
    });
  });
});

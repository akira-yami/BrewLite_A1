
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service.js';
import { OrdersRepository } from '../repositories/orders.repository.js';
import { InventoryService } from '../../inventory/services/inventory.service.js';
import { PromotionsRepository } from '../../promotions/repositories/promotions.repository.js';
import { OrderStatus } from '../../../generated/prisma/client.js';

import { OrderExpiryJob } from './order-expiry.job.js';

function setup() {
  const expiredOrders = [
    {
      id: 'order-1',
      userId: 'user-1',
      status: OrderStatus.PENDING,
    },
    {
      id: 'order-2',
      userId: 'user-2',
      status: OrderStatus.PAYMENT_FAILED,
    },
  ];

  const reservations = [
    { id: 'reservation-1' },
    { id: 'reservation-2' },
  ];

  const tx = {
    inventoryReservation: {
      findMany: vi.fn().mockResolvedValue(reservations),
    },
  };

  const prisma = {
    order: {
      findMany: vi.fn().mockResolvedValue(expiredOrders),
    },
    $transaction: vi.fn(async (callback: (client: any) => Promise<any>) => {
      return callback(tx);
    }),
  };

  const ordersRepo = {
    updateStatusWithHistory: vi.fn().mockResolvedValue(undefined),
  };

  const inventoryService = {
    releaseInTransaction: vi.fn().mockResolvedValue('EXPIRED'),
  };

  const promotionsRepo = {
    releaseByOrderId: vi.fn().mockResolvedValue(1),
  };

  const job = new OrderExpiryJob(
    prisma as unknown as PrismaService,
    ordersRepo as unknown as OrdersRepository,
    inventoryService as unknown as InventoryService,
    promotionsRepo as unknown as PromotionsRepository,
  );

  return {
    job,
    prisma,
    tx,
    ordersRepo,
    inventoryService,
    promotionsRepo,
    expiredOrders,
    reservations,
  };
}

describe('OrderExpiryJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds expired PENDING and PAYMENT_FAILED orders', async () => {
    const { job, prisma } = setup();

    await job.handleExpiredOrders();

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: [
            OrderStatus.PENDING,
            OrderStatus.PAYMENT_FAILED,
          ],
        },
        reservationExpiresAt: {
          lte: expect.any(Date),
        },
      },
      select: {
        id: true,
        userId: true,
        status: true,
      },
    });
  });

  it.each([
    OrderStatus.PENDING,
    OrderStatus.PAYMENT_FAILED,
  ])('cancels an expired order from %s', async (status) => {
    const { job, prisma, ordersRepo } = setup();

    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        userId: 'user-1',
        status,
      },
    ]);

    await job.handleExpiredOrders();

    expect(ordersRepo.updateStatusWithHistory).toHaveBeenCalledWith(
      'order-1',
      status,
      OrderStatus.CANCELLED,
      'user-1',
      expect.stringContaining('hết thời hạn thanh toán'),
      expect.any(Object),
    );
  });

  it('expires active inventory reservations and restores stock', async () => {
    const {
      job,
      inventoryService,
      tx,
    } = setup();

    await job.handleExpiredOrders();

    expect(tx.inventoryReservation.findMany).toHaveBeenCalledWith({
      where: {
        orderId: 'order-1',
        status: 'ACTIVE',
      },
      select: {
        id: true,
      },
    });

    expect(inventoryService.releaseInTransaction).toHaveBeenCalledTimes(4);

    expect(inventoryService.releaseInTransaction).toHaveBeenNthCalledWith(
      1,
      tx,
      'reservation-1',
      true,
    );

    expect(inventoryService.releaseInTransaction).toHaveBeenNthCalledWith(
      2,
      tx,
      'reservation-2',
      true,
    );
  });

  it('expires the coupon in the same transaction', async () => {
    const {
      job,
      prisma,
      promotionsRepo,
    } = setup();

    await job.handleExpiredOrders();

    expect(promotionsRepo.releaseByOrderId).toHaveBeenCalledWith(
      'order-1',
      'EXPIRED',
      expect.any(Date),
      expect.any(Object),
    );

    expect(promotionsRepo.releaseByOrderId).toHaveBeenCalledWith(
      'order-2',
      'EXPIRED',
      expect.any(Date),
      expect.any(Object),
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('does not process orders when there are no expired orders', async () => {
    const {
      job,
      prisma,
      ordersRepo,
      inventoryService,
      promotionsRepo,
    } = setup();

    prisma.order.findMany.mockResolvedValue([]);

    await job.handleExpiredOrders();

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(ordersRepo.updateStatusWithHistory).not.toHaveBeenCalled();
    expect(inventoryService.releaseInTransaction).not.toHaveBeenCalled();
    expect(promotionsRepo.releaseByOrderId).not.toHaveBeenCalled();
  });

  it('does not release inventory or coupon when the order status has changed', async () => {
    const {
      job,
      ordersRepo,
      inventoryService,
      promotionsRepo,
    } = setup();

    ordersRepo.updateStatusWithHistory.mockRejectedValue(
      new ConflictException('Order status changed'),
    );

    await job.handleExpiredOrders();

    expect(inventoryService.releaseInTransaction).not.toHaveBeenCalled();
    expect(promotionsRepo.releaseByOrderId).not.toHaveBeenCalled();
  });

  it('does not expire coupon when inventory release fails', async () => {
    const {
      job,
      inventoryService,
      promotionsRepo,
    } = setup();

    inventoryService.releaseInTransaction.mockRejectedValue(
      new Error('Inventory release failed'),
    );

    await job.handleExpiredOrders();

    expect(inventoryService.releaseInTransaction).toHaveBeenCalled();
    expect(promotionsRepo.releaseByOrderId).not.toHaveBeenCalled();
  });

  it('calls coupon release for each expired order', async () => {
    const {
      job,
      promotionsRepo,
    } = setup();

    promotionsRepo.releaseByOrderId.mockResolvedValue(0);

    await job.handleExpiredOrders();

    expect(promotionsRepo.releaseByOrderId).toHaveBeenCalledTimes(2);
  });
});

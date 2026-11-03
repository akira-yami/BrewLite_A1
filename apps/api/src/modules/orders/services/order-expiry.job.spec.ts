import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '../../../generated/prisma/client.js';

vi.mock('@nestjs/schedule', () => ({
  Cron: () => () => {},
  CronExpression: { EVERY_MINUTE: '* * * * *' },
  ScheduleModule: { forRoot: () => ({ module: class {} }) },
}));

import { OrderExpiryJob } from './order-expiry.job.js';

describe('OrderExpiryJob (Unit Test - TDD)', () => {
  let job: OrderExpiryJob;
  let prismaMock: any;
  let txMock: any;
  let ordersRepoMock: any;
  let inventoryServiceMock: any;
  let promotionsServiceMock: any;

  beforeEach(() => {
    txMock = {
      payment: { findFirst: vi.fn().mockResolvedValue(null) },
      inventoryReservation: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([{ id: 'res-1' }, { id: 'res-2' }]),
      },
    };

    prismaMock = {
      order: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'ord-expired-1', userId: 'user-1' },
        ]),
      },
      $transaction: vi.fn(async (cb: any) => cb(txMock)),
    };

    ordersRepoMock = {
      lockById: vi.fn().mockResolvedValue({ status: OrderStatus.PENDING, reservationExpiresAt: new Date(0) }),
      updateStatusWithHistory: vi.fn().mockResolvedValue(undefined),
    };

    inventoryServiceMock = {
      releaseInTransaction: vi.fn().mockResolvedValue({ status: 'EXPIRED' }),
    };

    promotionsServiceMock = {
      releaseByOrderId: vi.fn().mockResolvedValue(1),
    };

    job = new OrderExpiryJob(
      prismaMock,
      ordersRepoMock,
      inventoryServiceMock,
      promotionsServiceMock,
    );
  });

  it('cancels expired PENDING orders, expires active inventory reservations, and expires RESERVED coupon redemptions in the same transaction', async () => {
    await job.handleExpiredOrders();

    expect(ordersRepoMock.updateStatusWithHistory).toHaveBeenCalledWith(
      'ord-expired-1',
      OrderStatus.PENDING,
      OrderStatus.CANCELLED,
      'user-1',
      expect.stringContaining('ord-expired-1'),
      txMock,
    );
    expect(inventoryServiceMock.releaseInTransaction).toHaveBeenCalledTimes(2);
    expect(inventoryServiceMock.releaseInTransaction).toHaveBeenCalledWith(
      txMock,
      'res-1',
      true,
    );
    expect(inventoryServiceMock.releaseInTransaction).toHaveBeenCalledWith(
      txMock,
      'res-2',
      true,
    );
    expect(promotionsServiceMock.releaseByOrderId).toHaveBeenCalledWith(
      'ord-expired-1',
      'EXPIRED',
      expect.any(Date),
      txMock,
    );
  });

  it('ignores ConflictException when another worker already processed the order', async () => {
    ordersRepoMock.updateStatusWithHistory.mockRejectedValueOnce(
      new ConflictException('Already updated'),
    );

    await expect(job.handleExpiredOrders()).resolves.toBeUndefined();
    expect(inventoryServiceMock.releaseInTransaction).not.toHaveBeenCalled();
    expect(promotionsServiceMock.releaseByOrderId).not.toHaveBeenCalled();
  });
  it('scans PAYMENT_FAILED as well as PENDING and uses the locked status', async () => {
    ordersRepoMock.lockById.mockResolvedValue({ status: OrderStatus.PAYMENT_FAILED, reservationExpiresAt: new Date(0) });
    await job.handleExpiredOrders();
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] }, reservationExpiresAt: { lte: expect.any(Date) } },
    }));
    expect(ordersRepoMock.updateStatusWithHistory).toHaveBeenCalledWith(
      'ord-expired-1', OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED, 'user-1', expect.any(String), txMock,
    );
  });

  it('keeps inventory and coupon reserved while an admitted payment is PROCESSING', async () => {
    txMock.payment.findFirst.mockResolvedValue({ id: 'in-flight' });
    await job.handleExpiredOrders();
    expect(ordersRepoMock.updateStatusWithHistory).not.toHaveBeenCalled();
    expect(inventoryServiceMock.releaseInTransaction).not.toHaveBeenCalled();
    expect(promotionsServiceMock.releaseByOrderId).not.toHaveBeenCalled();
  });

});

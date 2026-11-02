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
      inventoryReservation: {
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
});

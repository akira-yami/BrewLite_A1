import { ConflictException, Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryExpiryJob } from './inventory-expiry.job.js';

function setup() {
  const prisma = {
    inventoryReservation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const inventoryService = {
    release: vi.fn().mockResolvedValue(undefined),
  };

  return {
    job: new InventoryExpiryJob(prisma as any, inventoryService as any),
    prisma,
    inventoryService,
  };
}

describe('InventoryExpiryJob', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('queries at most 100 ACTIVE reservations whose expiry time has passed', async () => {
    const { job, prisma } = setup();

    await job.handleExpiredReservations();

    expect(prisma.inventoryReservation.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: expect.any(Date) },
      },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: 100,
    });
  });

  it('releases every expired reservation and restores inventory through InventoryService', async () => {
    const { job, prisma, inventoryService } = setup();
    prisma.inventoryReservation.findMany.mockResolvedValue([
      { id: 'reservation-1' },
      { id: 'reservation-2' },
    ]);

    await job.handleExpiredReservations();

    expect(inventoryService.release).toHaveBeenNthCalledWith(
      1,
      'reservation-1',
      true,
    );
    expect(inventoryService.release).toHaveBeenNthCalledWith(
      2,
      'reservation-2',
      true,
    );
  });

  it('does not overlap two scans in the same process', async () => {
    const { job, prisma } = setup();
    let finishScan!: (reservations: never[]) => void;
    const pendingScan = new Promise<never[]>((resolve) => {
      finishScan = resolve;
    });
    prisma.inventoryReservation.findMany.mockReturnValue(pendingScan);

    const firstRun = job.handleExpiredReservations();
    await job.handleExpiredReservations();

    expect(prisma.inventoryReservation.findMany).toHaveBeenCalledTimes(1);

    finishScan([]);
    await firstRun;
  });

  it('skips a reservation already released by another concurrent operation and continues', async () => {
    const { job, prisma, inventoryService } = setup();
    prisma.inventoryReservation.findMany.mockResolvedValue([
      { id: 'reservation-conflict' },
      { id: 'reservation-next' },
    ]);
    inventoryService.release
      .mockRejectedValueOnce(new ConflictException('already released'))
      .mockResolvedValueOnce(undefined);

    await expect(job.handleExpiredReservations()).resolves.toBeUndefined();

    expect(inventoryService.release).toHaveBeenNthCalledWith(
      1,
      'reservation-conflict',
      true,
    );
    expect(inventoryService.release).toHaveBeenNthCalledWith(
      2,
      'reservation-next',
      true,
    );
  });

  it('logs a non-conflict release error and continues processing later reservations', async () => {
    const logger = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { job, prisma, inventoryService } = setup();
    prisma.inventoryReservation.findMany.mockResolvedValue([
      { id: 'reservation-error' },
      { id: 'reservation-next' },
    ]);
    inventoryService.release
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(job.handleExpiredReservations()).resolves.toBeUndefined();

    expect(logger).toHaveBeenCalledWith(
      'Failed to expire reservation reservation-error',
      expect.any(String),
    );
    expect(inventoryService.release).toHaveBeenCalledTimes(2);
  });

  it('logs a scan failure and resets the running guard so a later scan can execute', async () => {
    const logger = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { job, prisma } = setup();
    prisma.inventoryReservation.findMany
      .mockRejectedValueOnce(new Error('query failed'))
      .mockResolvedValueOnce([]);

    await expect(job.handleExpiredReservations()).resolves.toBeUndefined();
    await expect(job.handleExpiredReservations()).resolves.toBeUndefined();

    expect(logger).toHaveBeenCalledWith(
      'Failed to query expired reservations',
      expect.any(String),
    );
    expect(prisma.inventoryReservation.findMany).toHaveBeenCalledTimes(2);
  });

  it('does not call the release service when the scan returns no reservations', async () => {
    const { job, inventoryService } = setup();

    await job.handleExpiredReservations();

    expect(inventoryService.release).not.toHaveBeenCalled();
  });
});

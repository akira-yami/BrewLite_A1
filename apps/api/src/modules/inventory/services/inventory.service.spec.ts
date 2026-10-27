
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { InventoryRepository } from '../repositories/inventory.repository.js';
import { InventoryService } from './inventory.service.js';


describe('InventoryService - reserve', () => {
  let service: InventoryService;

  const prisma = {
    $transaction: vi.fn(),
  };

  const repository = {
    findVariant: vi.fn(),
    reserveStock: vi.fn(),
    createReservation: vi.fn(),
    findReservation: vi.fn(),
transitionActiveReservation: vi.fn(),
restoreStock: vi.fn(),
  };

  // reserve() nhận transaction từ bên ngoài,
  // nên test này chỉ cần một đối tượng giả làm transaction.
  const tx = {} as Prisma.TransactionClient;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new InventoryService(
      prisma as unknown as PrismaService,
      repository as unknown as InventoryRepository,
    );
    prisma.$transaction.mockImplementation(
  async (callback) => callback(tx),
);

repository.findReservation.mockResolvedValue({
  id: 'reservation-1',
  orderId: 'order-1',
  productVariantId: 'variant-1',
  quantity: 2,
  status: 'ACTIVE',
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
});

repository.transitionActiveReservation.mockResolvedValue({ count: 1 });
repository.restoreStock.mockResolvedValue({});

    repository.findVariant.mockResolvedValue({
      id: 'variant-1',
      stock: 5,
      version: 0,
      isActive: true,
    });

    repository.reserveStock.mockResolvedValue({ count: 1 });

    repository.createReservation.mockResolvedValue({
      id: 'reservation-1',
      orderId: 'order-1',
      productVariantId: 'variant-1',
      quantity: 2,
      status: 'ACTIVE',
    });
  });

  it('giữ hàng thành công khi tồn kho đủ', async () => {
    const result = await service.reserve(
      tx,
      'order-1',
      [{ productVariantId: 'variant-1', quantity: 2 }],
      new Date(Date.now() + 15 * 60 * 1000),
    );

    expect(repository.reserveStock).toHaveBeenCalledWith(
      tx,
      'variant-1',
      0,
      2,
    );

    expect(repository.createReservation).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('reservation-1');
  });

  it('từ chối khi tồn kho không đủ', async () => {
    repository.findVariant.mockResolvedValue({
      id: 'variant-1',
      stock: 1,
      version: 0,
      isActive: true,
    });

    await expect(
      service.reserve(
        tx,
        'order-1',
        [{ productVariantId: 'variant-1', quantity: 2 }],
        new Date(Date.now() + 15 * 60 * 1000),
      ),
    ).rejects.toThrow(ConflictException);

    expect(repository.reserveStock).not.toHaveBeenCalled();
    expect(repository.createReservation).not.toHaveBeenCalled();
  });
  
it('consume chỉ chuyển trạng thái, không trừ kho lần nữa', async () => {
  const result = await service.consume('reservation-1');

  expect(repository.transitionActiveReservation).toHaveBeenCalledWith(
    tx,
    'reservation-1',
    'CONSUMED',
    'NOT_EXPIRED',
  );

  expect(repository.restoreStock).not.toHaveBeenCalled();
  expect(result.status).toBe('CONSUMED');
});

it('release không cộng kho nếu reservation đã bị xử lý trước', async () => {
  repository.transitionActiveReservation.mockResolvedValue({ count: 0 });

  await expect(
    service.release('reservation-1'),
  ).rejects.toThrow(ConflictException);

  expect(repository.restoreStock).not.toHaveBeenCalled();
});


  it('từ chối khi version thay đổi do yêu cầu khác cập nhật trước', async () => {
    // updateMany trả count = 0 nghĩa là không cập nhật được
    // với version mà yêu cầu này đã đọc.
    repository.reserveStock.mockResolvedValue({ count: 0 });

    await expect(
      service.reserve(
        tx,
        'order-1',
        [{ productVariantId: 'variant-1', quantity: 2 }],
        new Date(Date.now() + 15 * 60 * 1000),
      ),
    ).rejects.toThrow(ConflictException);

    expect(repository.createReservation).not.toHaveBeenCalled();
  });
});

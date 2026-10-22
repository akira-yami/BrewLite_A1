import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersRepository } from '../repositories/orders.repository.js';
import { OrdersService } from './orders.service.js';
import { OrderStatus } from '../../../generated/prisma/client.js';

describe('OrdersService- Cổng thanh toán (Unit Test - TDD)', () => {
  let service: OrdersService;

  // Bổ sung mock cho các hàm mới của Payment
  const repository = {
    findActiveVariantById: vi.fn(),
    findByIdAndUserId: vi.fn(),
    updateStatusWithHistory: vi.fn(),
    markAsPaid: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new OrdersService(
      repository as unknown as OrdersRepository,
    );

    repository.findActiveVariantById.mockResolvedValue({
      id: 'variant-1',
      size: 'M',
      price: 35000n,
      stock: 10,
      product: {
        name: 'Cà phê sữa',
        productToppings: [
          {
            topping: {
              id: 'topping-1',
              name: 'Trân châu',
              price: 8000n,
              isActive: true,
            },
          },
        ],
      },
    });
  });

  // ==========================================
  // CÁC BÀI TEST CŨ CỦA VALIDATE & PRICE ITEMS
  // ==========================================
  describe('validateAndPriceItems', () => {
    it('tính đúng giá size và topping', async () => {
      const result = await service.validateAndPriceItems([
        {
          productVariantId: 'variant-1',
          quantity: 2,
          toppingIds: ['topping-1'],
        },
      ]);

      expect(result.subtotal).toBe(86000n);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].unitPrice).toBe(35000n);
    });

    it('từ chối topping không thuộc sản phẩm', async () => {
      await expect(
        service.validateAndPriceItems([
          {
            productVariantId: 'variant-1',
            quantity: 1,
            toppingIds: ['topping-khong-hop-le'],
          },
        ]),
      ).rejects.toThrow(BadRequestException);
    });
    
    it('từ chối size không tồn tại hoặc không hoạt động', async () => {
      repository.findActiveVariantById.mockResolvedValue(null);

      await expect(
        service.validateAndPriceItems([
          {
            productVariantId: 'variant-khong-hop-le',
            quantity: 1,
          },
        ]),
      ).rejects.toThrow(NotFoundException);
    });

    it('từ chối topping đã ngừng hoạt động', async () => {
      repository.findActiveVariantById.mockResolvedValue({
        id: 'variant-1',
        size: 'M',
        price: 35000n,
        stock: 10,
        product: {
          name: 'Cà phê sữa',
          productToppings: [
            {
              topping: {
                id: 'topping-1',
                name: 'Trân châu',
                price: 8000n,
                isActive: false,
              },
            },
          ],
        },
      });

      await expect(
        service.validateAndPriceItems([
          {
            productVariantId: 'variant-1',
            quantity: 1,
            toppingIds: ['topping-1'],
          },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối khi tổng số lượng cùng size vượt tồn kho', async () => {
      await expect(
        service.validateAndPriceItems([
          {
            productVariantId: 'variant-1',
            quantity: 6,
          },
          {
            productVariantId: 'variant-1',
            quantity: 5,
          },
        ]),
      ).rejects.toThrow(ConflictException);
    });

    it('từ chối khi số lượng vượt tồn kho', async () => {
      await expect(
        service.validateAndPriceItems([
          {
            productVariantId: 'variant-1',
            quantity: 11,
          },
        ]),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ==========================================
  // CÁC BÀI TEST MỚI CHO GIAO TIẾP THANH TOÁN
  // ==========================================
  describe('Cổng giao tiếp thanh toán (Payment Transitions)', () => {
    const mockOrder = { id: 'o-1', userId: 'u-1', status: OrderStatus.PENDING, total: 100000n };
    const txMock = {} as any;

    it('getOrderForPayment - ném NotFoundException nếu không tìm thấy đơn hoặc sai userId', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);
      await expect(service.getOrderForPayment('o-1', 'u-1')).rejects.toThrow(NotFoundException);
    });

    it('getOrderForPayment - trả về order nếu hợp lệ', async () => {
      repository.findByIdAndUserId.mockResolvedValue(mockOrder);
      const result = await service.getOrderForPayment('o-1', 'u-1');
      expect(result).toEqual(mockOrder);
    });

    it('transitionForPaymentRetry - gọi updateStatusWithHistory chuyển từ PAYMENT_FAILED sang PENDING', async () => {
      await service.transitionForPaymentRetry('o-1', 'u-1', 'Thử lại thanh toán');
      expect(repository.updateStatusWithHistory).toHaveBeenCalledWith(
        'o-1',
        OrderStatus.PAYMENT_FAILED,
        OrderStatus.PENDING,
        'u-1',
        'Thử lại thanh toán'
      );
    });

    it('markOrderPaid - gọi markAsPaid chuyển từ PENDING sang PAID', async () => {
      await service.markOrderPaid('o-1', 'u-1', 100000n, txMock);
      expect(repository.markAsPaid).toHaveBeenCalledWith(
        'o-1',
        OrderStatus.PENDING,
        'u-1',
        100000n,
        txMock
      );
    });

    it('markOrderPaymentFailed - gọi updateStatusWithHistory chuyển từ PENDING sang PAYMENT_FAILED', async () => {
      await service.markOrderPaymentFailed('o-1', 'u-1', 'Lỗi thanh toán Gateway', txMock);
      expect(repository.updateStatusWithHistory).toHaveBeenCalledWith(
        'o-1',
        OrderStatus.PENDING,
        OrderStatus.PAYMENT_FAILED,
        'u-1',
        'Lỗi thanh toán Gateway',
        txMock
      );
    });
  });
});
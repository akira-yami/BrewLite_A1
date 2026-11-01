
import { CatalogService } from '../../catalog/services/catalog.service.js';
import { UsersService } from '../../users/users.service.js';

// Sử dụng InventoryService mới
import { InventoryService } from '../../inventory/services/inventory.service.js';
import { InventoryRepository } from '../../inventory/repositories/inventory.repository.js';

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrdersRepository } from '../repositories/orders.repository.js';
import { OrdersService } from './orders.service.js';

import { OrderStatus } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { PromotionsService } from '../../promotions/services/promotions.service.js';

describe('OrdersService- Cổng thanh toán (Unit Test - TDD)', () => {
  let service: OrdersService;
  let prismaMock: any;
  let txMock: any;
  let promotionsServiceMock: any;
  let inventoryRepositoryMock: any;

  // Mock OrdersRepository
  const repository = {
    findActiveVariantById: vi.fn(),
    findByIdAndUserId: vi.fn(),
    findByIdAndUserIdForUpdate: vi.fn(),
    updateStatusWithHistory: vi.fn(),
    markAsPaid: vi.fn(),
    findOrdersByUserId: vi.fn(),
    findOrderDetail: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock transaction client
    txMock = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: 'u-1' }),
      },

      order: {
        create: vi.fn(),
      },

      productVariant: {
        updateMany: vi.fn(),
      },

      inventoryReservation: {
        create: vi.fn(),
        findMany: vi.fn(),
      },

      payment: {
        findFirst: vi.fn(),
      },

      orderStatusHistory: {
        create: vi.fn(),
      },
    };

    // Mock PrismaService
    prismaMock = {
      productVariant: txMock.productVariant,

      $transaction: vi.fn(async (cb: any) => cb(txMock)),
    };

    // Mock PromotionsService
    promotionsServiceMock = {
      quoteAndLock: vi.fn(),
      reserve: vi.fn(),
      // Mô phỏng cổng quyết toán coupon được OrdersService gọi khi Order chuyển sang PAID.
      consumeRedemption: vi.fn(),
    };

    // Mock InventoryRepository
    // Các hàm này chuyển tiếp thao tác sang txMock
    // để giữ nguyên các assertion của test hiện tại.
    inventoryRepositoryMock = {
      findVariant: vi.fn(),

      reserveStock: vi.fn(
        (
          tx: any,
          variantId: string,
          expectedVersion: number,
          quantity: number,
        ) =>
          tx.productVariant.updateMany({
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
          }),
      ),

      createReservation: vi.fn(
        (
          tx: any,
          orderId: string,
          variantId: string,
          quantity: number,
          expiresAt: Date,
        ) =>
          tx.inventoryReservation.create({
            data: {
              orderId,
              productVariantId: variantId,
              quantity,
              status: 'ACTIVE',
              expiresAt,
            },
          }),
      ),

      findReservation: vi.fn(),
      transitionActiveReservation: vi.fn(),
      restoreStock: vi.fn(),
    };

    // CatalogService vẫn được sử dụng để kiểm tra và tính giá sản phẩm.
    const catalog = new CatalogService({} as any);

    txMock.productVariant.findFirst = repository.findActiveVariantById;

    // Khởi tạo InventoryService mới với PrismaService và InventoryRepository.
    const inventoryService = new InventoryService(
      prismaMock as unknown as PrismaService,
      inventoryRepositoryMock as unknown as InventoryRepository,
    );

    // Khởi tạo OrdersService
    service = new OrdersService(
      repository as unknown as OrdersRepository,
      prismaMock as unknown as PrismaService,
      promotionsServiceMock as unknown as PromotionsService,
      catalog,
      inventoryService,
      new UsersService(),
    );

    // Dữ liệu sản phẩm mặc định cho các bài test
    repository.findActiveVariantById.mockResolvedValue({
      id: 'variant-1',
      version: 0,
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
      ).rejects.toThrow(BadRequestException);
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
    const mockOrder = {
      id: 'o-1',
      userId: 'u-1',
      status: OrderStatus.PENDING,
      total: 100000n,
    };

    const txMock = {} as any;

    it('getOrderForPayment - ném NotFoundException nếu không tìm thấy đơn hoặc sai userId', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.getOrderForPayment('o-1', 'u-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('getOrderForPayment - trả về order nếu hợp lệ', async () => {
      repository.findByIdAndUserId.mockResolvedValue(mockOrder);

      const result = await service.getOrderForPayment('o-1', 'u-1');

      expect(result).toEqual(mockOrder);
    });

    it('getOrderForPaymentForUpdate - khóa Order trong transaction và trả về đúng chủ đơn', async () => {
      repository.findByIdAndUserIdForUpdate.mockResolvedValue(mockOrder);

      const result = await service.getOrderForPaymentForUpdate(
        'o-1',
        'u-1',
        txMock,
      );

      expect(repository.findByIdAndUserIdForUpdate).toHaveBeenCalledWith(
        'o-1',
        'u-1',
        txMock,
      );
      expect(result).toEqual(mockOrder);
    });

    it('transitionForPaymentRetry - gọi updateStatusWithHistory chuyển từ PAYMENT_FAILED sang PENDING', async () => {
      await service.transitionForPaymentRetry(
        'o-1',
        'u-1',
        'Thử lại thanh toán',
      );

      expect(repository.updateStatusWithHistory).toHaveBeenCalledWith(
        'o-1',
        OrderStatus.PAYMENT_FAILED,
        OrderStatus.PENDING,
        'u-1',
        'Thử lại thanh toán',
      );
    });

    it('transitionForPaymentRetry - truyền transaction khi được cung cấp', async () => {
      await service.transitionForPaymentRetry(
        'o-1',
        'u-1',
        'Retry trong transaction',
        txMock,
      );

      expect(repository.updateStatusWithHistory).toHaveBeenCalledWith(
        'o-1',
        OrderStatus.PAYMENT_FAILED,
        OrderStatus.PENDING,
        'u-1',
        'Retry trong transaction',
        txMock,
      );
    });

    it('markOrderPaid - gọi markAsPaid chuyển từ PENDING sang PAID', async () => {
      await service.markOrderPaid('o-1', 'u-1', 100000n, txMock);

      expect(repository.markAsPaid).toHaveBeenCalledWith(
        'o-1',
        OrderStatus.PENDING,
        'u-1',
        100000n,
        txMock,
      );
      expect(promotionsServiceMock.consumeRedemption).toHaveBeenCalledWith(
        txMock,
        'o-1',
      );
      // Mỗi luồng thanh toán thành công chỉ consume coupon đúng một lần trong cùng transaction.
      expect(promotionsServiceMock.consumeRedemption).toHaveBeenCalledTimes(1);
    });

    it('cancelOrder - khóa Order, đổi CANCELLED, release coupon và hoàn kho trong cùng transaction', async () => {
      // Giả lập Order còn hạn, không có Payment PROCESSING và có một reservation ACTIVE.
      const reservationExpiry = new Date(Date.now() + 60_000);
      repository.findByIdAndUserIdForUpdate.mockResolvedValue({
        id: 'o-1',
        userId: 'u-1',
        status: OrderStatus.PENDING,
        reservationExpiresAt: reservationExpiry,
      });
      txMock.payment.findFirst.mockResolvedValue(null);
      txMock.inventoryReservation.findMany.mockResolvedValue([
        { id: 'r-1', expiresAt: reservationExpiry },
      ]);
      inventoryRepositoryMock.findReservation.mockResolvedValue({
        id: 'r-1',
        orderId: 'o-1',
        productVariantId: 'variant-1',
        quantity: 2,
        status: 'ACTIVE',
        expiresAt: reservationExpiry,
      });
      inventoryRepositoryMock.transitionActiveReservation.mockResolvedValue({ count: 1 });
      inventoryRepositoryMock.restoreStock.mockResolvedValue({ stock: 10, version: 1 });

      await service.cancelOrder('o-1', 'u-1', 'Khách hàng hủy đơn', false, txMock);

      // Xác nhận cùng transaction khóa Order, cập nhật history, release coupon và inventory.
      expect(repository.findByIdAndUserIdForUpdate).toHaveBeenCalledWith(
        'o-1',
        'u-1',
        txMock,
      );
      expect(repository.updateStatusWithHistory).toHaveBeenCalledWith(
        'o-1',
        OrderStatus.PENDING,
        OrderStatus.CANCELLED,
        'u-1',
        'Khách hàng hủy đơn',
        txMock,
      );
      expect(promotionsServiceMock.releaseRedemption).toHaveBeenCalledWith(
        txMock,
        'o-1',
        false,
      );
      expect(inventoryRepositoryMock.transitionActiveReservation).toHaveBeenCalledWith(
        txMock,
        'r-1',
        'RELEASED',
        'NOT_EXPIRED',
      );
      expect(inventoryRepositoryMock.restoreStock).toHaveBeenCalledWith(
        txMock,
        'variant-1',
        2,
      );
    });

    it('cancelOrder - không hủy Order khi Payment vẫn PROCESSING', async () => {
      repository.findByIdAndUserIdForUpdate.mockResolvedValue({
        id: 'o-1',
        userId: 'u-1',
        status: OrderStatus.PENDING,
        reservationExpiresAt: new Date(Date.now() + 60_000),
      });
      txMock.payment.findFirst.mockResolvedValue({ id: 'payment-1' });

      await expect(
        service.cancelOrder('o-1', 'u-1', 'Khách hàng hủy đơn', false, txMock),
      ).rejects.toThrow(ConflictException);

      expect(repository.updateStatusWithHistory).not.toHaveBeenCalled();
      expect(promotionsServiceMock.releaseRedemption).not.toHaveBeenCalled();
      expect(inventoryRepositoryMock.restoreStock).not.toHaveBeenCalled();
    });

    it('markOrderPaymentFailed - gọi updateStatusWithHistory chuyển từ PENDING sang PAYMENT_FAILED', async () => {
      await service.markOrderPaymentFailed(
        'o-1',
        'u-1',
        'Lỗi thanh toán Gateway',
        txMock,
      );

      expect(repository.updateStatusWithHistory).toHaveBeenCalledWith(
        'o-1',
        OrderStatus.PENDING,
        OrderStatus.PAYMENT_FAILED,
        'u-1',
        'Lỗi thanh toán Gateway',
        txMock,
      );
    });
  });

  // ==========================================
  // CÁC BÀI TEST TẠO ĐƠN HÀNG (UC-06)
  // ==========================================
  describe('createOrder (UC-06)', () => {
    const mockDto = {
      items: [
        {
          productVariantId: 'variant-1',
          quantity: 2,
          toppingIds: ['topping-1'],
          sugarLevel: 100,
          iceLevel: 50,
          note: 'Ít ngọt',
        },
      ],
    };

    const mockOrderDb = {
      id: 'order-uuid-1',
      orderNumber: 'ORD-12345',
      status: OrderStatus.PENDING,
      subtotal: 86000n,
      discountAmount: 0n,
      total: 86000n,
      couponCodeSnapshot: null,
      reservationExpiresAt: new Date(),
      createdAt: new Date(),
      items: [
        {
          id: 'item-1',
          productNameSnapshot: 'Cà phê sữa',
          variantNameSnapshot: 'M',
          unitPrice: 35000n,
          quantity: 2,
          sugarLevel: 100,
          iceLevel: 50,
          note: 'Ít ngọt',
          orderItemToppings: [
            {
              id: 'item-top-1',
              toppingNameSnapshot: 'Trân châu',
              unitPrice: 8000n,
              quantity: 1,
            },
          ],
        },
      ],
    };

    it('tạo đơn hàng thành công không có coupon: trừ tồn kho, tạo reservation, ghi history và trả về đúng DTO', async () => {
      txMock.order.create.mockResolvedValue(mockOrderDb);
      txMock.productVariant.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.createOrder('u-1', mockDto as any);

      expect(txMock.order.create).toHaveBeenCalled();

      expect(txMock.productVariant.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'variant-1',
          version: 0,
          stock: { gte: 2 },
          isActive: true,
        },
        data: {
          stock: { decrement: 2 },
          version: { increment: 1 },
        },
      });

      expect(txMock.inventoryReservation.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-uuid-1',
          productVariantId: 'variant-1',
          quantity: 2,
          status: 'ACTIVE',
          expiresAt: expect.any(Date),
        },
      });

      expect(txMock.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-uuid-1',
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedByUserId: 'u-1',
          reason: 'Khách hàng tạo đơn hàng',
        },
      });

      expect(result.id).toBe('order-uuid-1');
      expect(result.status).toBe('PENDING');
      expect(result.subtotal).toBe(86000);
      expect(result.total).toBe(86000);
      expect(result.discountAmount).toBe(0);
      expect(result.items).toHaveLength(1);
    });

    it('tạo đơn hàng thành công có coupon: gọi quoteAndLock và reserve', async () => {
      const dtoWithCoupon = {
        ...mockDto,
        couponCode: 'SALE10',
      };

      const mockOrderWithCoupon = {
        ...mockOrderDb,
        discountAmount: 10000n,
        total: 76000n,
        couponCodeSnapshot: 'SALE10',
      };

      txMock.order.create.mockResolvedValue(mockOrderWithCoupon);
      txMock.productVariant.updateMany.mockResolvedValue({ count: 1 });

      promotionsServiceMock.quoteAndLock.mockResolvedValue({
        couponId: 'c-1',
        discountAmount: 10000n,
      });

      const result = await service.createOrder('u-1', dtoWithCoupon as any);

      expect(promotionsServiceMock.quoteAndLock).toHaveBeenCalledWith(
        txMock,
        'u-1',
        'SALE10',
        86000n,
        expect.any(Date),
      );

      expect(promotionsServiceMock.reserve).toHaveBeenCalledWith(
        txMock,
        expect.objectContaining({ couponId: 'c-1' }),
        'order-uuid-1',
        expect.any(Date),
      );

      expect(result.discountAmount).toBe(10000);
      expect(result.total).toBe(76000);
    });

    it('ném ConflictException nếu updateMany stock trả về count = 0 (hết hàng trong transaction)', async () => {
      txMock.order.create.mockResolvedValue(mockOrderDb);
      txMock.productVariant.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.createOrder('u-1', mockDto as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ==========================================
  // CÁC BÀI TEST LẤY LỊCH SỬ ĐƠN HÀNG (GET /orders/me)
  // ==========================================
  describe('getMyOrders', () => {
    it('lấy danh sách đơn hàng của user, sắp xếp mới nhất và map đúng DTO', async () => {
      const mockDbOrders = [
        {
          id: 'order-1',
          orderNumber: 'ORD-001',
          userId: 'u-1',
          status: OrderStatus.PENDING,
          subtotal: 50000n,
          discountAmount: 0n,
          total: 50000n,
          couponCodeSnapshot: null,
          reservationExpiresAt: new Date('2026-10-23T10:15:00Z'),
          createdAt: new Date('2026-10-23T10:00:00Z'),
          items: [
            {
              id: 'item-1',
              productNameSnapshot: 'Trà sen',
              variantNameSnapshot: 'L',
              unitPrice: 40000n,
              quantity: 1,
              sugarLevel: 100,
              iceLevel: 100,
              note: null,
              orderItemToppings: [
                {
                  id: 'top-1',
                  toppingNameSnapshot: 'Hạt sen',
                  unitPrice: 10000n,
                  quantity: 1,
                },
              ],
            },
          ],
        },
      ];

      repository.findOrdersByUserId.mockResolvedValue(mockDbOrders);

      const result = await service.getMyOrders('u-1');

      expect(repository.findOrdersByUserId).toHaveBeenCalledWith('u-1');
      expect(result).toHaveLength(1);

      expect(result[0]).toEqual({
        id: 'order-1',
        orderNumber: 'ORD-001',
        status: OrderStatus.PENDING,
        items: [
          {
            id: 'item-1',
            productName: 'Trà sen',
            size: 'L',
            unitPrice: 40000,
            quantity: 1,
            sugarLevel: 100,
            iceLevel: 100,
            note: null,
            toppings: [
              {
                name: 'Hạt sen',
                unitPrice: 10000,
                quantity: 1,
              },
            ],
            lineTotal: 50000,
          },
        ],
        subtotal: 50000,
        discountAmount: 0,
        total: 50000,
        currency: 'VND',
        reservationExpiresAt: '2026-10-23T10:15:00.000Z',
        createdAt: '2026-10-23T10:00:00.000Z',
      });
    });

    it('trả về mảng rỗng nếu user chưa có đơn hàng nào', async () => {
      repository.findOrdersByUserId.mockResolvedValue([]);

      const result = await service.getMyOrders('u-new');

      expect(repository.findOrdersByUserId).toHaveBeenCalledWith('u-new');
      expect(result).toEqual([]);
    });
  });

  // ==========================================
  // CÁC BÀI TEST CHI TIẾT ĐƠN HÀNG (GET /orders/:id)
  // ==========================================
  describe('getOrderDetail', () => {
    it('trả về 404 NotFoundException nếu đơn hàng không tồn tại hoặc không phải chủ đơn', async () => {
      repository.findOrderDetail.mockResolvedValue(null);

      await expect(
        service.getOrderDetail('o-khong-ton-tai', 'u-1'),
      ).rejects.toThrow(NotFoundException);

      expect(repository.findOrderDetail).toHaveBeenCalledWith(
        'o-khong-ton-tai',
        'u-1',
      );
    });

    it('trả về chi tiết đơn hàng đầy đủ kèm payment summary và timeline đúng thứ tự', async () => {
      const mockDetailDb = {
        id: 'order-1',
        orderNumber: 'ORD-001',
        userId: 'u-1',
        status: OrderStatus.PAID,
        subtotal: 50000n,
        discountAmount: 5000n,
        total: 45000n,
        couponCodeSnapshot: 'DISC5',
        reservationExpiresAt: new Date('2026-10-23T10:15:00Z'),
        createdAt: new Date('2026-10-23T10:00:00Z'),

        items: [
          {
            id: 'item-1',
            productNameSnapshot: 'Cà phê đen',
            variantNameSnapshot: 'M',
            unitPrice: 30000n,
            quantity: 1,
            sugarLevel: 100,
            iceLevel: 100,
            note: null,
            orderItemToppings: [],
          },
        ],

        payments: [
          {
            id: 'pay-1',
            method: 'CASH',
            status: 'SUCCEEDED',
            amount: 45000n,
            gatewayTransactionId: 'gw-123',
            processedAt: new Date('2026-10-23T10:05:00Z'),
            createdAt: new Date('2026-10-23T10:02:00Z'),
          },
        ],

        statusHistories: [
          {
            id: 'hist-1',
            fromStatus: null,
            toStatus: OrderStatus.PENDING,
            reason: 'Khởi tạo',
            createdAt: new Date('2026-10-23T10:00:00Z'),
          },
          {
            id: 'hist-2',
            fromStatus: OrderStatus.PENDING,
            toStatus: OrderStatus.PAID,
            reason: 'Thanh toán thành công',
            createdAt: new Date('2026-10-23T10:05:00Z'),
          },
        ],
      };

      repository.findOrderDetail.mockResolvedValue(mockDetailDb);

      const result = await service.getOrderDetail('order-1', 'u-1');

      expect(repository.findOrderDetail).toHaveBeenCalledWith('order-1', 'u-1');
      expect(result.id).toBe('order-1');

      expect(result.paymentSummary).toEqual({
        id: 'pay-1',
        method: 'CASH',
        status: 'SUCCEEDED',
        amount: 45000,
        gatewayTransactionId: 'gw-123',
        processedAt: '2026-10-23T10:05:00.000Z',
        createdAt: '2026-10-23T10:02:00.000Z',
      });

      expect(result.timeline).toHaveLength(2);
      expect(result.timeline[0].toStatus).toBe(OrderStatus.PENDING);
      expect(result.timeline[1].toStatus).toBe(OrderStatus.PAID);
    });
  });
});

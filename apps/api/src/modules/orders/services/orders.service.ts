import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { orderMoney } from '../../../common/utils/order-money.js';
import {
  maxServings,
  type RecipeLine,
} from '../../../common/utils/recipe-capacity.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { OrderStatus, Prisma } from '../../../generated/prisma/client.js';
import { CatalogService } from '../../catalog/services/catalog.service.js';
import {
  InventoryService,
  InventoryVersionConflict,
  type InventoryNeeds,
} from '../../inventory/services/inventory.service.js';
import { PromotionsService } from '../../promotions/services/promotions.service.js';
import { UsersService } from '../../users/users.service.js';
import type {
  CreateOrderResponseDto,
  OrderResponseDto,
} from '../dto/create-order-response.dto.js';
import { CreateOrderDto, CreateOrderItemDto } from '../dto/create-order.dto.js';
import type {
  OrderDetailResponseDto,
  PaymentSummaryDto,
  StatusTimelineDto,
} from '../dto/order-detail-response.dto.js';
import type { OrderHistoryQueryDto } from '../dto/order-history-query.dto.js';
import { toOrderItemResponse } from '../mappers/order-item.mapper.js';
import { OrdersRepository } from '../repositories/orders.repository.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly prisma: PrismaService,
    private readonly promotionsService: PromotionsService,
    private readonly catalog: CatalogService,
    private readonly inventory: InventoryService,
    private readonly users: UsersService,
  ) {}

  // =====================================================================
  // 1. NGHIỆP VỤ XỬ LÝ ĐƠN HÀNG (UC-06: TẠO ĐƠN HÀNG & GIỮ TỒN KHO)
  // =====================================================================
  async createOrder(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<CreateOrderResponseDto> {
    const normalizedItems = this.normalizeItems(dto.items);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await this.users.assertActiveCustomer(tx, userId);
            const now = new Date();
            const reservationExpiresAt = new Date(
              now.getTime() + 15 * 60 * 1000,
            );
            const orderNumber = `ORD-${randomUUID().replaceAll('-', '').slice(0, 24)}`;
            const {
              items: preparedItems,
              subtotal,
              needs,
            } = await this.validateAndPriceItems(normalizedItems, tx);
            // 3.1. Thẩm định và khóa Coupon (nếu khách hàng có áp dụng mã)
            let discountAmount = 0n;
            let couponQuote = null;

            if (dto.couponCode) {
              // Khóa hàng coupon trong DB, kiểm tra hạn dùng, lượt dùng và tính tiền giảm
              couponQuote = await this.promotionsService.quoteAndLock(
                tx,
                userId,
                dto.couponCode,
                subtotal,
                now,
              );
              discountAmount = couponQuote.discountAmount;
            }

            // 3.2. Tính tổng tiền thanh toán sau khi trừ giảm giá
            const total = subtotal - discountAmount;
            // Fail before writing, including component and line prices.
            [subtotal, discountAmount, total].forEach(orderMoney);

            // 3.3. Tạo bản ghi Order cùng OrderItems & OrderItemToppings
            // Lưu dưới dạng Snapshot bất biến (tên món, size, đơn giá thời điểm đặt)
            // Đảm bảo sau này catalog có đổi giá/tên thì đơn hàng cũ vẫn giữ nguyên.
            const order = await tx.order.create({
              data: {
                orderNumber,
                userId,
                status: OrderStatus.PENDING,
                subtotal,
                discountAmount,
                total,
                couponCodeSnapshot: dto.couponCode || null,
                reservationExpiresAt,
                items: {
                  create: preparedItems.map((item) => ({
                    productVariantId: item.productVariantId,
                    productNameSnapshot: item.productNameSnapshot,
                    variantNameSnapshot: item.variantNameSnapshot,
                    unitPrice: item.unitPrice,
                    quantity: item.quantity,
                    sugarLevel: item.sugarLevel,
                    iceLevel: item.iceLevel,
                    note: item.note,
                    orderItemToppings: {
                      create: item.toppings.map((t) => ({
                        toppingId: t.toppingId,
                        toppingNameSnapshot: t.toppingNameSnapshot,
                        unitPrice: t.unitPrice,
                        quantity: t.quantity,
                      })),
                    },
                  })),
                },
              },
              include: {
                items: {
                  include: {
                    orderItemToppings: true,
                  },
                },
              },
            });

            await this.inventory.reserve(
              tx,
              order.id,
              reservationExpiresAt,
              needs,
            );

            // 3.6. Giữ lượt dùng mã giảm giá (CouponRedemption) nếu có
            if (couponQuote) {
              await this.promotionsService.reserve(
                tx,
                couponQuote,
                order.id,
                reservationExpiresAt,
              );
            }

            // 3.7. Ghi nhận lịch sử trạng thái đơn hàng (Khởi tạo: null -> PENDING)
            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                fromStatus: null,
                toStatus: OrderStatus.PENDING,
                changedByUserId: userId,
                reason: 'Khách hàng tạo đơn hàng',
              },
            });

            return {
              id: order.id,
              orderNumber: order.orderNumber,
              status: 'PENDING',
              items: order.items.map(toOrderItemResponse),
              subtotal: orderMoney(order.subtotal),
              discountAmount: orderMoney(order.discountAmount),
              total: orderMoney(order.total),
              currency: 'VND',
              reservationExpiresAt: order.reservationExpiresAt.toISOString(),
              createdAt: order.createdAt.toISOString(),
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        const prismaError = error as {
          code?: string;
          meta?: { target?: unknown };
        };
        const uniqueOrderNumber =
          prismaError.code === 'P2002' &&
          JSON.stringify(prismaError.meta?.target ?? '').match(
            /order_number|orderNumber/,
          );
        if (
          !(error instanceof InventoryVersionConflict) &&
          !['P2034', '40001', '40P01'].includes(prismaError.code ?? '') &&
          !uniqueOrderNumber
        )
          throw error;
        if (attempt === 2)
          throw new ConflictException({
            error: {
              code: 'INVENTORY_CONFLICT',
              message: 'Inventory changed; please try again.',
            },
          });
        await new Promise((resolve) =>
          setTimeout(resolve, 10 * (attempt + 1) + Math.random() * 20),
        );
      }
    }
    throw new Error('Unreachable retry state');
  }
  // =====================================================================
  // 2. LẤY DANH SÁCH ĐƠN HÀNG CỦA TÔI (GET /orders/me - UC-09)
  // =====================================================================
  async getMyOrders(userId: string): Promise<OrderResponseDto[]> {
    // -----------------------------------------------------------------
    // BƯỚC 1: TRUY VẤN TẤT CẢ ĐƠN HÀNG CỦA USER TỪ DATABASE
    // - Chỉ lấy đơn hàng thuộc về userId đã được xác thực qua JWT.
    // - Sắp xếp theo thời gian tạo mới nhất trước (createdAt: DESC).
    // - Tải kèm (include) toàn bộ items và topping để hiển thị đầy đủ chi tiết.
    // -----------------------------------------------------------------
    const orders = await this.repository.findOrdersByUserId(userId);

    // -----------------------------------------------------------------
    // BƯỚC 2: CHUẨN HÓA DỮ LIỆU ĐẦU RA SANG DTO
    // - Dùng toOrderItemResponse để map từng món cùng topping và tính lineTotal.
    // - Ép kiểu các trường tiền tệ từ BigInt sang Number an toàn cho JSON (tránh lỗi JSON serialization).
    // - Chuẩn hóa định dạng ngày tháng ISO string cho client.
    // -----------------------------------------------------------------
    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      items: order.items.map(toOrderItemResponse),
      subtotal: orderMoney(order.subtotal),
      discountAmount: orderMoney(order.discountAmount),
      total: orderMoney(order.total),
      currency: 'VND',
      reservationExpiresAt: order.reservationExpiresAt.toISOString(),
      createdAt: order.createdAt.toISOString(),
    }));
  }

  async getMyOrdersPage(userId: string, query: OrderHistoryQueryDto) {
    const limit = query.limit ?? 20;
    const rows = await this.repository.findOrdersPage(userId, query);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const data: OrderResponseDto[] = page.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      items: order.items.map(toOrderItemResponse),
      subtotal: orderMoney(order.subtotal),
      discountAmount: orderMoney(order.discountAmount),
      total: orderMoney(order.total),
      currency: 'VND',
      reservationExpiresAt: order.reservationExpiresAt.toISOString(),
      createdAt: order.createdAt.toISOString(),
    }));
    return {
      data,
      meta: { nextCursor: hasMore ? page[page.length - 1].id : null },
    };
  }

  // =====================================================================
  // 3. CHI TIẾT ĐƠN HÀNG (GET /orders/:id - UC-09)
  // =====================================================================
  async getOrderDetail(
    orderId: string,
    userId: string,
  ): Promise<OrderDetailResponseDto> {
    // -----------------------------------------------------------------
    // BƯỚC 1: TRUY VẤN CHI TIẾT ĐƠN HÀNG KÈM CHỦ QUYỀN SỞ HỮU (OWNERSHIP)
    // - Chỉ trả về dữ liệu nếu orderId tồn tại VÀ thuộc về đúng userId.
    // - Nếu không phải chủ đơn => ném NotFoundException ('ORDER_NOT_FOUND')
    //   để tránh kẻ xấu dò quét đoán ID đơn hàng của người khác (Security Best Practice).
    // -----------------------------------------------------------------
    const order = await this.repository.findOrderDetail(orderId, userId);

    if (!order) {
      throw new NotFoundException({
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Đơn hàng không tồn tại hoặc bạn không có quyền truy cập',
        },
      });
    }

    // -----------------------------------------------------------------
    // BƯỚC 2: TỔNG HỢP PAYMENT SUMMARY VÀ STATUS TIMELINE
    // - Payment summary: Lấy giao dịch thanh toán mới nhất (nếu có).
    // - Timeline: Danh sách lịch sử trạng thái theo thứ tự thời gian tăng dần.
    // -----------------------------------------------------------------
    const latestPayment = order.payments?.[0];
    const paymentSummary: PaymentSummaryDto | null = latestPayment
      ? {
          id: latestPayment.id,
          method: latestPayment.method,
          status: latestPayment.status,
          amount: orderMoney(latestPayment.amount),
          gatewayTransactionId: latestPayment.gatewayTransactionId ?? null,
          processedAt: latestPayment.processedAt
            ? latestPayment.processedAt.toISOString()
            : null,
          createdAt: latestPayment.createdAt.toISOString(),
        }
      : null;

    const timeline: StatusTimelineDto[] = (order.statusHistories ?? []).map(
      (history) => ({
        id: history.id,
        fromStatus: history.fromStatus,
        toStatus: history.toStatus,
        reason: history.reason,
        createdAt: history.createdAt.toISOString(),
      }),
    );

    // -----------------------------------------------------------------
    // BƯỚC 3: TRẢ VỀ DỮ LIỆU ĐẦY ĐỦ CHO CLIENT
    // -----------------------------------------------------------------
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      items: order.items.map(toOrderItemResponse),
      subtotal: orderMoney(order.subtotal),
      discountAmount: orderMoney(order.discountAmount),
      total: orderMoney(order.total),
      currency: 'VND',
      reservationExpiresAt: order.reservationExpiresAt.toISOString(),
      createdAt: order.createdAt.toISOString(),
      paymentSummary,
      timeline,
    };
  }
  private normalizeItems(items: CreateOrderItemDto[]): CreateOrderItemDto[] {
    const grouped = new Map<string, CreateOrderItemDto>();
    for (const item of items) {
      const toppingIds = (item.toppingIds ?? [])
        .map((id) => id.toLowerCase())
        .sort();
      if (new Set(toppingIds).size !== toppingIds.length) {
        throw new BadRequestException({
          error: { code: 'VALIDATION_ERROR', message: 'Duplicate toppings.' },
        });
      }
      const normalized = {
        quantity: item.quantity,
        productVariantId: item.productVariantId.toLowerCase(),
        toppingIds,
        sugarLevel: item.sugarLevel ?? null,
        iceLevel: item.iceLevel ?? null,
        note: item.note?.trim() || null,
      };
      const key = JSON.stringify([
        normalized.productVariantId,
        toppingIds,
        normalized.sugarLevel,
        normalized.iceLevel,
        normalized.note,
      ]);
      const previous = grouped.get(key);
      if (previous) previous.quantity += normalized.quantity;
      else grouped.set(key, normalized);
      if ((grouped.get(key)?.quantity ?? 0) > 20) {
        throw new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'At most 20 drinks per configuration.',
          },
        });
      }
    }
    return [...grouped.values()];
  }

  async validateAndPriceItems(
    items: CreateOrderItemDto[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const preparedItems = [];
    // Nhu cầu nguyên liệu suy ra từ công thức (BOM); không có tồn kho thành phẩm.
    const needs: InventoryNeeds = {
      ingredients: new Map(),
      variants: new Map(),
    };
    const ingredientStock = new Map<string, number>();
    type QuotedRecipeLine = RecipeLine & { ingredientId: string };
    const quotedRecipes = new Map<string, QuotedRecipeLine[]>();
    const quotedToppingRecipes = new Map<string, QuotedRecipeLine[]>();

    let subtotal = 0n;

    for (const item of items) {
      // 1. Tìm size và sản phẩm đang hoạt động trong database.
      const variant = await this.catalog.quoteVariant(
        tx,
        item.productVariantId,
      );

      if (!variant) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_OPTION',
            message: 'Product variant not found or unavailable',
          },
        });
      }

      // 2. Quy đổi số ly thành nhu cầu nguyên liệu theo công thức (BOM).
      // Cộng dồn nếu nhiều dòng chọn cùng size hoặc dùng chung nguyên liệu.
      const variantId = variant.id;
      quotedRecipes.set(variantId, variant.recipeItems);

      const variantNeed = needs.variants.get(variantId) ?? {
        quantity: 0,
        ingredients: new Map<string, number>(),
      };
      variantNeed.quantity += item.quantity;
      needs.variants.set(variantId, variantNeed);

      const addNeed = (
        line: {
          ingredientId: string;
          quantity: number;
          ingredient: { stockQuantity: number; version: number };
        },
        cups: number,
      ) => {
        const amount = line.quantity * cups;
        const ingredientId = line.ingredientId;
        variantNeed.ingredients.set(
          ingredientId,
          (variantNeed.ingredients.get(ingredientId) ?? 0) + amount,
        );
        const total = needs.ingredients.get(ingredientId);
        needs.ingredients.set(ingredientId, {
          quantity: (total?.quantity ?? 0) + amount,
          version: line.ingredient.version,
        });
        ingredientStock.set(ingredientId, line.ingredient.stockQuantity);
      };

      for (const line of variant.recipeItems) addNeed(line, item.quantity);

      // 3. Kiểm tra topping thuộc sản phẩm và đang hoạt động.
      const selectedToppings = (item.toppingIds ?? []).map((toppingId) => {
        const relation = variant.product.productToppings.find(
          (productTopping) =>
            productTopping.topping.id === toppingId &&
            productTopping.topping.isActive,
        );

        if (!relation) {
          throw new BadRequestException({
            error: {
              code: 'INVALID_OPTION',
              message: 'Topping is not available for this product',
            },
          });
        }

        return relation.topping;
      });

      // 3b. Mỗi ly kèm 1 phần topping: quy đổi theo công thức topping (nhập sẵn
      // hoặc chế biến) và gộp vào nhu cầu nguyên liệu của dòng giữ chỗ này.
      for (const topping of selectedToppings) {
        quotedToppingRecipes.set(topping.id, topping.recipeItems);
        for (const line of topping.recipeItems) addNeed(line, item.quantity);
      }

      // 4. Lấy giá từ database, không nhận giá từ frontend.
      const toppingTotal = selectedToppings.reduce(
        (sum, topping) => sum + topping.price,
        0n,
      );

      const lineTotal = (variant.price + toppingTotal) * BigInt(item.quantity);

      [
        variant.price,
        lineTotal,
        ...selectedToppings.map((t) => t.price),
      ].forEach(orderMoney);
      subtotal += lineTotal;
      orderMoney(subtotal);

      // 5. Chuẩn bị dữ liệu để tạo OrderItem và OrderItemTopping.
      preparedItems.push({
        productVariantId: variant.id,
        productNameSnapshot: variant.product.name,
        variantNameSnapshot: variant.size,
        unitPrice: variant.price,
        quantity: item.quantity,
        sugarLevel: item.sugarLevel ?? null,
        iceLevel: item.iceLevel ?? null,
        note: item.note?.trim() || null,
        toppings: selectedToppings.map((topping) => ({
          toppingId: topping.id,
          toppingNameSnapshot: topping.name,
          unitPrice: topping.price,
          quantity: 1,
        })),
      });
    }

    // 6. Kiểm tra tổng nhu cầu nguyên liệu với tồn kho nguyên liệu hiện tại.
    // Variant chưa có công thức hoặc dùng nguyên liệu ngừng dùng thì không bán được.
    // Topping chưa có công thức hoặc thiếu nguyên liệu cũng không bán được.
    const isShort = (recipe: QuotedRecipeLine[]) =>
      recipe.length === 0 ||
      recipe.some(
        (line) =>
          !line.ingredient.isActive ||
          (needs.ingredients.get(line.ingredientId)?.quantity ?? 0) >
            (ingredientStock.get(line.ingredientId) ?? 0),
      );
    const unavailable: Array<{
      variantId?: string;
      toppingId?: string;
      available: number;
    }> = [];
    for (const [variantId, recipe] of quotedRecipes) {
      if (isShort(recipe)) {
        unavailable.push({ variantId, available: maxServings(recipe) });
      }
    }
    for (const [toppingId, recipe] of quotedToppingRecipes) {
      if (isShort(recipe)) {
        unavailable.push({ toppingId, available: maxServings(recipe) });
      }
    }

    if (unavailable.length > 0) {
      throw new ConflictException({
        error: {
          code: 'OUT_OF_STOCK',
          message: 'Insufficient ingredients',
          details: unavailable,
        },
      });
    }

    return {
      items: preparedItems,
      subtotal,
      needs,
    };
  }

  // =====================================================================
  // 2. CỔNG GIAO TIẾP CHO MODULE THANH TOÁN (PAYMENT TRANSITIONS)
  // =====================================================================

  async getOrderForPayment(orderId: string, userId: string) {
    const order = await this.repository.findByIdAndUserId(orderId, userId);
    if (!order) {
      throw new NotFoundException(
        'Đơn hàng không tồn tại hoặc bạn không có quyền truy cập',
      );
    }
    return order;
  }

  async transitionForPaymentRetry(
    orderId: string,
    userId: string,
    reason: string,
  ) {
    await this.repository.updateStatusWithHistory(
      orderId,
      OrderStatus.PAYMENT_FAILED,
      OrderStatus.PENDING,
      userId,
      reason,
    );
  }

  async markOrderPaid(
    orderId: string,
    userId: string,
    orderTotal: bigint,
    tx: Prisma.TransactionClient,
  ) {
    await this.repository.markAsPaid(
      orderId,
      OrderStatus.PENDING,
      userId,
      orderTotal,
      tx,
    );
  }

  async markOrderPaymentFailed(
    orderId: string,
    userId: string,
    reason: string,
    tx: Prisma.TransactionClient,
  ) {
    await this.repository.updateStatusWithHistory(
      orderId,
      OrderStatus.PENDING,
      OrderStatus.PAYMENT_FAILED,
      userId,
      reason,
      tx,
    );
  }
}

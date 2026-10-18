
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderItemDto } from '../dto/create-order.dto.js';
import { OrdersRepository } from '../repositories/orders.repository.js';

@Injectable()
export class OrdersService {
  constructor(private readonly repository: OrdersRepository) {}

  async validateAndPriceItems(items: CreateOrderItemDto[]) {
    const preparedItems = [];
    const requiredStock = new Map<string, number>();
    const availableStock = new Map<string, number>();

    let subtotal = 0n;

    for (const item of items) {
      // 1. Tìm size và sản phẩm đang hoạt động trong database.
      const variant = await this.repository.findActiveVariantById(
        item.productVariantId,
      );

      if (!variant) {
        throw new NotFoundException(
          'Product variant not found or unavailable',
        );
      }

      // 2. Cộng dồn số lượng nếu nhiều dòng chọn cùng một size.
      const variantId = variant.id;

      requiredStock.set(
        variantId,
        (requiredStock.get(variantId) ?? 0) + item.quantity,
      );

      availableStock.set(variantId, variant.stock);

      // 3. Kiểm tra topping thuộc sản phẩm và đang hoạt động.
      const selectedToppings = (item.toppingIds ?? []).map((toppingId) => {
        const relation = variant.product.productToppings.find(
          (productTopping) =>
            productTopping.topping.id === toppingId &&
            productTopping.topping.isActive,
        );

        if (!relation) {
          throw new BadRequestException(
            'Topping is not available for this product',
          );
        }

        return relation.topping;
      });

      // 4. Lấy giá từ database, không nhận giá từ frontend.
      const toppingTotal = selectedToppings.reduce(
        (sum, topping) => sum + topping.price,
        0n,
      );

      const lineTotal =
        (variant.price + toppingTotal) * BigInt(item.quantity);

      subtotal += lineTotal;

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

    // 6. Kiểm tra tổng số lượng cần mua với tồn kho hiện tại.
    for (const [variantId, quantity] of requiredStock) {
      const stock = availableStock.get(variantId) ?? 0;

      if (quantity > stock) {
        throw new ConflictException('Insufficient stock');
      }
    }

    return {
      items: preparedItems,
      subtotal,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveVariantById(variantId: string) {
    return this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        isActive: true,
        product: {
          isActive: true,
        },
      },
      include: {
        product: {
          include: {
            productToppings: {
              include: {
                topping: true,
              },
            },
          },
        },
      },
    });
  }
}
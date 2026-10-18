import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllProducts() {
    return this.prisma.product.findMany({
      where: {
        isActive: true,
      },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: { price: 'asc' },
        },
        productToppings: {
          include: { topping: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  
  async findDetailById(id: string) {
    return this.prisma.product.findFirst({
      where: {
        id: id,
        isActive: true,
      },
      include: {
        variants: {
          where: { isActive: true },
        },
       productToppings: {
  where: {
    topping: {
      isActive: true,
    },
  },
  include: {
    topping: true,
  },
},
      },
    });
  }

}
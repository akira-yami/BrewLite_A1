import { CatalogModule } from '../catalog/catalog.module.js';
import { UsersService } from '../users/users.service.js';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OrdersRepository } from './repositories/orders.repository.js';
import { OrdersService } from './services/orders.service.js';
import { OrdersController } from './controllers/orders.controller.js';
import { OrderExpiryJob } from './services/order-expiry.job.js';

@Module({
  imports: [PrismaModule, PromotionsModule, CatalogModule, InventoryModule],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService, UsersService, OrderExpiryJob],
  exports: [OrdersService],
})
export class OrdersModule {}

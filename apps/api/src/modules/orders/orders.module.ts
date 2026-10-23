import { CatalogModule } from '../catalog/catalog.module.js';
import { UsersService } from '../users/users.service.js';
import { InventoryService } from '../inventory/inventory.service.js';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';
import { OrdersRepository } from './repositories/orders.repository.js';
import { OrdersService } from './services/orders.service.js';
import { OrdersController } from './controllers/orders.controller.js';

@Module({
  imports: [PrismaModule, PromotionsModule, CatalogModule],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService, InventoryService, UsersService],
  exports: [OrdersService],
})
export class OrdersModule {}

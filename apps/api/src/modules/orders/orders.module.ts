
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { OrdersRepository } from './repositories/orders.repository.js';
import { OrdersService } from './services/orders.service.js';

@Module({
  imports: [PrismaModule],
  providers: [OrdersRepository, OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

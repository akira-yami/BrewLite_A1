
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { InventoryRepository } from './repositories/inventory.repository.js';
import { InventoryService } from './services/inventory.service.js';

@Module({
  imports: [PrismaModule],
  providers: [
    InventoryRepository,
    InventoryService,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}

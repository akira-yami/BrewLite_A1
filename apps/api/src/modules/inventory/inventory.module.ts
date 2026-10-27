
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { InventoryRepository } from './repositories/inventory.repository.js';
import { InventoryService } from './services/inventory.service.js';
import { InventoryExpiryJob } from './services/inventory-expiry.job.js';

@Module({
  imports: [PrismaModule],
  providers: [
    InventoryRepository,
    InventoryService,
    InventoryExpiryJob,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}

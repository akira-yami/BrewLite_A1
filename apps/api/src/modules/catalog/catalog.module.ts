import { Module } from '@nestjs/common';
import { CatalogController } from './controllers/catalog.controller.js';
import { CatalogService } from './services/catalog.service.js';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { PrismaService } from '../../database/prisma.service.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, CatalogRepository, PrismaService],
  exports: [CatalogService],
})
export class CatalogModule {}
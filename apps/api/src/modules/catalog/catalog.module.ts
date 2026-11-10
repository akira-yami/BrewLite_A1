import { Module } from '@nestjs/common';
import { CatalogController } from './controllers/catalog.controller.js';
import { StaffRecipesController } from './controllers/staff-recipes.controller.js';
import { CatalogService } from './services/catalog.service.js';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersService } from '../users/users.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController, StaffRecipesController],
  providers: [CatalogService, CatalogRepository, PrismaService, UsersService],
  exports: [CatalogService],
})
export class CatalogModule {}

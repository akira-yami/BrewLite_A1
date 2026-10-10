import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthModule } from './modules/health/health.module.js';
import { PrismaModule } from './database/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';

@Module({
  imports: [HealthModule, PrismaModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { PaymentsModule } from './modules/payments/payments.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';

@Module({
  imports: [HealthModule, PaymentsModule, CatalogModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthModule } from './modules/health/health.module.js';
import { PrismaModule } from './database/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';

@Module({
  imports: [HealthModule, PrismaModule, AuthModule, CatalogModule, PaymentsModule, OrdersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}


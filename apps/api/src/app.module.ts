
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

import { HealthModule } from './modules/health/health.module.js';
import { PrismaModule } from './database/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PromotionsModule } from './modules/promotions/promotions.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { LoyaltyModule } from './modules/loyalty/loyalty.module.js';

@Module({
  imports: [
    HealthModule,
    PrismaModule,
    AuthModule,
    CatalogModule,
    PaymentsModule,
    OrdersModule,
    PromotionsModule,
    InventoryModule,
    LoyaltyModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}

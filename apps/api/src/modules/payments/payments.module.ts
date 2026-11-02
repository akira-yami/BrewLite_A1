// File cấu hình module gom tất cả Controller, Service lại
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsController } from './controllers/payments.controller.js';
import { PaymentsService } from './services/payments.service.js';
import { PaymentsRepository } from './repositories/payments.repository.js';
import { MockGatewayService } from './services/mock-gateway.service.js';
import { VnpayGatewayService } from './services/vnpay-gateway.service.js';

@Module({
  imports: [PrismaModule, AuthModule, OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository, MockGatewayService, VnpayGatewayService],
  exports: [PaymentsService], // Export để module khác có thể gọi nếu cần
})
export class PaymentsModule {}
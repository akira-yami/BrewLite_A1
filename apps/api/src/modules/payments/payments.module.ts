// File cấu hình module gom tất cả Controller, Service lại
import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/app-config.module.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsController } from './controllers/payments.controller.js';
import { PaymentsService } from './services/payments.service.js';
import { PaymentsRepository } from './repositories/payments.repository.js';
import { MockGatewayService } from './services/mock-gateway.service.js';
import { VnpayGatewayService } from './services/vnpay.gateway.js';
import { VnpayInquiryService } from './services/vnpay-inquiry.service.js';
import { PaymentRecoveryService } from './services/payment-recovery.service.js';

@Module({
  imports: [AppConfigModule, PrismaModule, AuthModule, OrdersModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsRepository,
    MockGatewayService,
    VnpayGatewayService,
    VnpayInquiryService,
    PaymentRecoveryService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}

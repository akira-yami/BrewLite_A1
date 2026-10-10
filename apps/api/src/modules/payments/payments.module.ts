// File cấu hình module gom tất cả Controller, Service lại
import { Module } from '@nestjs/common';
// import { PaymentsController } from './controllers/payments/payments.controller.js';
import { PaymentsService } from './services/payments/payments.service.js';
import { MockGatewayService } from './services/mock-gateway/mock-gateway.service.js';

@Module({
// TẠM KHÔNG ĐĂNG KÝ CONTROLLER VÀO ENDPOINT PUBLIC (Giải quyết KT-05)
  // controllers: [PaymentsController],
  providers: [PaymentsService, MockGatewayService],
  exports: [PaymentsService], // Export để module khác có thể gọi nếu cần
})
export class PaymentsModule {}
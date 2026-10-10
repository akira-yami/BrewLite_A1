import { Controller, Body, Headers, UsePipes, ValidationPipe } from '@nestjs/common';
import { PaymentsService } from '../../services/payments/payments.service.js';
import { CreatePaymentDto } from '../../dto/create-payment.dto.js';

// TẠM TẮT ENDPOINT TRONG TUẦN 1 ĐỂ TRÁNH TRẢ DỮ LIỆU GIẢ (Giải quyết KT-05)
@Controller('payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) {}

    // @Post()
    // THỰC THI VALIDATION CHẶT CHẼ KHI ENDPOINT ĐƯỢC BẬT (Giải quyết KT-04)
    @UsePipes(new ValidationPipe({
        whitelist: true, // Tự động loại bỏ các trường không có trong DTO (như amount, requestHash hacker cố tình nhét vào)
        forbidNonWhitelisted: true, // Báo lỗi 400 nếu có trường lạ
        transform: true,
    }))
    async processPayment(
        @Headers('idempotency-key') _idempotencyKey: string, // Lấy Key từ Header (Giải quyết KT-03)
        @Body() _createPaymentDto: CreatePaymentDto
    ) {
        // Sprint 2 sẽ bật lại và truyền idempotencyKey cùng DTO xuống Service
        // return this.paymentsService.processPayment(createPaymentDto, idempotencyKey);
    }
}
import { Controller, Post, Body } from '@nestjs/common';
import { PaymentsService } from '../../services/payments/payments.service.js';
import { CreatePaymentDto } from '../../dto/create-payment.dto.js';

@Controller('payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) {}

    @Post()
    async processPayment(@Body() createPaymentDto: CreatePaymentDto) {
        // Chuyển tiếp payload xuống Service xử lý
        return this.paymentsService.processPayment(createPaymentDto);
    }
}
import { BadRequestException, Controller, Body, Headers, HttpStatus, HttpCode, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { PaymentsService } from '../services/payments.service.js';
import { OrdersService } from '../../orders/services/orders.service.js';
import { CreatePaymentDto } from '../dto/create-payment.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { UserRole, PaymentMethod } from '../../../generated/prisma/client.js';

@Controller('payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService, private readonly ordersService: OrdersService) {}

    @Post()
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.CUSTOMER)
    @UsePipes(new ValidationPipe({
        whitelist: true, // Tự động loại bỏ các trường không có trong DTO (như amount, requestHash hacker cố tình nhét vào)
        forbidNonWhitelisted: true, // Báo lỗi 400 nếu có trường lạ
        transform: true,
    }))
    async create(
        @Body() dto: CreatePaymentDto,
        @Headers('idempotency-key') idempotencyKey: string,
        @CurrentUser() user: { sub: string; username: string; role: string },
    ) {
        // Ép buộc kiểm tra Idempotency-Key từ Header theo đúng đặc tả TDD
        if (!idempotencyKey || idempotencyKey.trim() === '') {throw new BadRequestException('Header Idempotency-Key là bắt buộc để chống double-charge');}

        // Xác thực quyền sở hữu và lấy số tiền thanh toán thực tế trực tiếp từ DB
        const order = await this.ordersService.getOrderForPayment(dto.orderId, user.sub);

        const result = await this.paymentsService.processPayment({
            idempotencyKey,
            orderId: dto.orderId,
            userId: user.sub,
            method: dto.method as unknown as PaymentMethod,
            amount: order.total,
        });

        return { data: result };
    }
}
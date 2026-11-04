import {
  BadRequestException,
  Controller,
  Body,
  Headers,
  HttpStatus,
  HttpCode,
  Get,
  Post,
  Query,
  Ip,
  Res,
  UseGuards,
  UsePipes,
  Optional,
  Param,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { PaymentsService } from '../services/payments.service.js';
import { PaymentRecoveryService } from '../services/payment-recovery.service.js';
import { PaymentRecoveryDto } from '../dto/payment-recovery.dto.js';
import { OrdersService } from '../../orders/services/orders.service.js';
import { CreatePaymentDto } from '../dto/create-payment.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { UserRole, PaymentMethod } from '../../../generated/prisma/client.js';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly ordersService: OrdersService,
    @Optional() private readonly paymentRecoveryService?: PaymentRecoveryService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  async getStatus(
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() user: { sub: string; username: string; role: string },
  ) {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new BadRequestException(
        'Header Idempotency-Key là bắt buộc để tra cứu trạng thái thanh toán',
      );
    }
    return { data: await this.paymentsService.getPaymentStatus(idempotencyKey, user.sub) };
  }

  // VNPay calls IPN server-to-server; the service verifies the signed payload before writes.
  @Get('vnpay/ipn')
  @HttpCode(HttpStatus.OK)
  async vnpayIpn(@Query() query: Record<string, unknown>) {
    return this.paymentsService.handleVnpayIpn(query);
  }

  // Browser Return is display-only. Payment settlement happens only through verified IPN.
  @Get('vnpay/return')
  async vnpayReturn(
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const destination = await this.paymentsService.getVnpayReturnRedirect(query);
    return response.redirect(HttpStatus.FOUND, destination);
  }


  // Recovery is an explicit operator action; customer-facing roles cannot force a status.
  @Post(':paymentId/recovery')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PAYMENT_OPERATOR)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async recover(
    @Param('paymentId') paymentId: string,
    @Body() dto: PaymentRecoveryDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @CurrentUser() user: { sub: string; username: string; role: string },
  ) {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new BadRequestException('Header Idempotency-Key là bắt buộc cho recovery.');
    }
    if (!this.paymentRecoveryService) {
      throw new BadRequestException('Payment recovery service is unavailable.');
    }
    return {
      data: await this.paymentRecoveryService.recover({
        paymentId,
        idempotencyKey,
        incidentReference: dto.incidentReference,
        correlationId,
        actorUserId: user.sub,
      }),
    };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }))
  async create(
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Ip() clientIp: string,
    @CurrentUser() user: { sub: string; username: string; role: string },
  ) {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new BadRequestException(
        'Header Idempotency-Key là bắt buộc để chống double-charge',
      );
    }

    const order = await this.ordersService.getOrderForPayment(dto.orderId, user.sub);
    const result = await this.paymentsService.processPayment({
      idempotencyKey,
      orderId: dto.orderId,
      userId: user.sub,
      method: dto.method as unknown as PaymentMethod,
      amount: order.total,
      clientIp,
    });
    return { data: result };
  }
}

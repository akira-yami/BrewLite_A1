import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { OrderHistoryQueryDto } from '../dto/order-history-query.dto.js';
import {
  OrdersExceptionFilter,
  OrdersResponseInterceptor,
} from '../http/orders-http.js';

import { UserRole } from '../../../generated/prisma/client.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { CreateOrderDto } from '../dto/create-order.dto.js';
import { OrdersService } from '../services/orders.service.js';

type Principal = { id: string; role: UserRole };

@Controller('orders')
@UseFilters(OrdersExceptionFilter)
@UseInterceptors(OrdersResponseInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: Principal, @Body() dto: CreateOrderDto) {
    const data = await this.orders.createOrder(user.id, dto);
    return { data };
  }

  @Get('/me')
  @HttpCode(HttpStatus.OK)
  async getMyOrders(
    @CurrentUser() user: Principal,
    @Query() query: OrderHistoryQueryDto = {},
  ) {
    return this.orders.getMyOrdersPage(user.id, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getOrderDetail(
    @Param('id', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: Principal,
  ) {
    const data = await this.orders.getOrderDetail(orderId, user.id);
    return { data };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrder(
    @Param('id', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: Principal,
  ) {
    // Lý do cố định từ controller — client không được tự đặt nội dung lịch sử.
    await this.orders.cancelOrder(
      orderId,
      user.id,
      'Khách hàng yêu cầu hủy đơn hàng',
      false,
    );
    const data = await this.orders.getOrderDetail(orderId, user.id);
    return { data };
  }

  /**
   * POST /orders/:id/cancel-paid
   * Customer hủy đơn đã thanh toán (PAID) và nhận hoàn tiền dưới dạng điểm tích lũy.
   * Chỉ được hủy khi Barista CHƯA bắt đầu pha chế (chưa bấm PREPARING).
   */
  @Post(':id/cancel-paid')
  @HttpCode(HttpStatus.OK)
  async cancelPaidOrder(
    @Param('id', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: Principal,
  ) {
    const result = await this.orders.cancelPaidOrder(
      orderId,
      user.id,
      'CUSTOMER',
      'Khách hàng yêu cầu hủy đơn hàng đã thanh toán',
    );
    // Trả về chi tiết đơn hàng sau khi hủy kèm thông tin hoàn điểm.
    const data = await this.orders.getOrderDetail(orderId, user.id);
    return {
      data,
      refund: {
        refundPoints: result.refundPoints,
        newLoyaltyBalance: result.newLoyaltyBalance,
        message: `Đã hoàn ${result.refundPoints.toLocaleString('vi-VN')} điểm vào tài khoản của bạn.`,
      },
    };
  }
}

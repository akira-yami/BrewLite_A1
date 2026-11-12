import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { BaristaCanclePaidOrderDto } from '../dto/cancel-paid-order.dto.js';
import {
  StaffOrdersQueryDto,
  UpdateOrderStatusDto,
} from '../dto/staff-orders.dto.js';
import {
  OrdersExceptionFilter,
  OrdersResponseInterceptor,
} from '../http/orders-http.js';
import { OrdersService } from '../services/orders.service.js';

type Principal = { id: string; role: UserRole };

/**
 * API dành riêng cho nhân viên (EXT-UC10). Guard và @Roles đặt ở cấp class nên
 * mọi route thêm vào sau đều mặc định chỉ BARISTA được dùng; CUSTOMER nhận 403.
 */
@Controller('staff/orders')
@UseFilters(OrdersExceptionFilter)
@UseInterceptors(OrdersResponseInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BARISTA)
export class StaffOrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Hàng đợi đơn PAID / PREPARING / READY. */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getQueue(@Query() query: StaffOrdersQueryDto = {}, @CurrentUser() user: Principal) {
    return this.orders.getStaffQueue(query, user.id);
  }

  /** Nhận đơn (PREPARING), pha xong (READY) hoặc giao khách (COMPLETED). */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: Principal,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const data = await this.orders.advanceOrderStatus(
      orderId,
      user.id,
      dto.status,
    );
    return { data };
  }

  /**
   * POST /staff/orders/:id/cancel-paid
   * Barista hủy đơn PAID khi hết nguyên liệu đột xuất hoặc sự cố máy.
   * Phải cung cấp lý do bắt buộc; hoàn tiền thành Store Credit cho khách.
   */
  @Post(':id/cancel-paid')
  @HttpCode(HttpStatus.OK)
  async cancelPaidOrder(
    @Param('id', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: Principal,
    @Body() dto: BaristaCanclePaidOrderDto,
  ) {
    const result = await this.orders.cancelPaidOrder(
      orderId,
      user.id,
      'BARISTA',
      dto.reason,
    );
    return {
      data: {
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        status: 'CANCELLED',
        refund: {
          refundPoints: result.refundPoints,
          newLoyaltyBalance: result.newLoyaltyBalance,
          message: `Đã hoàn ${result.refundPoints.toLocaleString('vi-VN')} điểm vào tài khoản khách hàng.`,
        },
      },
    };
  }
}

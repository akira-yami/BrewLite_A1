import { BadRequestException, Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { RedeemLoyaltyDto } from '../dto/redeem-loyalty.dto.js';
import { LoyaltyService } from '../services/loyalty.service.js';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('tiers')
  getTiers() {
    return { data: this.loyalty.getTiers() };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  async getOverview(@CurrentUser() user: { sub: string }) {
    return { data: await this.loyalty.getOverview(user.sub) };
  }

  @Post('redeem')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  async redeem(
    @CurrentUser() user: { sub: string },
    @Body() dto: RedeemLoyaltyDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException({ error: { code: 'VALIDATION_ERROR', message: 'Thiếu Idempotency-Key.' } });
    }
    return { data: await this.loyalty.redeem(user.sub, dto.tierId, idempotencyKey) };
  }
}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LoyaltyController } from './controllers/loyalty.controller.js';
import { LoyaltyRepository } from './repositories/loyalty.repository.js';
import { LoyaltyService } from './services/loyalty.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyRepository, LoyaltyService],
})
export class LoyaltyModule {}

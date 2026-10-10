import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthModule } from './modules/health/health.module.js';
import { PrismaModule } from './database/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';

@Module({
  imports: [HealthModule, PrismaModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}


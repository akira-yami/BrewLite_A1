import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UserRepository } from './repositories/user.repository.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { OwnershipGuard } from './guards/ownership.guard.js';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && process.env.NODE_ENV !== 'test') {
  throw new Error('JWT_SECRET environment variable is required and has no default fallback');
}

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: jwtSecret || 'test-jwt-secret-for-isolated-tests-only-32bytes-long',
      signOptions: {
        expiresIn: '15m',
        issuer: process.env.JWT_ISSUER || 'brewlite-api',
        audience: process.env.JWT_AUDIENCE || 'brewlite-web',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, UserRepository, JwtStrategy, JwtAuthGuard, RolesGuard, OwnershipGuard],
  exports: [AuthService, UserRepository, JwtAuthGuard, RolesGuard, OwnershipGuard, JwtModule],
})
export class AuthModule {}

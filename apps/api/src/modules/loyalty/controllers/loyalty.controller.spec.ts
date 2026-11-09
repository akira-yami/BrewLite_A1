import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../generated/prisma/client.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { LoyaltyController } from './loyalty.controller.js';

describe('LoyaltyController', () => {
  const service = { getTiers: vi.fn(() => []), getOverview: vi.fn(async () => ({})), redeem: vi.fn(async () => ({})) };
  const controller = new LoyaltyController(service as any);
  const reflector = new Reflector();

  it('leaves the tier catalog public', () => {
    expect(Reflect.getMetadata('__guards__', controller.getTiers)).toBeUndefined();
  });

  it('protects personal overview and redemption with JWT and CUSTOMER role', () => {
    for (const method of [controller.getOverview, controller.redeem]) {
      expect(reflector.get('__guards__', method)).toEqual([JwtAuthGuard, RolesGuard]);
      expect(reflector.get(ROLES_KEY, method)).toEqual([UserRole.CUSTOMER]);
    }
  });

  it('returns the API envelope and passes the authenticated principal through', async () => {
    await expect(controller.getOverview({ sub: 'customer-1' })).resolves.toEqual({ data: {} });
    await expect(controller.redeem({ sub: 'customer-1' }, { tierId: '10000' }, '00000000-0000-4000-8000-000000000001'))
      .resolves.toEqual({ data: {} });
    expect(service.getOverview).toHaveBeenCalledWith('customer-1');
    expect(service.redeem).toHaveBeenCalledWith('customer-1', '10000', '00000000-0000-4000-8000-000000000001');
  });
});

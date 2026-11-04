import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../../generated/prisma/client.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import {
  StaffOrdersQueryDto,
  UpdateOrderStatusDto,
} from '../dto/staff-orders.dto.js';
import { StaffOrdersController } from './staff-orders.controller.js';

describe('StaffOrdersController', () => {
  let service: any;
  let controller: StaffOrdersController;
  const barista = { id: 'b-1', role: UserRole.BARISTA };

  beforeEach(() => {
    service = { getStaffQueue: vi.fn(), advanceOrderStatus: vi.fn() };
    controller = new StaffOrdersController(service);
  });

  describe('RBAC', () => {
    it('dùng JwtAuthGuard rồi RolesGuard ở cấp controller', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, StaffOrdersController)).toEqual(
        [JwtAuthGuard, RolesGuard],
      );
    });

    it('chỉ cho phép BARISTA', () => {
      expect(Reflect.getMetadata(ROLES_KEY, StaffOrdersController)).toEqual([
        UserRole.BARISTA,
      ]);
    });

    it('RolesGuard thật từ chối CUSTOMER với 403 FORBIDDEN_RESOURCE và cho BARISTA đi qua', () => {
      const guard = new RolesGuard(new Reflector());
      const contextFor = (role: UserRole) =>
        ({
          getHandler: () => StaffOrdersController.prototype.getQueue,
          getClass: () => StaffOrdersController,
          switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
        }) as any;

      expect(() => guard.canActivate(contextFor(UserRole.CUSTOMER))).toThrow(
        expect.objectContaining({ status: 403 }),
      );
      expect(guard.canActivate(contextFor(UserRole.BARISTA))).toBe(true);
    });
  });

  it('getQueue chuyển query cho service', async () => {
    service.getStaffQueue.mockResolvedValue({ data: [] });
    const query = { status: 'PAID' } as any;
    expect(await controller.getQueue(query, barista)).toEqual({ data: [] });
    expect(service.getStaffQueue).toHaveBeenCalledWith(query, barista.id);
  });

  it('updateStatus lấy id barista từ token và bọc kết quả trong data', async () => {
    service.advanceOrderStatus.mockResolvedValue({ id: 'o-1', status: 'READY' });
    const result = await controller.updateStatus('o-1', barista, {
      status: 'READY',
    });
    expect(service.advanceOrderStatus).toHaveBeenCalledWith(
      'o-1',
      'b-1',
      'READY',
    );
    expect(result).toEqual({ data: { id: 'o-1', status: 'READY' } });
  });

  describe('DTO validation', () => {
    const errorsFor = (cls: any, value: object) =>
      validate(plainToInstance(cls, value));

    it.each(['PREPARING', 'READY', 'COMPLETED'])('nhận status %s', async (status) => {
      expect(await errorsFor(UpdateOrderStatusDto, { status })).toHaveLength(0);
    });

    it.each(['PAID', 'PENDING', 'CANCELLED', 'PAYMENT_FAILED', 'DONE', ''])(
      'từ chối status %s',
      async (status) => {
        expect(
          (await errorsFor(UpdateOrderStatusDto, { status })).length,
        ).toBeGreaterThan(0);
      },
    );

    it('query chỉ nhận PAID/PREPARING/READY và limit 1..200', async () => {
      expect(await errorsFor(StaffOrdersQueryDto, {})).toHaveLength(0);
      expect(
        await errorsFor(StaffOrdersQueryDto, { status: 'READY', limit: '50' }),
      ).toHaveLength(0);
      expect(
        (await errorsFor(StaffOrdersQueryDto, { status: 'COMPLETED' })).length,
      ).toBeGreaterThan(0);
      expect(
        (await errorsFor(StaffOrdersQueryDto, { limit: '0' })).length,
      ).toBeGreaterThan(0);
    });
  });
});

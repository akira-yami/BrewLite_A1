import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from '../services/payments.service.js';
import { OrdersService } from '../../orders/services/orders.service.js';

describe('PaymentsController (Unit Test - TDD)', () => {
    let controller: PaymentsController;
    let paymentsServiceMock: any;
    let ordersServiceMock: any;

    beforeEach(() => {
        paymentsServiceMock = {processPayment: vi.fn(),};
        ordersServiceMock = { getOrderForPayment: vi.fn() };
        controller = new PaymentsController(paymentsServiceMock as unknown as PaymentsService, ordersServiceMock as unknown as OrdersService);
    });

    it('ném BadRequestException nếu thiếu Idempotency-Key trong header', async () => {
        const mockUser = { sub: 'u-1', username: 'testuser', role: 'CUSTOMER' };
        const mockDto = { orderId: 'o-1', method: 'E_WALLET' as any};

        const request = { ip: '203.0.113.7', socket: { remoteAddress: '127.0.0.1' } } as any;
        await expect(controller.create(mockDto, undefined as any, mockUser, request)).rejects.toThrow(BadRequestException);

        await expect(controller.create(mockDto, '', mockUser, request)).rejects.toThrow(BadRequestException);
    });

    it('gọi PaymentsService.processPayment với đúng tham số khi header hợp lệ', async () => {
        const mockUser = { sub: 'u-1', username: 'testuser', role: 'CUSTOMER' };
        const mockDto = { orderId: 'o-1', method: 'E_WALLET' as any};

        const reservationExpiresAt = new Date(Date.now() + 60_000);
        ordersServiceMock.getOrderForPayment.mockResolvedValue({
            total: 100000n,
            reservationExpiresAt,
        });
        paymentsServiceMock.processPayment.mockResolvedValue({ success: true, isRetried: false });
        const request = { ip: '203.0.113.7', socket: { remoteAddress: '127.0.0.1' } } as any;

        const result = await controller.create(mockDto, 'idemp-123', mockUser, request);

        expect(ordersServiceMock.getOrderForPayment).toHaveBeenCalledWith('o-1', 'u-1');
        expect(paymentsServiceMock.processPayment).toHaveBeenCalledWith({
            idempotencyKey: 'idemp-123',
            orderId: 'o-1',
            userId: 'u-1',
            method: 'E_WALLET',
            amount: 100000n,// Số tiền lấy từ DB thông qua OrdersService
            reservationExpiresAt,
            ipAddress: '203.0.113.7',
        });
        expect(result).toEqual({ data: { success: true, isRetried: false } });
    });
});
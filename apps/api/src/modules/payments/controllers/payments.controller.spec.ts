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
        paymentsServiceMock = { processPayment: vi.fn(), getPaymentStatus: vi.fn() };
        ordersServiceMock = { getOrderForPayment: vi.fn() };
        controller = new PaymentsController(paymentsServiceMock as unknown as PaymentsService, ordersServiceMock as unknown as OrdersService);
    });

    it('ném BadRequestException nếu thiếu Idempotency-Key trong header', async () => {
        const mockUser = { sub: 'u-1', username: 'testuser', role: 'CUSTOMER' };
        const mockDto = { orderId: 'o-1', method: 'E_WALLET' as any};

        await expect(controller.create(mockDto, undefined as any, mockUser)).rejects.toThrow(BadRequestException);

        await expect(controller.create(mockDto, '', mockUser)).rejects.toThrow(BadRequestException);
    });

    it('gọi PaymentsService.processPayment với đúng tham số khi header hợp lệ', async () => {
        const mockUser = { sub: 'u-1', username: 'testuser', role: 'CUSTOMER' };
        const mockDto = { orderId: 'o-1', method: 'E_WALLET' as any};

        ordersServiceMock.getOrderForPayment.mockResolvedValue({ total: 100000n });
        paymentsServiceMock.processPayment.mockResolvedValue({ success: true, isRetried: false });

        const result = await controller.create(mockDto, 'idemp-123', mockUser);

        expect(ordersServiceMock.getOrderForPayment).toHaveBeenCalledWith('o-1', 'u-1');
        expect(paymentsServiceMock.processPayment).toHaveBeenCalledWith({
            idempotencyKey: 'idemp-123',
            orderId: 'o-1',
            userId: 'u-1',
            method: 'E_WALLET',
            amount: 100000n,// Số tiền lấy từ DB thông qua OrdersService
            clientIp: '127.0.0.1',
        });
        expect(result).toEqual({ data: { success: true, isRetried: false } });
    });
    it('từ chối tra cứu trạng thái nếu thiếu Idempotency-Key', async () => {
        const mockUser = { sub: 'u-1', username: 'testuser', role: 'CUSTOMER' };
        await expect(controller.getStatus('', mockUser)).rejects.toThrow(BadRequestException);
    });

    it('tra cứu Payment status theo key và user đã xác thực, không gọi OrdersService', async () => {
        const mockUser = { sub: 'u-1', username: 'testuser', role: 'CUSTOMER' };
        const paymentStatus = { success: false, isRetried: true, status: 'PROCESSING' };
        paymentsServiceMock.getPaymentStatus.mockResolvedValue(paymentStatus);
        const result = await controller.getStatus('key-status', mockUser);
        expect(paymentsServiceMock.getPaymentStatus).toHaveBeenCalledWith('key-status', 'u-1');
        expect(result).toEqual({ data: paymentStatus });
        expect(ordersServiceMock.getOrderForPayment).not.toHaveBeenCalled();
    });

});
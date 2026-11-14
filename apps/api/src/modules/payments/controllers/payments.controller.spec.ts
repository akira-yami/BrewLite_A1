import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
        const recoveryServiceMock = {} as any;
        controller = new PaymentsController(paymentsServiceMock as unknown as PaymentsService, ordersServiceMock as unknown as OrdersService, recoveryServiceMock);
    });

    it('ném BadRequestException nếu thiếu Idempotency-Key trong header', async () => {
        const mockUser = { sub: 'u-1', username: 'testuser', role: 'CUSTOMER' };
        const mockDto = { orderId: 'o-1', method: 'E_WALLET' as any};

        await expect(controller.create(mockDto, undefined as any, '127.0.0.1', mockUser)).rejects.toThrow(BadRequestException);

        await expect(controller.create(mockDto, '', '127.0.0.1', mockUser)).rejects.toThrow(BadRequestException);
    });

    it('gọi PaymentsService.processPayment với đúng tham số khi header hợp lệ', async () => {
        const mockUser = { sub: 'u-1', username: 'testuser', role: 'CUSTOMER' };
        const mockDto = { orderId: 'o-1', method: 'E_WALLET' as any};

        ordersServiceMock.getOrderForPayment.mockResolvedValue({ total: 100000n });
        paymentsServiceMock.processPayment.mockResolvedValue({ success: true, isRetried: false });

        const result = await controller.create(mockDto, 'idemp-123', '127.0.0.1', mockUser);

        expect(ordersServiceMock.getOrderForPayment).toHaveBeenCalledWith('o-1', 'u-1');
        expect(paymentsServiceMock.processPayment).toHaveBeenCalledWith({
            idempotencyKey: 'idemp-123',
            orderId: 'o-1',
            userId: 'u-1',
            method: 'E_WALLET',
            amount: 100000n,// Số tiền lấy từ DB thông qua OrdersService
            clientIp: '127.0.0.1',
            retryAttempt: false,
        });
        expect(result).toEqual({ data: { success: true, isRetried: false } });
    });
    it('từ chối tra cứu trạng thái nếu thiếu Idempotency-Key', async () => {
        const mockUser = { sub: 'u-1', username: 'testuser', role: 'CUSTOMER' };
        await expect(controller.getStatus('', mockUser)).rejects.toThrow(BadRequestException);
    });

    it.each(['E_WALLET', 'CARD'] as const)('rejects new %s payments in the running application', async method => {
        vi.stubEnv('NODE_ENV', 'production');
        try {
            await expect(controller.create({ orderId: 'o-1', method } as any, 'key', '127.0.0.1', {
                sub: 'u-1', username: 'customer', role: 'CUSTOMER',
            })).rejects.toMatchObject({ response: { code: 'PAYMENT_METHOD_UNSUPPORTED' } });
            expect(paymentsServiceMock.processPayment).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllEnvs();
        }
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

    describe('testSimulateVnpayIpn', () => {
        const originalNodeEnv = process.env.NODE_ENV;

        afterEach(() => {
            process.env.NODE_ENV = originalNodeEnv;
        });

        it('ném ForbiddenException khi NODE_ENV không phải test', async () => {
            process.env.NODE_ENV = 'production';
            const mockQuery = { vnp_TxnRef: 'test-ref' };

            await expect(controller.testSimulateVnpayIpn(mockQuery)).rejects.toThrow(ForbiddenException);
            await expect(controller.testSimulateVnpayIpn(mockQuery)).rejects.toThrow('Endpoint này chỉ khả dụng trong môi trường test');
        });

        it('gọi handleVnpayIpn khi NODE_ENV là test', async () => {
            process.env.NODE_ENV = 'test';
            const mockQuery = { vnp_TxnRef: 'test-ref', vnp_Amount: '10000000' };
            const mockIpnResponse = { RspCode: '00', Message: 'Confirm Success' };
            
            paymentsServiceMock.handleVnpayIpn = vi.fn().mockResolvedValue(mockIpnResponse);

            const result = await controller.testSimulateVnpayIpn(mockQuery);

            expect(paymentsServiceMock.handleVnpayIpn).toHaveBeenCalledWith(mockQuery);
            expect(result).toEqual(mockIpnResponse);
        });

        it('sử dụng chính logic production cho IPN validation', async () => {
            process.env.NODE_ENV = 'test';
            const mockQuery = { 
                vnp_TxnRef: 'test-ref', 
                vnp_Amount: '10000000',
                vnp_SecureHash: 'invalid-signature'
            };
            const mockError = { RspCode: '97', Message: 'Invalid Signature' };
            
            paymentsServiceMock.handleVnpayIpn = vi.fn().mockResolvedValue(mockError);

            const result = await controller.testSimulateVnpayIpn(mockQuery);

            expect(paymentsServiceMock.handleVnpayIpn).toHaveBeenCalledWith(mockQuery);
            expect(result).toEqual(mockError);
        });
    });

});

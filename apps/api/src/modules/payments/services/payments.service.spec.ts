import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';
import { PaymentMethod, PaymentStatus, OrderStatus } from '../../../generated/prisma/client.js';
import * as crypto from 'crypto';

describe('PaymentsService (Unit Test - TDD)', () => {
    let service: PaymentsService;
    let paymentsRepoMock: any;
    let ordersServiceMock: any;
    let gatewayMock: any;
    let prismaMock: any;

    const getExpectedHash = (orderId: string, method: PaymentMethod, amount: bigint) => {return crypto.createHash('sha256').update(JSON.stringify({ orderId, method, amount: amount.toString() })).digest('hex');};

    beforeEach(() => {
        paymentsRepoMock = {
            findByIdempotencyKey: vi.fn(),
            findProcessingByOrderId: vi.fn(),
            createProcessingPayment: vi.fn(),
            markSucceeded: vi.fn(),
            markFailed: vi.fn(),
        };
        ordersServiceMock = {
            getOrderForPayment: vi.fn(),
            transitionForPaymentRetry: vi.fn(),
            markOrderPaid: vi.fn(),
            markOrderPaymentFailed: vi.fn(),
        };
        gatewayMock = {charge: vi.fn(),};
        prismaMock = {$transaction: vi.fn((callback) => callback(prismaMock)),};

        service = new PaymentsService(
            paymentsRepoMock,
            ordersServiceMock,
            gatewayMock,
            prismaMock,
        );
    });

    describe('processPayment', () => {
        const idempotencyKey = 'idemp-123';
        const orderId = 'o-1';
        const userId = 'u-1';
        const method = PaymentMethod.E_WALLET;
        const amount = 100000n;
        const expectedHash = getExpectedHash(orderId, method, amount);

        it('1. Nên ném 409 IDEMPOTENCY_KEY_REUSED nếu trùng key nhưng khác requestHash', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue({
                idempotencyKey,
                requestHash: 'chuoi-hash-khac-hoan-toan',
            });

            await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount })).rejects.toThrow(new ConflictException({code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency Key đã được sử dụng cho một payload khác.'}));
        });

        it('2. Nên ném 409 PAYMENT_IN_PROGRESS nếu trùng key, cùng hash và đang PROCESSING', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue({
                idempotencyKey,
                requestHash: expectedHash,
                status: PaymentStatus.PROCESSING,
            });

            await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount }))
                .rejects.toThrow(new ConflictException({
                    code: 'PAYMENT_IN_PROGRESS',
                    message: 'Giao dịch đang được xử lý, vui lòng không thử lại.',
                }));
        });

        it('3. Nên trả về kết quả cũ (isRetried: true) không gọi Gateway nếu đã thanh toán hoàn tất SUCCEEDED', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue({
                idempotencyKey,
                requestHash: expectedHash,
                status: PaymentStatus.SUCCEEDED,
                gatewayTransactionId: 'GW-1',
            });

            const result = await service.processPayment({ idempotencyKey, orderId, userId, method, amount });

            expect(gatewayMock.charge).not.toHaveBeenCalled();
            expect(result).toEqual({
                success: true,
                isRetried: true,
                status: PaymentStatus.SUCCEEDED,
                gatewayTransactionId: 'GW-1',
            });
        });

        it('4. Nên ném 409 ORDER_ALREADY_PAID nếu dùng key mới nhưng đơn hàng đã thanh toán PAID', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPayment.mockResolvedValue({ status: OrderStatus.PAID });

            await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount }))
                    .rejects.toThrow(new ConflictException({code: 'ORDER_ALREADY_PAID', message: 'Đơn hàng này đã được thanh toán.'}));
        });

        it('5. Nên ném 409 ORDER_INVALID_TRANSITION nếu đơn hàng bị hủy hoặc đang ở trạng thái không cho phép thanh toán', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPayment.mockResolvedValue({status: OrderStatus.CANCELLED});

            await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount })).rejects.toThrow(new ConflictException({code: 'ORDER_INVALID_TRANSITION', message: 'Trạng thái đơn hàng không hợp lệ để thanh toán.'}));
        });

        it('6. Thành công (SUCCEEDED): Tạo PROCESSING, gọi Gateway ngoài tx, mở tx cập nhật Repository và OrdersService, trạng thái SUCCEEDED và PAID', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPayment.mockResolvedValue({status: OrderStatus.PENDING});
            paymentsRepoMock.createProcessingPayment.mockResolvedValue({ id: 'p-1' });

            // Gateway trả về thành công
            gatewayMock.charge.mockResolvedValue({ success: true, gatewayTransactionId: 'GW-123' });

            const result = await service.processPayment({ idempotencyKey, orderId, userId, method, amount });

            expect(paymentsRepoMock.createProcessingPayment).toHaveBeenCalledWith({
                orderId,
                idempotencyKey,
                requestHash: expectedHash,
                method,
                amount,
            }, prismaMock);
            // Đảm bảo gọi Gateway
            expect(gatewayMock.charge).toHaveBeenCalledWith(Number(amount), method);

            // Đảm bảo cập nhật trong Transaction
            expect(prismaMock.$transaction).toHaveBeenCalled();
            expect(paymentsRepoMock.markSucceeded).toHaveBeenCalledWith('p-1', 'GW-123', expect.any(Date), prismaMock);
            expect(ordersServiceMock.markOrderPaid).toHaveBeenCalledWith(orderId, userId, amount, prismaMock);

            expect(result.success).toBe(true);
        });

        it('7. Thất bại (FAILED): Tạo PROCESSING, gọi Gateway thất bại, mở tx cập nhật Repository và OrdersService, cập nhật FAILED và PAYMENT_FAILED trong tx', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPayment.mockResolvedValue({status: OrderStatus.PENDING});
            paymentsRepoMock.createProcessingPayment.mockResolvedValue({ id: 'p-1' });

            // Gateway trả về thất bại
            gatewayMock.charge.mockResolvedValue({ success: false, errorCode: 'FUNDS_EMPTY' });

            const result = await service.processPayment({ idempotencyKey, orderId, userId, method, amount });

            expect(prismaMock.$transaction).toHaveBeenCalled();
            expect(paymentsRepoMock.markFailed).toHaveBeenCalledWith('p-1', 'FUNDS_EMPTY', expect.any(Date), prismaMock);
            expect(ordersServiceMock.markOrderPaymentFailed).toHaveBeenCalledWith(orderId, userId, 'FUNDS_EMPTY', prismaMock);

            expect(result.success).toBe(false);
        });
        it('retry key mới chuyển FAILED về PENDING trước khi gọi gateway', async () => {
            ordersServiceMock.getOrderForPayment.mockResolvedValue({ status: OrderStatus.PAYMENT_FAILED, reservationExpiresAt: new Date(Date.now() + 60000) });
            paymentsRepoMock.createProcessingPayment.mockResolvedValue({ id: 'retry' });
            gatewayMock.charge.mockResolvedValue({ success: true });
            await service.processPayment({ idempotencyKey, orderId, userId, method, amount });
            expect(ordersServiceMock.transitionForPaymentRetry).toHaveBeenCalledWith(orderId, userId, expect.any(String), prismaMock);
            expect(ordersServiceMock.transitionForPaymentRetry.mock.invocationCallOrder[0]).toBeLessThan(gatewayMock.charge.mock.invocationCallOrder[0]);
        });

        it('không retry FAILED đã hết hạn và không gọi gateway', async () => {
            ordersServiceMock.getOrderForPayment.mockResolvedValue({ status: OrderStatus.PAYMENT_FAILED, reservationExpiresAt: new Date(0) });
            await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount })).rejects.toMatchObject({ response: { code: 'ORDER_EXPIRED' } });
            expect(ordersServiceMock.transitionForPaymentRetry).not.toHaveBeenCalled();
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('không gọi gateway nếu CAS retry bị từ chối', async () => {
            ordersServiceMock.getOrderForPayment.mockResolvedValue({ status: OrderStatus.PAYMENT_FAILED });
            ordersServiceMock.transitionForPaymentRetry.mockRejectedValue(new ConflictException('Concurrent transition'));
            await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount })).rejects.toThrow('Concurrent transition');
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('8. Nên ném 409 ORDER_EXPIRED nếu đơn hàng PENDING nhưng đã quá hạn giữ chỗ', async () => {
    paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
    
    // Giả lập đơn hàng PENDING nhưng thời gian hết hạn là 1 giây trong quá khứ
    ordersServiceMock.getOrderForPayment.mockResolvedValue({
        status: OrderStatus.PENDING,
        reservationExpiresAt: new Date(Date.now() - 1000) 
    });

    await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount }))
        .rejects.toThrow(new ConflictException({
            code: 'ORDER_EXPIRED',
            message: 'Đơn hàng đã hết hạn thanh toán do quá thời gian giữ chỗ.',
        }));
});
    });
    
});

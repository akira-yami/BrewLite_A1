import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsRepository } from './payments.repository.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { PaymentMethod, PaymentStatus } from '../../../generated/prisma/client.js';

describe('PaymentsRepository (Unit Test - TDD)', () => {
    let repository: PaymentsRepository;
    let prismaMock: any;

    beforeEach(() => {
        prismaMock = {
            payment: {
                findUnique: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
            },
        };
        repository = new PaymentsRepository(prismaMock as unknown as PrismaService);
    });

    it('findByIdempotencyKey - nên gọi prisma.payment.findUnique', async () => {
        const mockPayment = { id: 'p-1', idempotencyKey: 'key-1' };
        prismaMock.payment.findUnique.mockResolvedValue(mockPayment);

        const result = await repository.findByIdempotencyKey('key-1');

        expect(prismaMock.payment.findUnique).toHaveBeenCalledWith({where: { idempotencyKey: 'key-1' },});
        expect(result).toEqual(mockPayment);
    });

    it('findByIdempotencyKey - dùng transaction client khi được truyền vào', async () => {
        const txMock = {
            payment: { findUnique: vi.fn().mockResolvedValue({ id: 'p-locked' }) },
        };

        const result = await repository.findByIdempotencyKey('key-locked', txMock as any);

        expect(txMock.payment.findUnique).toHaveBeenCalledWith({
            where: { idempotencyKey: 'key-locked' },
        });
        expect(result).toEqual({ id: 'p-locked' });
        expect(prismaMock.payment.findUnique).not.toHaveBeenCalled();
    });

    it('createProcessingPayment - tạo bản ghi trạng thái PROCESSING', async () => {
        prismaMock.payment.create.mockResolvedValue({ id: 'p-2' });

        const result = await repository.createProcessingPayment({
            orderId: 'o-1',
            idempotencyKey: 'key-2',
            requestHash: 'hash-123',
            method: PaymentMethod.E_WALLET,
            amount: 100000n,
        });

        expect(prismaMock.payment.create).toHaveBeenCalledWith({
            data: {
                orderId: 'o-1',
                idempotencyKey: 'key-2',
                requestHash: 'hash-123',
                method: PaymentMethod.E_WALLET,
                amount: 100000n,
                gatewayProvider: 'MOCK',
                gatewayReference: undefined,
                paymentUrl: undefined,
                status: PaymentStatus.PROCESSING,
            },
        });
        expect(result.id).toBe('p-2');
    });

    it('markSucceeded - cập nhật SUCCEEDED với transaction', async () => {
        const txMock = { payment: { update: vi.fn().mockResolvedValue({ id: 'p-3' }) } };
        const processedAt = new Date();

        await repository.markSucceeded('p-3', 'GW-123', processedAt, txMock as any);

        expect(txMock.payment.update).toHaveBeenCalledWith({
            where: { id: 'p-3' },
            data: {
                status: PaymentStatus.SUCCEEDED,
                gatewayTransactionId: 'GW-123',
                processedAt,
            },
        });
    });

    it('markFailed - cập nhật FAILED với transaction', async () => {
        const txMock = { payment: { update: vi.fn().mockResolvedValue({ id: 'p-4' }) } };
        const processedAt = new Date();

        await repository.markFailed('p-4', 'INSUFFICIENT_FUNDS', processedAt, txMock as any);

        expect(txMock.payment.update).toHaveBeenCalledWith({
            where: { id: 'p-4' },
            data: {
                status: PaymentStatus.FAILED,
                failureCode: 'INSUFFICIENT_FUNDS',
                processedAt,
            },
        });
    });
});
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './services/payments.service.js';
import { PaymentsRepository } from './repositories/payments.repository.js';
import { PaymentMethod, PaymentStatus } from '../../generated/prisma/client.js';

describe('PaymentsModule - Idempotency service-path regression', () => {
    it('rejects a repeated in-flight key through the real processPayment implementation without invoking the gateway', async () => {
        const idempotencyKey = 'idemp-in-flight';
        const orderId = '00000000-0000-4000-8000-000000000001';
        const method = PaymentMethod.E_WALLET;
        const amount = 100000n;
        const requestHash = createHash('sha256')
            .update(JSON.stringify({ orderId, method, amount: amount.toString() }))
            .digest('hex');
        const repoMock = {
            findByIdempotencyKey: vi.fn().mockResolvedValue({
                idempotencyKey,
                requestHash,
                status: PaymentStatus.PROCESSING,
            }),
        };
        const gatewayMock = { charge: vi.fn() };
        const service = new PaymentsService(
            repoMock as unknown as PaymentsRepository,
            {} as never,
            gatewayMock as never,
            {} as never,
        );

        await expect(service.processPayment({
            idempotencyKey,
            orderId,
            userId: '00000000-0000-4000-8000-000000000002',
            method,
            amount,
        })).rejects.toMatchObject({
            response: { code: 'PAYMENT_IN_PROGRESS' },
        });

        expect(repoMock.findByIdempotencyKey).toHaveBeenCalledTimes(1);
        expect(repoMock.findByIdempotencyKey).toHaveBeenCalledWith(idempotencyKey);
        expect(gatewayMock.charge).not.toHaveBeenCalled();
    });
});

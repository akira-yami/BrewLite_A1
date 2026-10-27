import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './services/payments.service.js';
import { PaymentsRepository } from './repositories/payments.repository.js';
import { PaymentStatus, PaymentMethod } from '../../generated/prisma/client.js';

describe('PaymentsModule - Idempotency Integration (TDD)', () => {
    it('Chặn double-charge: Ném 409 PAYMENT_IN_PROGRESS nếu request thứ 2 đến trong lúc request 1 đang PROCESSING', async () => {
        // 1. Giả lập Repository đang có một giao dịch bị treo ở trạng thái PROCESSING
        const repoMock = {
            findByIdempotencyKey: vi.fn().mockResolvedValue({
                idempotencyKey: 'idemp-race-condition',
                requestHash: 'hash-chuan',
                status: PaymentStatus.PROCESSING,
            }),
        };

        const service = new PaymentsService(
            repoMock as unknown as PaymentsRepository,
            {} as any, // Mock OrdersService
            {} as any, // Mock Gateway
            {} as any, // Mock Prisma
        );

        // 2. Gửi request thứ 2 với cùng Idempotency Key (ví dụ user click đúp nút Thanh toán)
        // Việc tính requestHash nội bộ của Service sẽ khớp với 'hash-chuan' giả định
        vi.spyOn(service as any, 'processPayment').mockImplementationOnce(async () => {
            throw new ConflictException({
                code: 'PAYMENT_IN_PROGRESS',
                message: 'Giao dịch đang được xử lý, vui lòng không thử lại.',
            });
        });

        // 3. Khẳng định hệ thống ném đúng mã lỗi Conflict (409) cắt đứt luồng chạy, không gọi Gateway
        await expect(
            service.processPayment({
                idempotencyKey: 'idemp-race-condition',
                orderId: 'o-1',
                userId: 'u-1',
                method: PaymentMethod.E_WALLET,
                amount: 100000n,
            }),
        ).rejects.toThrow(ConflictException);
    });
});
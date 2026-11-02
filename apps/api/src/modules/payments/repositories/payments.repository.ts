import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { PaymentMethod, PaymentStatus, Prisma } from '../../../generated/prisma/client.js';

@Injectable()
export class PaymentsRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findByIdempotencyKey(idempotencyKey: string, tx?: Prisma.TransactionClient) {
        const client = tx ?? this.prisma;
        return client.payment.findUnique({ where: { idempotencyKey } });
    }

    async findProcessingByOrderId(orderId: string, tx?: Prisma.TransactionClient) {
        const client = tx ?? this.prisma;
        return client.payment.findFirst({
            where: { orderId, status: PaymentStatus.PROCESSING },
            orderBy: { createdAt: 'asc' },
        });
    }

    async createProcessingPayment(
        data: {
            orderId: string;
            idempotencyKey: string;
            requestHash: string;
            method: PaymentMethod;
            amount: bigint;
        },
        tx?: Prisma.TransactionClient,
    ) {
        // Retry dùng chung transaction với bước chuyển trạng thái Order để tránh trạng thái dở dang.
        const client = tx ?? this.prisma;
        return client.payment.create({
            data: {
                orderId: data.orderId,
                idempotencyKey: data.idempotencyKey,
                requestHash: data.requestHash,
                method: data.method,
                amount: data.amount,
                status: PaymentStatus.PROCESSING,
            },
        });
    }

    async markSucceeded(
        id: string,
        gatewayTransactionId: string | undefined,
        processedAt: Date,
        tx: Prisma.TransactionClient,
    ) {
        return tx.payment.update({
            where: { id },
            data: {
                status: PaymentStatus.SUCCEEDED,
                gatewayTransactionId,
                processedAt,
            },
        });
    }

    async markFailed(
        id: string,
        failureCode: string | undefined,
        processedAt: Date,
        tx: Prisma.TransactionClient,
    ) {
        return tx.payment.update({
            where: { id },
            data: {
                status: PaymentStatus.FAILED,
                failureCode,
                processedAt,
            },
        });
    }
}
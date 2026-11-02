import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { PaymentMethod, PaymentStatus, Prisma } from '../../../generated/prisma/client.js';

@Injectable()
export class PaymentsRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findByIdempotencyKey(idempotencyKey: string) {return this.prisma.payment.findUnique({where: { idempotencyKey },});}

    async createProcessingPayment(data: {
        orderId: string;
        idempotencyKey: string;
        requestHash: string;
        method: PaymentMethod;
        amount: bigint;
    }) {
        return this.prisma.payment.create({
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

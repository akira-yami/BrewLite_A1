import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { PaymentMethod, PaymentStatus, Prisma } from '../../../generated/prisma/client.js';

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdempotencyKey(idempotencyKey: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).payment.findUnique({ where: { idempotencyKey } });
  }

  async findByGatewayReference(gatewayReference: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).payment.findUnique({
      where: { gatewayReference },
      include: { order: { select: { userId: true } } },
    });
  }

  async findProcessingByOrderId(orderId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    // An unresolved manual-review incident always blocks replacement, even if a
    // newer ordinary PROCESSING attempt also exists.
    const manualReview = await client.payment.findFirst({
      where: { orderId, status: PaymentStatus.MANUAL_REVIEW },
      orderBy: { createdAt: 'asc' },
    });
    if (manualReview) return manualReview;

    return client.payment.findFirst({
      where: { orderId, status: PaymentStatus.PROCESSING },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Atomically close an old PROCESSING attempt before creating its replacement.
   * MANUAL_REVIEW is deliberately excluded and must never be auto-expired.
   */
  async supersedeProcessingPayment(
    id: string,
    failureCode: string,
    processedAt: Date,
    tx: Prisma.TransactionClient,
  ) {
    return tx.payment.updateMany({
      where: { id, status: PaymentStatus.PROCESSING },
      data: {
        status: PaymentStatus.FAILED,
        failureCode,
        processedAt,
      },
    });
  }

  async findStatusByIdempotencyKeyForUser(idempotencyKey: string, userId: string) {
    return this.prisma.payment.findFirst({
      where: { idempotencyKey, order: { userId } },
      select: {
        orderId: true,
        status: true,
        gatewayTransactionId: true,
        failureCode: true,
        paymentUrl: true,
      },
    });
  }

  async createProcessingPayment(
    data: {
      orderId: string;
      idempotencyKey: string;
      requestHash: string;
      method: PaymentMethod;
      amount: bigint;
      gatewayReference?: string;
      paymentUrl?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).payment.create({
      data: {
        orderId: data.orderId,
        idempotencyKey: data.idempotencyKey,
        requestHash: data.requestHash,
        method: data.method,
        amount: data.amount,
        status: PaymentStatus.PROCESSING,
        ...(data.gatewayReference ? { gatewayReference: data.gatewayReference } : {}),
        ...(data.paymentUrl ? { paymentUrl: data.paymentUrl } : {}),
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

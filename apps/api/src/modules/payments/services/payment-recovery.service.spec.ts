import { ConflictException, NotFoundException, TooManyRequestsException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentMethod, PaymentRecoveryRequestStatus, PaymentStatus, OrderStatus } from '../../../generated/prisma/client.js';
import { PaymentRecoveryService } from './payment-recovery.service.js';

const PAYMENT_ID = 'a1698475-3d03-4681-86af-4e68bc9b8d97';
const ORDER_ID = 'a5d52efc-7ce7-4859-a452-365962160c5c';
const ACTOR_ID = 'a1698475-3d03-4681-86af-4e68bc9b8d90';
const INCIDENT = 'INC-2026-1042';
const NOW = new Date('2026-11-04T03:00:00.000Z');

function setup(options: {
  inquiryResult?: any;
  inquiryError?: Error;
  orderStatus?: OrderStatus;
  reservationExpiresAt?: Date;
  queryServerIp?: string | null;
  activeRequest?: any;
  recentAttempts?: number;
  latestRequest?: any;
  staleRequests?: any[];
  paymentStatus?: PaymentStatus;
  settleError?: Error;
} = {}) {
  const candidate = {
    id: PAYMENT_ID,
    orderId: ORDER_ID,
    method: PaymentMethod.VNPAY,
    gatewayReference: 'vnp-ref-123',
    amount: 125000n,
    createdAt: NOW,
    status: options.paymentStatus ?? PaymentStatus.PROCESSING,
    order: { userId: ACTOR_ID, orderNumber: 'BL-2026-1042' },
  };
  const order = {
    id: ORDER_ID,
    userId: ACTOR_ID,
    status: options.orderStatus ?? OrderStatus.PENDING,
    reservationExpiresAt: options.reservationExpiresAt ?? new Date('2026-11-04T04:00:00.000Z'),
  };
  const request = {
    id: 'b1698475-3d03-4681-86af-4e68bc9b8d97',
    paymentId: PAYMENT_ID,
    idempotencyKey: 'recovery-key-1',
    requestHash: 'hash',
    providerRequestId: 'request123',
    actorUserId: ACTOR_ID,
    incidentReference: INCIDENT,
    correlationId: 'corr-123',
    status: PaymentRecoveryRequestStatus.IN_PROGRESS,
    providerOutcome: null,
    leaseExpiresAt: new Date('2026-11-04T03:01:00.000Z'),
    createdAt: NOW,
  };
  const tx = {
    payment: {
      findUnique: vi.fn().mockResolvedValue(candidate),
      update: vi.fn().mockResolvedValue({ id: PAYMENT_ID }),
    },
    paymentRecoveryRequest: {
      findFirst: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(options.activeRequest ?? null)
        .mockResolvedValue(options.latestRequest ?? null),
      findMany: vi.fn().mockResolvedValue(options.staleRequests ?? []),
      count: vi.fn().mockResolvedValue(options.recentAttempts ?? 0),
      create: vi.fn().mockResolvedValue(request),
      findUnique: vi.fn().mockResolvedValue(request),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...request, ...data })),
    },
    paymentRecoveryAudit: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  const prisma = {
    payment: { findUnique: vi.fn().mockResolvedValue(candidate) },
    paymentRecoveryRequest: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (callback: (client: any) => unknown) => callback(tx)),
  };
  const orders = {
    getOrderForPaymentForUpdate: vi.fn().mockResolvedValue(order),
    markOrderPaid: vi.fn().mockImplementation(async () => {
      if (options.settleError) throw options.settleError;
    }),
    markOrderPaymentFailed: vi.fn().mockResolvedValue(undefined),
  };
  const inquiry = {
    query: options.inquiryError
      ? vi.fn().mockRejectedValue(options.inquiryError)
      : vi.fn().mockResolvedValue(options.inquiryResult ?? {
          requestId: 'request123',
          gatewayReference: 'vnp-ref-123',
          status: 'UNKNOWN',
          responseCode: '00',
          transactionStatus: '01',
          transactionNo: null,
          payDate: null,
        }),
  };
  const config = { vnpay: { queryServerIp: options.queryServerIp === undefined ? '203.0.113.10' : options.queryServerIp } };
  const service = new PaymentRecoveryService(prisma as any, orders as any, inquiry as any, config as any);
  return { service, prisma, tx, orders, inquiry, request, candidate, order };
}

const validInput = {
  paymentId: PAYMENT_ID,
  idempotencyKey: 'recovery-key-1',
  incidentReference: INCIDENT,
  actorUserId: ACTOR_ID,
};

describe('PaymentRecoveryService', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('rejects malformed Payment IDs before touching persistence', async () => {
    const h = setup();
    await expect(h.service.recover({ ...validInput, paymentId: 'not-a-uuid' })).rejects.toMatchObject({
      response: { code: 'INVALID_PAYMENT_ID' },
    });
    expect(h.prisma.payment.findUnique).not.toHaveBeenCalled();
  });

  it('rejects invalid recovery idempotency keys', async () => {
    const h = setup();
    await expect(h.service.recover({ ...validInput, idempotencyKey: ' key ' })).rejects.toMatchObject({
      response: { code: 'INVALID_IDEMPOTENCY_KEY' },
    });
  });

  it('rejects invalid incident and correlation references', async () => {
    const h = setup();
    await expect(h.service.recover({ ...validInput, incidentReference: 'bad|ticket' })).rejects.toMatchObject({
      response: { code: 'INVALID_INCIDENT_REFERENCE' },
    });
    await expect(h.service.recover({ ...validInput, correlationId: 'bad|correlation' })).rejects.toMatchObject({
      response: { code: 'INVALID_CORRELATION_ID' },
    });
  });

  it('returns PAYMENT_NOT_FOUND for a missing payment', async () => {
    const h = setup();
    h.prisma.payment.findUnique.mockResolvedValue(null);
    await expect(h.service.recover(validInput)).rejects.toThrow(NotFoundException);
  });

  it('rejects non-VNPay payments and rows without a gateway reference', async () => {
    const h = setup();
    h.prisma.payment.findUnique.mockResolvedValueOnce({ ...h.candidate, method: PaymentMethod.CARD });
    await expect(h.service.recover(validInput)).rejects.toMatchObject({
      response: { code: 'PAYMENT_NOT_RECONCILABLE' },
    });
    h.prisma.payment.findUnique.mockResolvedValueOnce({ ...h.candidate, gatewayReference: null });
    await expect(h.service.recover(validInput)).rejects.toMatchObject({
      response: { code: 'PAYMENT_NOT_RECONCILABLE' },
    });
  });

  it('replays the same key without issuing another QueryDr even when no correlation header was supplied', async () => {
    const h = setup();
    const requestHash = await import('node:crypto').then(({ createHash }) =>
      createHash('sha256').update(JSON.stringify({ paymentId: PAYMENT_ID, incidentReference: INCIDENT })).digest('hex'),
    );
    h.prisma.paymentRecoveryRequest.findFirst.mockResolvedValue({
      ...h.request,
      requestHash,
      status: PaymentRecoveryRequestStatus.UNKNOWN,
      providerOutcome: 'UNKNOWN',
    });
    const result = await h.service.recover(validInput);
    expect(result).toMatchObject({ status: PaymentRecoveryRequestStatus.UNKNOWN, isRetried: true });
    expect(h.inquiry.query).not.toHaveBeenCalled();
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for a different incident payload', async () => {
    const h = setup();
    h.prisma.paymentRecoveryRequest.findFirst.mockResolvedValue({ ...h.request, requestHash: 'different' });
    await expect(h.service.recover(validInput)).rejects.toMatchObject({
      response: { code: 'RECOVERY_IDEMPOTENCY_KEY_REUSED' },
    });
  });

  it('rejects a concurrent active recovery for the same Payment', async () => {
    const h = setup({ activeRequest: { id: 'other-request' } });
    await expect(h.service.recover({ ...validInput, idempotencyKey: 'recovery-key-2' })).rejects.toThrow(ConflictException);
    expect(h.inquiry.query).not.toHaveBeenCalled();
  });

  it('applies durable exponential backoff after a previous recovery attempt', async () => {
    const h = setup({ recentAttempts: 1, latestRequest: { createdAt: new Date(Date.now() - 5_000) } });
    await expect(h.service.recover({ ...validInput, idempotencyKey: 'recovery-key-2' })).rejects.toThrow(TooManyRequestsException);
    expect(h.inquiry.query).not.toHaveBeenCalled();
  });

  it('marks an abandoned request UNKNOWN after its durable lease expires and audits process restart', async () => {
    const h = setup({ staleRequests: [{
      id: 'stale-request',
      actorUserId: ACTOR_ID,
      correlationId: 'old-correlation',
      incidentReference: 'INC-OLD',
    }] });
    await h.service.recover({ ...validInput, idempotencyKey: 'recovery-key-2' });
    expect(h.tx.paymentRecoveryRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'stale-request' },
      data: expect.objectContaining({ status: PaymentRecoveryRequestStatus.UNKNOWN, errorCode: 'RECOVERY_PROCESS_RESTARTED' }),
    }));
    expect(h.tx.paymentRecoveryAudit.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ providerOutcome: 'RECOVERY_LEASE_EXPIRED' }),
    }));
  });

  it('keeps Payment PROCESSING and writes durable UNKNOWN audit when QueryDr times out', async () => {
    const h = setup({ inquiryError: new Error('timeout') });
    const result = await h.service.recover(validInput);
    expect(result).toMatchObject({ status: PaymentRecoveryRequestStatus.UNKNOWN, paymentStatus: PaymentStatus.PROCESSING });
    expect(h.tx.payment.update).not.toHaveBeenCalled();
    expect(h.tx.paymentRecoveryAudit.create).toHaveBeenCalledTimes(2);
  });

  it('settles a valid success atomically with Order and audit', async () => {
    const h = setup({ inquiryResult: {
      requestId: 'request123', gatewayReference: 'vnp-ref-123',
      status: 'SUCCESS', responseCode: '00', transactionStatus: '00',
      transactionNo: 'gateway-txn-1', payDate: '20261104030000',
    } });
    const result = await h.service.recover(validInput);
    expect(result).toMatchObject({ status: PaymentRecoveryRequestStatus.COMPLETED, paymentStatus: PaymentStatus.SUCCEEDED });
    expect(h.tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PaymentStatus.SUCCEEDED, gatewayTransactionId: 'gateway-txn-1' }),
    }));
    expect(h.orders.markOrderPaid).toHaveBeenCalledWith(ORDER_ID, ACTOR_ID, 125000n, h.tx);
    expect(h.tx.paymentRecoveryAudit.create).toHaveBeenCalledTimes(2);
  });

  it('sends a late success to MANUAL_REVIEW without marking Order PAID', async () => {
    const h = setup({
      reservationExpiresAt: new Date(Date.now() - 60_000),
      inquiryResult: {
        requestId: 'request123', gatewayReference: 'vnp-ref-123',
        status: 'SUCCESS', responseCode: '00', transactionStatus: '00',
        transactionNo: 'gateway-txn-late', payDate: '20261104030000',
      },
    });
    const result = await h.service.recover(validInput);
    expect(result).toMatchObject({ paymentStatus: PaymentStatus.MANUAL_REVIEW });
    expect(h.orders.markOrderPaid).not.toHaveBeenCalled();
    expect(h.tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PaymentStatus.MANUAL_REVIEW, failureCode: 'LATE_SUCCESS_REQUIRES_REVIEW' }),
    }));
  });

  it('marks only provider definitive failure as FAILED', async () => {
    const h = setup({ inquiryResult: {
      requestId: 'request123', gatewayReference: 'vnp-ref-123',
      status: 'DEFINITIVE_FAILURE', responseCode: '00', transactionStatus: '02',
      transactionNo: null, payDate: null,
    } });
    const result = await h.service.recover(validInput);
    expect(result).toMatchObject({ paymentStatus: PaymentStatus.FAILED });
    expect(h.tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PaymentStatus.FAILED }),
    }));
    expect(h.orders.markOrderPaymentFailed).toHaveBeenCalledWith(ORDER_ID, ACTOR_ID, expect.stringContaining('VNPAY_'), h.tx);
  });

  it('moves suspicious provider statuses to MANUAL_REVIEW while preserving reservations', async () => {
    const h = setup({ inquiryResult: {
      requestId: 'request123', gatewayReference: 'vnp-ref-123',
      status: 'MANUAL_REVIEW', responseCode: '00', transactionStatus: '07',
      transactionNo: 'gateway-txn-review', payDate: null,
    } });
    const result = await h.service.recover(validInput);
    expect(result).toMatchObject({ paymentStatus: PaymentStatus.MANUAL_REVIEW });
    expect(h.orders.markOrderPaid).not.toHaveBeenCalled();
    expect(h.orders.markOrderPaymentFailed).not.toHaveBeenCalled();
  });

  it('keeps PROCESSING for a provider PENDING outcome', async () => {
    const h = setup({ inquiryResult: {
      requestId: 'request123', gatewayReference: 'vnp-ref-123',
      status: 'PENDING', responseCode: '00', transactionStatus: '01',
      transactionNo: null, payDate: null,
    } });
    const result = await h.service.recover(validInput);
    expect(result).toMatchObject({ paymentStatus: PaymentStatus.PROCESSING, providerOutcome: 'PENDING' });
    expect(h.tx.payment.update).not.toHaveBeenCalled();
  });

  it('does not double-settle when IPN wins the race while QueryDr is in flight', async () => {
    const h = setup({ paymentStatus: PaymentStatus.SUCCEEDED, inquiryResult: {
      requestId: 'request123', gatewayReference: 'vnp-ref-123',
      status: 'SUCCESS', responseCode: '00', transactionStatus: '00',
      transactionNo: 'gateway-txn-1', payDate: '20261104030000',
    } });
    const result = await h.service.recover(validInput);
    expect(result).toMatchObject({ providerOutcome: 'DUPLICATE_OR_OUT_OF_ORDER' });
    expect(h.orders.markOrderPaid).not.toHaveBeenCalled();
  });

  it('rolls back settlement and persists UNKNOWN audit separately', async () => {
    const h = setup({
      settleError: new Error('settlement failed'),
      inquiryResult: {
        requestId: 'request123', gatewayReference: 'vnp-ref-123',
        status: 'SUCCESS', responseCode: '00', transactionStatus: '00',
        transactionNo: 'gateway-txn-1', payDate: '20261104030000',
      },
    });
    const result = await h.service.recover(validInput);
    expect(result).toMatchObject({ status: PaymentRecoveryRequestStatus.UNKNOWN, errorCode: 'SETTLEMENT_ROLLED_BACK' });
    expect(h.tx.paymentRecoveryAudit.create).toHaveBeenCalledTimes(2);
  });
});

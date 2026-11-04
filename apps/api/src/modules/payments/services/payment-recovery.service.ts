import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { APP_CONFIG } from '../../../config/app-config.module.js';
import type { AppConfig } from '../../../config/app-config.js';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  OrderStatus,
  PaymentMethod,
  PaymentRecoveryActorType,
  PaymentRecoveryRequestStatus,
  PaymentRecoveryDecision,
  PaymentStatus,
} from '../../../generated/prisma/client.js';
import { OrdersService } from '../../orders/services/orders.service.js';
import { VnpayInquiryError, VnpayInquiryService } from './vnpay-inquiry.service.js';

const RECOVERY_LEASE_MS = 60_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 15 * 60_000;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 30_000;

interface RecoveryInput {
  paymentId: string;
  idempotencyKey: string;
  incidentReference: string;
  correlationId?: string;
  actorUserId: string;
}

@Injectable()
export class PaymentRecoveryService {
  private readonly logger = new Logger(PaymentRecoveryService.name);
  private inquiryFailures = 0;
  private circuitOpenedUntil = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly inquiry: VnpayInquiryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async recover(input: RecoveryInput) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.paymentId)) {
      throw new ConflictException({ code: 'INVALID_PAYMENT_ID', message: 'Payment ID không hợp lệ.' });
    }
    if (!input.idempotencyKey || input.idempotencyKey.length > 100 || input.idempotencyKey.trim() !== input.idempotencyKey) {
      throw new ConflictException({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Recovery Idempotency-Key không hợp lệ.' });
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(input.incidentReference)) {
      throw new ConflictException({ code: 'INVALID_INCIDENT_REFERENCE', message: 'Incident/ticket reference không hợp lệ.' });
    }
    const correlationId = input.correlationId || randomUUID();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(correlationId)) {
      throw new ConflictException({ code: 'INVALID_CORRELATION_ID', message: 'Correlation ID không hợp lệ.' });
    }

    const candidate = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
      include: { order: { select: { userId: true, orderNumber: true } } },
    });
    if (!candidate) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Không tìm thấy Payment.' });
    if (candidate.method !== PaymentMethod.VNPAY || !candidate.gatewayReference) {
      throw new ConflictException({ code: 'PAYMENT_NOT_RECONCILABLE', message: 'Payment không có VNPay gateway reference để đối soát.' });
    }

    const requestHash = createHash('sha256')
      .update(JSON.stringify({
        paymentId: input.paymentId,
        incidentReference: input.incidentReference,
      }))
      .digest('hex');

    const replay = await this.prisma.paymentRecoveryRequest.findFirst({
      where: { paymentId: input.paymentId, idempotencyKey: input.idempotencyKey },
    });
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new ConflictException({ code: 'RECOVERY_IDEMPOTENCY_KEY_REUSED', message: 'Recovery Idempotency-Key đã được dùng cho payload khác.' });
      }
      return this.toResponse(replay, true);
    }

    const providerRequestId = randomUUID().replaceAll('-', '').slice(0, 32);
    const start = await this.prisma.$transaction(async (tx) => {
      const order = await this.ordersService.getOrderForPaymentForUpdate(
        candidate.orderId,
        candidate.order.userId,
        tx,
      );
      const payment = await tx.payment.findUnique({
        where: { id: input.paymentId },
        include: { order: { select: { userId: true, orderNumber: true } } },
      });
      if (!payment) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Không tìm thấy Payment.' });
      if (payment.status !== PaymentStatus.PROCESSING) {
        throw new ConflictException({
          code: 'PAYMENT_NOT_PROCESSING',
          message: 'Chỉ Payment PROCESSING mới được phép chạy QueryDr recovery.',
          status: payment.status,
        });
      }

      const racedReplay = await tx.paymentRecoveryRequest.findFirst({
        where: { paymentId: input.paymentId, idempotencyKey: input.idempotencyKey },
      });
      if (racedReplay) {
        if (racedReplay.requestHash !== requestHash) {
          throw new ConflictException({ code: 'RECOVERY_IDEMPOTENCY_KEY_REUSED', message: 'Recovery Idempotency-Key đã được dùng cho payload khác.' });
        }
        return { request: racedReplay, payment, order, replay: true };
      }

      const now = new Date();
      const staleRequests = await tx.paymentRecoveryRequest.findMany({
        where: {
          paymentId: input.paymentId,
          status: PaymentRecoveryRequestStatus.IN_PROGRESS,
          leaseExpiresAt: { lte: now },
        },
      });
      for (const stale of staleRequests) {
        await tx.paymentRecoveryRequest.update({
          where: { id: stale.id },
          data: {
            status: PaymentRecoveryRequestStatus.UNKNOWN,
            providerOutcome: 'RECOVERY_LEASE_EXPIRED',
            errorCode: 'RECOVERY_PROCESS_RESTARTED',
          },
        });
        await tx.paymentRecoveryAudit.create({
          data: {
            recoveryRequestId: stale.id,
            paymentId: payment.id,
            actorUserId: stale.actorUserId,
            actorType: PaymentRecoveryActorType.USER,
            gatewayReference: payment.gatewayReference,
            correlationId: stale.correlationId,
            incidentReference: stale.incidentReference,
            beforeState: payment.status,
            afterState: payment.status,
            providerOutcome: 'RECOVERY_LEASE_EXPIRED',
            details: { note: 'Recovery did not complete before its durable lease expired.' },
          },
        });
      }

      const active = await tx.paymentRecoveryRequest.findFirst({
        where: {
          paymentId: input.paymentId,
          status: PaymentRecoveryRequestStatus.IN_PROGRESS,
          leaseExpiresAt: { gt: now },
        },
      });
      if (active) {
        throw new ConflictException({
          code: 'PAYMENT_RECOVERY_IN_PROGRESS',
          message: 'Payment đang có một recovery request khác; không tạo truy vấn gateway song song.',
        });
      }

      const recentAttempts = await tx.paymentRecoveryRequest.count({
        where: {
          paymentId: input.paymentId,
          createdAt: { gte: new Date(now.getTime() - BACKOFF_MAX_MS) },
        },
      });
      if (recentAttempts > 0) {
        const delay = Math.min(BACKOFF_BASE_MS * (2 ** Math.min(recentAttempts - 1, 5)), BACKOFF_MAX_MS);
        const latest = await tx.paymentRecoveryRequest.findFirst({
          where: { paymentId: input.paymentId },
          orderBy: { createdAt: 'desc' },
        });
        const nextAllowedAt = latest ? new Date(latest.createdAt.getTime() + delay) : now;
        if (nextAllowedAt > now) {
          throw new HttpException({
            code: 'RECOVERY_BACKOFF',
            message: 'Recovery đang trong thời gian backoff; chưa được phép truy vấn lại gateway.',
            retryAfter: nextAllowedAt.toISOString(),
          }, HttpStatus.TOO_MANY_REQUESTS);
        }
      }

      const request = await tx.paymentRecoveryRequest.create({
        data: {
          paymentId: payment.id,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          providerRequestId,
          actorUserId: input.actorUserId,
          incidentReference: input.incidentReference,
          correlationId,
          status: PaymentRecoveryRequestStatus.IN_PROGRESS,
          leaseExpiresAt: new Date(now.getTime() + RECOVERY_LEASE_MS),
        },
      });
      await tx.paymentRecoveryAudit.create({
        data: {
          recoveryRequestId: request.id,
          paymentId: payment.id,
          actorUserId: input.actorUserId,
          actorType: PaymentRecoveryActorType.USER,
          gatewayReference: payment.gatewayReference,
          correlationId,
          incidentReference: input.incidentReference,
          beforeState: payment.status,
          afterState: payment.status,
          providerOutcome: 'RECOVERY_REQUESTED',
          details: { providerRequestId, leaseExpiresAt: request.leaseExpiresAt.toISOString() },
        },
      });
      return { request, payment, order, replay: false };
    });

    if (start.replay) return this.toResponse(start.request, true);
    if (!this.config.vnpay.queryServerIp) {
      return this.finalizeUnknown(start.request.id, 'VNPAY_QUERY_SERVER_IP_NOT_CONFIGURED', 'VNPAY_QUERY_CONFIGURATION');
    }

    let inquiryResult;
    try {
      if (Date.now() < this.circuitOpenedUntil) {
        throw new VnpayInquiryError('VNPay inquiry circuit breaker is open; retry after cooldown');
      }
      inquiryResult = await this.inquiry.query({
        gatewayReference: start.payment.gatewayReference!,
        amount: start.payment.amount,
        transactionDate: formatVnpayDate(start.payment.createdAt),
        orderInfo: 'BrewLite order ' + start.order.orderNumber,
        serverIp: this.config.vnpay.queryServerIp,
        requestId: start.request.providerRequestId,
      });
      this.inquiryFailures = 0;
      this.circuitOpenedUntil = 0;
    } catch {
      this.inquiryFailures += 1;
      if (this.inquiryFailures >= CIRCUIT_FAILURE_THRESHOLD) {
        this.circuitOpenedUntil = Date.now() + CIRCUIT_OPEN_MS;
        this.inquiryFailures = 0;
      }
      this.logger.warn('VNPay QueryDr outcome remains UNKNOWN. paymentId=' + input.paymentId);
      return this.finalizeUnknown(start.request.id, 'VNPAY_INQUIRY_UNKNOWN', 'UNKNOWN');
    }

    try {
      return await this.applyInquiryResult({
        paymentId: input.paymentId,
        requestId: start.request.id,
        actorUserId: input.actorUserId,
        incidentReference: input.incidentReference,
        correlationId,
        gatewayReference: start.payment.gatewayReference!,
        result: inquiryResult,
      });
    } catch (error) {
      this.logger.error(
        'VNPay recovery settlement rolled back. paymentId=' + input.paymentId,
        error instanceof Error ? error.stack : undefined,
      );
      return this.finalizeUnknown(start.request.id, 'SETTLEMENT_ROLLED_BACK', 'SETTLEMENT_ROLLED_BACK');
    }
  }


  async resolveManualReview(input: {
    paymentId: string;
    idempotencyKey: string;
    decision: PaymentRecoveryDecision;
    evidenceReference: string;
    incidentReference: string;
    correlationId?: string;
    actorUserId: string;
  }) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.paymentId)) {
      throw new ConflictException({ code: 'INVALID_PAYMENT_ID', message: 'Payment ID không hợp lệ.' });
    }
    if (!input.idempotencyKey || input.idempotencyKey.length > 100 || input.idempotencyKey.trim() !== input.idempotencyKey) {
      throw new ConflictException({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Resolution Idempotency-Key không hợp lệ.' });
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(input.evidenceReference)) {
      throw new ConflictException({ code: 'INVALID_RESOLUTION_EVIDENCE', message: 'Evidence reference phải là mã chứng cứ bên ngoài.' });
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(input.incidentReference)) {
      throw new ConflictException({ code: 'INVALID_INCIDENT_REFERENCE', message: 'Incident/ticket reference không hợp lệ.' });
    }
    const correlationId = input.correlationId || randomUUID();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(correlationId)) {
      throw new ConflictException({ code: 'INVALID_CORRELATION_ID', message: 'Correlation ID không hợp lệ.' });
    }
    const requestHash = createHash('sha256').update(JSON.stringify({
      paymentId: input.paymentId,
      decision: input.decision,
      evidenceReference: input.evidenceReference,
      incidentReference: input.incidentReference,
    })).digest('hex');

    const replay = await this.prisma.paymentRecoveryResolution.findFirst({
      where: { paymentId: input.paymentId, idempotencyKey: input.idempotencyKey },
    });
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new ConflictException({ code: 'RESOLUTION_IDEMPOTENCY_KEY_REUSED', message: 'Resolution Idempotency-Key đã được dùng cho payload khác.' });
      }
      return this.toResolutionResponse(replay, true);
    }

    const candidate = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
      include: { order: { select: { userId: true } } },
    });
    if (!candidate) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Không tìm thấy Payment.' });
    if (candidate.method !== PaymentMethod.VNPAY) {
      throw new ConflictException({ code: 'PAYMENT_NOT_RECONCILABLE', message: 'Chỉ VNPay Payment được xử lý bằng recovery disposition này.' });
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.ordersService.getOrderForPaymentForUpdate(candidate.orderId, candidate.order.userId, tx);
      const payment = await tx.payment.findUnique({ where: { id: input.paymentId } });
      if (!payment) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Không tìm thấy Payment.' });

      const racedReplay = await tx.paymentRecoveryResolution.findFirst({
        where: { paymentId: input.paymentId, idempotencyKey: input.idempotencyKey },
      });
      if (racedReplay) {
        if (racedReplay.requestHash !== requestHash) {
          throw new ConflictException({ code: 'RESOLUTION_IDEMPOTENCY_KEY_REUSED', message: 'Resolution Idempotency-Key đã được dùng cho payload khác.' });
        }
        return this.toResolutionResponse(racedReplay, true);
      }
      if (payment.status !== PaymentStatus.MANUAL_REVIEW) {
        throw new ConflictException({
          code: 'PAYMENT_NOT_IN_MANUAL_REVIEW',
          message: 'Chỉ Payment MANUAL_REVIEW mới được xác nhận kết quả compensation.',
          status: payment.status,
        });
      }

      const initiatingOperator = await tx.paymentRecoveryAudit.findFirst({
        where: {
          paymentId: payment.id,
          actorType: PaymentRecoveryActorType.USER,
          actorUserId: { not: null },
          afterState: PaymentStatus.MANUAL_REVIEW,
        },
        orderBy: { createdAt: 'asc' },
      });
      if (initiatingOperator?.actorUserId === input.actorUserId) {
        throw new ConflictException({
          code: 'SECOND_OPERATOR_REQUIRED',
          message: 'Operator khác người đã khởi tạo recovery phải xác nhận refund/no-charge.',
        });
      }

      const beforeState = payment.status;
      const afterState = input.decision === PaymentRecoveryDecision.REFUND_CONFIRMED
        ? PaymentStatus.REFUNDED
        : PaymentStatus.FAILED;
      const resolution = await tx.paymentRecoveryResolution.create({
        data: {
          paymentId: payment.id,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          decision: input.decision,
          evidenceReference: input.evidenceReference,
          incidentReference: input.incidentReference,
          correlationId,
          actorUserId: input.actorUserId,
        },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: afterState,
          failureCode: input.decision === PaymentRecoveryDecision.REFUND_CONFIRMED
            ? 'OPERATOR_CONFIRMED_REFUND'
            : 'OPERATOR_CONFIRMED_NO_CHARGE',
          processedAt: new Date(),
        },
      });
      if (order.status === OrderStatus.PENDING) {
        await this.ordersService.markOrderPaymentFailed(
          payment.orderId,
          order.userId,
          input.decision === PaymentRecoveryDecision.REFUND_CONFIRMED
            ? 'VNPAY_REFUND_CONFIRMED'
            : 'VNPAY_NO_CHARGE_CONFIRMED',
          tx,
        );
      }
      await tx.paymentRecoveryAudit.create({
        data: {
          paymentId: payment.id,
          actorUserId: input.actorUserId,
          actorType: PaymentRecoveryActorType.USER,
          gatewayReference: payment.gatewayReference,
          correlationId,
          incidentReference: input.incidentReference,
          beforeState,
          afterState,
          providerOutcome: input.decision === PaymentRecoveryDecision.REFUND_CONFIRMED
            ? 'OPERATOR_REFUND_CONFIRMED'
            : 'OPERATOR_NO_CHARGE_CONFIRMED',
          details: {
            resolutionId: resolution.id,
            decision: input.decision,
            evidenceReference: input.evidenceReference,
            orderStatus: order.status,
            policy: 'External merchant/finance action verified by a second operator; no automatic refund is issued by this API.',
          },
        },
      });
      return this.toResolutionResponse(resolution, false);
    });
  }

  private toResolutionResponse(resolution: any, replay: boolean) {
    return {
      resolutionId: resolution.id,
      paymentId: resolution.paymentId,
      decision: resolution.decision,
      paymentStatus: resolution.decision === PaymentRecoveryDecision.REFUND_CONFIRMED
        ? PaymentStatus.REFUNDED
        : PaymentStatus.FAILED,
      evidenceReference: resolution.evidenceReference,
      isRetried: replay,
    };
  }

  private async applyInquiryResult(input: {
    paymentId: string;
    requestId: string;
    actorUserId: string;
    incidentReference: string;
    correlationId: string;
    gatewayReference: string;
    result: Awaited<ReturnType<VnpayInquiryService['query']>>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const paymentSnapshot = await tx.payment.findUnique({
        where: { id: input.paymentId },
        include: { order: { select: { userId: true, orderNumber: true } } },
      });
      if (!paymentSnapshot) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Không tìm thấy Payment.' });
      const order = await this.ordersService.getOrderForPaymentForUpdate(
        paymentSnapshot.orderId,
        paymentSnapshot.order.userId,
        tx,
      );
      const payment = await tx.payment.findUnique({ where: { id: input.paymentId } });
      const request = await tx.paymentRecoveryRequest.findUnique({ where: { id: input.requestId } });
      if (!payment || !request) throw new NotFoundException('Payment recovery record not found.');
      if (request.status !== PaymentRecoveryRequestStatus.IN_PROGRESS) {
        return this.toResponse(request, true);
      }

      const beforeState = payment.status;
      let afterState = beforeState;
      let recoveryStatus: PaymentRecoveryRequestStatus = PaymentRecoveryRequestStatus.COMPLETED;
      let providerOutcome: string = input.result.status;
      let failureCode: string | null = null;
      const transactionNo: string | null = input.result.transactionNo;
      const processedAt = new Date();

      if (payment.status !== PaymentStatus.PROCESSING) {
        providerOutcome = 'DUPLICATE_OR_OUT_OF_ORDER';
      } else if (input.result.status === 'SUCCESS') {
        if (!transactionNo) {
          recoveryStatus = PaymentRecoveryRequestStatus.UNKNOWN;
          providerOutcome = 'SUCCESS_WITHOUT_TRANSACTION_NUMBER';
        } else if (order.status !== OrderStatus.PENDING || order.reservationExpiresAt <= processedAt) {
          afterState = PaymentStatus.MANUAL_REVIEW;
          failureCode = 'LATE_SUCCESS_REQUIRES_REVIEW';
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.MANUAL_REVIEW,
              gatewayTransactionId: transactionNo,
              failureCode,
              processedAt,
            },
          });
          providerOutcome = 'LATE_SUCCESS_REQUIRES_REFUND_REVIEW';
        } else {
          afterState = PaymentStatus.SUCCEEDED;
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.SUCCEEDED,
              gatewayTransactionId: transactionNo,
              processedAt,
            },
          });
          await this.ordersService.markOrderPaid(payment.orderId, order.userId, payment.amount, tx);
          providerOutcome = 'SUCCESS_SETTLED';
        }
      } else if (input.result.status === 'DEFINITIVE_FAILURE') {
        afterState = PaymentStatus.FAILED;
        failureCode = ('VNPAY_' + input.result.responseCode + '_' + input.result.transactionStatus).slice(0, 100);
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED, failureCode, processedAt },
        });
        if (order.status === OrderStatus.PENDING) {
          await this.ordersService.markOrderPaymentFailed(payment.orderId, order.userId, failureCode, tx);
        }
      } else if (input.result.status === 'MANUAL_REVIEW') {
        afterState = PaymentStatus.MANUAL_REVIEW;
        failureCode = ('VNPAY_MANUAL_REVIEW_' + input.result.transactionStatus).slice(0, 100);
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.MANUAL_REVIEW,
            ...(transactionNo ? { gatewayTransactionId: transactionNo } : {}),
            failureCode,
            processedAt,
          },
        });
      } else if (input.result.status === 'UNKNOWN') {
        recoveryStatus = PaymentRecoveryRequestStatus.UNKNOWN;
      }

      const updatedRequest = await tx.paymentRecoveryRequest.update({
        where: { id: request.id },
        data: {
          status: recoveryStatus,
          providerOutcome,
          providerResponseCode: input.result.responseCode,
          providerTransactionNo: transactionNo,
          errorCode: failureCode,
          leaseExpiresAt: processedAt,
        },
      });
      await tx.paymentRecoveryAudit.create({
        data: {
          recoveryRequestId: request.id,
          paymentId: payment.id,
          actorUserId: input.actorUserId,
          actorType: PaymentRecoveryActorType.USER,
          gatewayReference: input.gatewayReference,
          correlationId: input.correlationId,
          incidentReference: input.incidentReference,
          beforeState,
          afterState,
          providerOutcome,
          details: {
            responseCode: input.result.responseCode,
            transactionStatus: input.result.transactionStatus,
            transactionNo,
            orderStatus: order.status,
            orderDeadlinePassed: order.reservationExpiresAt <= processedAt,
          },
        },
      });
      return this.toResponse(updatedRequest, false, afterState);
    });
  }

  private async finalizeUnknown(requestId: string, errorCode: string, outcome: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.paymentRecoveryRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new NotFoundException('Payment recovery request not found.');
      if (request.status !== PaymentRecoveryRequestStatus.IN_PROGRESS) return this.toResponse(request, true);
      const payment = await tx.payment.findUnique({ where: { id: request.paymentId } });
      if (!payment) throw new NotFoundException('Payment not found.');
      const updated = await tx.paymentRecoveryRequest.update({
        where: { id: request.id },
        data: {
          status: PaymentRecoveryRequestStatus.UNKNOWN,
          providerOutcome: outcome,
          errorCode,
          leaseExpiresAt: new Date(),
        },
      });
      await tx.paymentRecoveryAudit.create({
        data: {
          recoveryRequestId: request.id,
          paymentId: payment.id,
          actorUserId: request.actorUserId,
          actorType: PaymentRecoveryActorType.USER,
          gatewayReference: payment.gatewayReference,
          correlationId: request.correlationId,
          incidentReference: request.incidentReference,
          beforeState: payment.status,
          afterState: payment.status,
          providerOutcome: outcome,
          details: { errorCode, note: 'Payment state intentionally left unchanged because provider outcome is not definitive.' },
        },
      });
      return this.toResponse(updated, false, payment.status);
    });
  }

  private toResponse(request: any, replay: boolean, paymentStatus?: PaymentStatus) {
    return {
      recoveryRequestId: request.id,
      providerRequestId: request.providerRequestId,
      status: request.status,
      providerOutcome: request.providerOutcome ?? null,
      paymentStatus: paymentStatus ?? null,
      errorCode: request.errorCode ?? null,
      isRetried: replay,
    };
  }
}

function formatVnpayDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + values.month + values.day + values.hour + values.minute + values.second;
}

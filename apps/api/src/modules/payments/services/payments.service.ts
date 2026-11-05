import {
  ConflictException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PaymentsRepository } from '../repositories/payments.repository.js';
import { OrdersService } from '../../orders/services/orders.service.js';
import { MockGatewayService } from './mock-gateway.service.js';
import { VnpayGatewayService } from './vnpay.gateway.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { PaymentMethod, PaymentStatus, OrderStatus } from '../../../generated/prisma/client.js';
import { PaymentMethod as DtoPaymentMethod } from '../dto/create-payment.dto.js';
import { PaymentStatus as PaymentResponseStatus, type PaymentResponseDto } from '../dto/payment-response.dto.js';

@Injectable()
export class PaymentsService {
  getPaymentStatus(idempotencyKey: string, sub: string) {
    throw new Error('Method not implemented.');
  }
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly ordersService: OrdersService,
    private readonly mockGateway: MockGatewayService,
    private readonly prisma: PrismaService,
    @Optional() private readonly vnpayGateway?: VnpayGatewayService,
  ) {}

  async processPayment(params: {
    idempotencyKey: string;
    orderId: string;
    userId: string;
    method: PaymentMethod;
    amount: bigint;
    clientIp?: string;
  }): Promise<PaymentResponseDto> {
    const { idempotencyKey, orderId, userId, method, amount, clientIp } = params;

    if (method === PaymentMethod.VNPAY && !this.vnpayGateway?.isEnabled()) {
      throw new ServiceUnavailableException({
        code: 'VNPAY_NOT_CONFIGURED',
        message: 'Thanh toán VNPay chưa được cấu hình cho môi trường này.',
      });
    }

    // 1. Tính toán chuỗi băm Request-Hash (Canonical JSON)
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ orderId, method, amount: amount.toString() }))
      .digest('hex');

    // 2. Tra cứu Idempotency-Key
    const existingPayment = await this.paymentsRepository.findByIdempotencyKey(idempotencyKey);
    if (existingPayment) {
      return this.replayPayment(existingPayment, requestHash);
    }

    // 3. Serialize admission và tạo bản ghi PROCESSING trong DB transaction
    let claim: { kind: 'replay'; result: PaymentResponseDto } | { kind: 'created'; payment: any };
    try {
      claim = await this.prisma.$transaction(async (tx) => {
        const order = await this.ordersService.getOrderForPaymentForUpdate(orderId, userId, tx);
        const concurrent = await this.paymentsRepository.findByIdempotencyKey(idempotencyKey, tx);
        if (concurrent) {
          return { kind: 'replay' as const, result: this.replayPayment(concurrent, requestHash) };
        }

        if (order.status === OrderStatus.PAID) {
          throw new ConflictException({
            code: 'ORDER_ALREADY_PAID',
            message: 'Đơn hàng này đã được thanh toán.',
          });
        }
        if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAYMENT_FAILED) {
          throw new ConflictException({
            code: 'ORDER_INVALID_TRANSITION',
            message: 'Trạng thái đơn hàng không hợp lệ để thanh toán.',
          });
        }
        if (order.reservationExpiresAt && new Date() >= order.reservationExpiresAt) {
          throw new ConflictException({
            code: 'ORDER_EXPIRED',
            message: 'Đơn hàng đã hết hạn thanh toán do quá thời gian giữ chỗ.',
          });
        }

        const activePayment = await this.paymentsRepository.findProcessingByOrderId(orderId, tx);
        if (activePayment) {
          throw new ConflictException({
            code: 'PAYMENT_IN_PROGRESS',
            message: 'Đơn hàng đã có một giao dịch thanh toán đang xử lý.',
          });
        }

        if (order.status === OrderStatus.PAYMENT_FAILED) {
          await this.ordersService.transitionForPaymentRetry(
            orderId,
            userId,
            'Customer retried payment',
            tx,
          );
        }

        const vnpayIntent =
          method === PaymentMethod.VNPAY
            ? this.vnpayGateway!.createPaymentUrl({
                amount,
                orderNumber: order.orderNumber,
                expiresAt: order.reservationExpiresAt,
                ipAddress: clientIp ?? '',
              })
            : undefined;

          return this.paymentsRepository.createProcessingPayment(
            {
              orderId,
              idempotencyKey,
              requestHash,
              method,
              amount,
              ...(vnpayIntent),
            },
            tx,
          );
        });
      } catch (error) {
        if ((error as { code?: string })?.code === 'P2002') {
          const conflictingPayment = await this.paymentsRepository.findByIdempotencyKey(idempotencyKey);
          if (conflictingPayment && conflictingPayment.requestHash !== requestHash) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'Idempotency Key đã được sử dụng cho một payload khác.',
            });
          }
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency Key đã được sử dụng cho một payload khác.',
          });
        }
        throw new ConflictException({
          code: 'PAYMENT_IN_PROGRESS',
          message: 'Đơn hàng đang có giao dịch thanh toán được xử lý.',
        });
      }
      throw error;
    }

    if (claim.kind === 'replay') {
      return claim.result;
    }
    const processingPayment = claim.payment;

    // 4. Nếu là VNPay: Trả về Payment URL để redirect
    if (method === PaymentMethod.VNPAY) {
      if (!processingPayment.paymentUrl) {
        this.logger.error('VNPay Payment was created without a payment URL. paymentId=' + processingPayment.id);
        throw new ServiceUnavailableException({
          code: 'VNPAY_PAYMENT_URL_UNAVAILABLE',
          message: 'Không thể tạo liên kết thanh toán VNPay.',
        });
      }
      return {
        success: false,
        isRetried: false,
        status: PaymentResponseStatus.PROCESSING,
        paymentUrl: processingPayment.paymentUrl,
      } as PaymentResponseDto;
    }

    // 5. Nếu là MockGateway: Xử lý charge trực tiếp bên ngoài DB lock
    const gatewayResult = await this.mockGateway.charge(
      Number(amount),
      method as unknown as DtoPaymentMethod,
    );
    const processedAt = new Date();

    // 6. Cập nhật trạng thái sau khi cổng thanh toán phản hồi
    await this.prisma.$transaction(async (tx) => {
      if (gatewayResult.success) {
        await this.paymentsRepository.markSucceeded(
          processingPayment.id,
          gatewayResult.gatewayTransactionId,
          processedAt,
          tx,
        );
        await this.ordersService.markOrderPaid(orderId, userId, amount, tx);
      } else {
        await this.paymentsRepository.markFailed(
          processingPayment.id,
          gatewayResult.errorCode,
          processedAt,
          tx,
        );
        await this.ordersService.markOrderPaymentFailed(
          orderId,
          userId,
          gatewayResult.errorCode ?? 'UNKNOWN_ERROR',
          tx,
        );
      }
    });

    return {
      success: gatewayResult.success,
      isRetried: false,
      status: gatewayResult.success ? PaymentResponseStatus.SUCCEEDED : PaymentResponseStatus.FAILED,
      gatewayTransactionId: gatewayResult.gatewayTransactionId,
      errorCode: gatewayResult.errorCode,
    };
  }

  private replayPayment(
    payment: {
      requestHash: string;
      status: PaymentStatus;
      gatewayTransactionId: string | null;
      failureCode: string | null;
    },
    requestHash: string,
  ): PaymentResponseDto {
    if (payment.requestHash !== requestHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency Key đã được sử dụng cho một payload khác.',
      });
    }
    if (payment.status === PaymentStatus.PROCESSING) {
      throw new ConflictException({
        code: 'PAYMENT_IN_PROGRESS',
        message: 'Giao dịch đang được xử lý, vui lòng không thử lại.',
      });
    }
    return {
      success: payment.status === PaymentStatus.SUCCEEDED,
      isRetried: true,
      status: PaymentResponseStatus[payment.status],
      gatewayTransactionId: payment.gatewayTransactionId ?? undefined,
      errorCode: payment.failureCode ?? undefined,
    };
  }

  async handleVnpayIpn(query: unknown): Promise<{ RspCode: string; Message: string }> {
    if (!this.vnpayGateway?.isEnabled()) {
      return { RspCode: '99', Message: 'Gateway is not configured' };
    }
    const callback = this.vnpayGateway.verifyCallback(query);
    if (!callback) {
      this.logger.warn('VNPay IPN rejected: invalid signature or callback fields.');
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    try {
      const initialPayment = await this.paymentsRepository.findByGatewayReference(callback.vnp_TxnRef);
      if (!initialPayment || initialPayment.method !== PaymentMethod.VNPAY) {
        return { RspCode: '01', Message: 'Order not found' };
      }
      const outcome = await this.prisma.$transaction(async (tx) => {
        const lockedOrder = await this.ordersService.getOrderForPaymentForUpdate(
          initialPayment.orderId,
          initialPayment.order.userId,
          tx,
        );
        const payment = await this.paymentsRepository.findByGatewayReference(callback.vnp_TxnRef, tx);
        if (!payment || payment.method !== PaymentMethod.VNPAY) return 'missing' as const;
        if (payment.amount * 100n !== BigInt(callback.vnp_Amount)) {
          await tx.paymentRecoveryAudit.create({
            data: {
              paymentId: payment.id,
              actorType: 'SYSTEM',
              gatewayReference: callback.vnp_TxnRef,
              correlationId: randomUUID(),
              incidentReference: 'VNPAY_IPN_AMOUNT_MISMATCH',
              beforeState: payment.status,
              afterState: payment.status,
              providerOutcome: 'IPN_AMOUNT_MISMATCH_REJECTED',
              details: {
                reportedAmount: callback.vnp_Amount,
                expectedAmount: (payment.amount * 100n).toString(),
                responseCode: callback.vnp_ResponseCode,
                transactionStatus: callback.vnp_TransactionStatus,
              },
            },
          });
          return 'amount-mismatch' as const;
        }

        const providerSucceeded =
          callback.vnp_ResponseCode === '00' && callback.vnp_TransactionStatus === '00';
        if (payment.status !== PaymentStatus.PROCESSING) {
          const transactionNo = callback.vnp_TransactionNo || callback.vnp_BankTranNo || null;
          if (payment.status === PaymentStatus.FAILED && providerSucceeded) {
            if (!transactionNo) return 'missing-transaction' as const;
            const processedAt = new Date();
            const failureCode = 'LATE_SUCCESS_AFTER_FAILURE_REQUIRES_REVIEW';
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: PaymentStatus.MANUAL_REVIEW,
                gatewayTransactionId: transactionNo,
                failureCode,
                processedAt,
              },
            });
            await tx.paymentRecoveryAudit.create({
              data: {
                paymentId: payment.id,
                actorType: 'SYSTEM',
                gatewayReference: callback.vnp_TxnRef,
                correlationId: randomUUID(),
                incidentReference: 'VNPAY_IPN_OUT_OF_ORDER_SUCCESS',
                beforeState: PaymentStatus.FAILED,
                afterState: PaymentStatus.MANUAL_REVIEW,
                providerOutcome: 'LATE_SUCCESS_AFTER_FAILURE_REQUIRES_REFUND_REVIEW',
                details: {
                  responseCode: callback.vnp_ResponseCode,
                  transactionStatus: callback.vnp_TransactionStatus,
                  transactionNo,
                  orderStatus: lockedOrder.status,
                  orderDeadlinePassed: lockedOrder.reservationExpiresAt
                    ? lockedOrder.reservationExpiresAt <= processedAt
                    : null,
                },
              },
            });
            return 'manual-review' as const;
          }

          await tx.paymentRecoveryAudit.create({
            data: {
              paymentId: payment.id,
              actorType: 'SYSTEM',
              gatewayReference: callback.vnp_TxnRef,
              correlationId: randomUUID(),
              incidentReference: 'VNPAY_IPN_DUPLICATE_OR_OUT_OF_ORDER',
              beforeState: payment.status,
              afterState: payment.status,
              providerOutcome: payment.status === PaymentStatus.SUCCEEDED
                ? 'DUPLICATE_IPN'
                : 'OUT_OF_ORDER_IPN_IGNORED',
              details: {
                responseCode: callback.vnp_ResponseCode,
                transactionStatus: callback.vnp_TransactionStatus,
                transactionNo,
                orderStatus: lockedOrder.status,
              },
            },
          });
          return 'duplicate' as const;
        }

        if (providerSucceeded) {
          const transactionNo = callback.vnp_TransactionNo || callback.vnp_BankTranNo;
          if (!transactionNo) return 'missing-transaction' as const;
          const processedAt = new Date();
          if (
            lockedOrder.status !== OrderStatus.PENDING ||
            lockedOrder.reservationExpiresAt <= processedAt
          ) {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: PaymentStatus.MANUAL_REVIEW,
                gatewayTransactionId: transactionNo,
                failureCode: 'LATE_SUCCESS_REQUIRES_REVIEW',
                processedAt,
              },
            });
            await tx.paymentRecoveryAudit.create({
              data: {
                paymentId: payment.id,
                actorType: 'SYSTEM',
                gatewayReference: callback.vnp_TxnRef,
                correlationId: randomUUID(),
                incidentReference: 'VNPAY_IPN_LATE_SUCCESS',
                beforeState: PaymentStatus.PROCESSING,
                afterState: PaymentStatus.MANUAL_REVIEW,
                providerOutcome: 'LATE_SUCCESS_REQUIRES_REFUND_REVIEW',
                details: {
                  responseCode: callback.vnp_ResponseCode,
                  transactionStatus: callback.vnp_TransactionStatus,
                  transactionNo,
                  orderStatus: lockedOrder.status,
                  orderDeadlinePassed: lockedOrder.reservationExpiresAt <= processedAt,
                },
              },
            });
            return 'manual-review' as const;
          }
          await this.paymentsRepository.markSucceeded(payment.id, transactionNo, processedAt, tx);
          await this.ordersService.markOrderPaid(payment.orderId, payment.order.userId, payment.amount, tx);
          return 'success' as const;
        }

        if (callback.vnp_TransactionStatus !== '02') return 'pending' as const;
        const failureCode = (
          'VNPAY_' + callback.vnp_ResponseCode + '_' + callback.vnp_TransactionStatus
        ).slice(0, 100);
        await this.paymentsRepository.markFailed(payment.id, failureCode, new Date(), tx);
        if (lockedOrder.status === OrderStatus.PENDING) {
          await this.ordersService.markOrderPaymentFailed(
            payment.orderId,
            payment.order.userId,
            failureCode,
            tx,
          );
        }
        return 'success' as const;
      });

      if (outcome === 'duplicate') return { RspCode: '02', Message: 'Transaction already confirmed' };
      if (outcome === 'missing') return { RspCode: '01', Message: 'Order not found' };
      if (outcome === 'amount-mismatch') return { RspCode: '04', Message: 'Invalid amount' };
      if (outcome === 'pending') return { RspCode: '00', Message: 'Received; reconciliation remains required' };
      if (outcome === 'manual-review') return { RspCode: '00', Message: 'Received; manual review required' };
      if (outcome === 'missing-transaction') {
        this.logger.error('VNPay IPN could not settle callback. reference=' + callback.vnp_TxnRef);
        return { RspCode: '99', Message: 'Unable to confirm transaction' };
      }
      return { RspCode: '00', Message: 'Confirm Success' };
    } catch (error) {
      this.logger.error(
        'VNPay IPN processing failed. reference=' + callback.vnp_TxnRef,
        error instanceof Error ? error.stack : undefined,
      );
      return { RspCode: '99', Message: 'Internal error' };
    }
  }

  async getVnpayReturnRedirect(query: unknown): Promise<string> {
    if (!this.vnpayGateway?.isEnabled()) {
      throw new ServiceUnavailableException({
        code: 'VNPAY_NOT_CONFIGURED',
        message: 'VNPay is not configured.',
      });
    }
    if (!this.vnpayGateway.verifyCallback(query)) {
      this.logger.warn('VNPay Return has invalid signature; redirecting to read-only Checkout.');
    }
    return this.vnpayGateway.frontendReturnUrl();
  }
}
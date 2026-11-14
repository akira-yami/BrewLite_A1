import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { PaymentsRepository } from '../repositories/payments.repository.js';
import { OrdersService } from '../../orders/services/orders.service.js';
import { MockGatewayService } from './mock-gateway.service.js';
import { VnpayGatewayService, type VerifiedVnpayCallback } from './vnpay.gateway.js';
import { VnpayInquiryService, VnpayInquiryError } from './vnpay-inquiry.service.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { PaymentMethod, PaymentStatus, OrderStatus, PaymentRecoveryActorType } from '../../../generated/prisma/client.js';
import { PaymentMethod as DtoPaymentMethod } from '../dto/create-payment.dto.js';
import { PaymentStatus as PaymentResponseStatus, type PaymentResponseDto } from '../dto/payment-response.dto.js';

@Injectable()
export class PaymentsService {
  /**
   * Tra cứu trạng thái payment theo idempotency key của khách hàng.
   * Chỉ trả kết quả của order thuộc về userId (bảo vệ cross-user access).
   */
  async getPaymentStatus(idempotencyKey: string, userId: string): Promise<PaymentResponseDto> {
    const payment = await this.paymentsRepository.findStatusByIdempotencyKeyForUser(
      idempotencyKey,
      userId,
    );
    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Không tìm thấy giao dịch thanh toán.',
      });
    }
    return {
      success: payment.status === PaymentStatus.SUCCEEDED,
      isRetried: true,
      status: PaymentResponseStatus[payment.status],
      gatewayTransactionId: payment.gatewayTransactionId ?? undefined,
      errorCode: payment.failureCode ?? undefined,
      paymentUrl: payment.paymentUrl ?? undefined,
    };
  }
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly ordersService: OrdersService,
    private readonly mockGateway: MockGatewayService,
    private readonly prisma: PrismaService,
    @Optional() private readonly vnpayGateway?: VnpayGatewayService,
    @Optional() private readonly vnpayInquiry?: VnpayInquiryService,
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
          // Only a previous VNPay PROCESSING attempt can be superseded by the
          // explicit VNPay retry action. Manual-review and other methods remain blocked.
          if (
            activePayment.status !== PaymentStatus.PROCESSING ||
            activePayment.method !== PaymentMethod.VNPAY ||
            method !== PaymentMethod.VNPAY
          ) {
            throw new ConflictException({
              code: 'PAYMENT_IN_PROGRESS',
              message: 'Đơn hàng đang có giao dịch cần được xác minh trước khi thử lại.',
            });
          }

          const supersededAt = new Date();
          const superseded = await this.paymentsRepository.supersedeProcessingPayment(
            activePayment.id,
            'SUPERSEDED_BY_CUSTOMER_RETRY',
            supersededAt,
            tx,
          );
          if (superseded.count !== 1) {
            throw new ConflictException({
              code: 'PAYMENT_IN_PROGRESS',
              message: 'Giao dịch cũ vừa thay đổi trạng thái. Vui lòng tải lại đơn hàng.',
            });
          }

          await tx.paymentRecoveryAudit.create({
            data: {
              paymentId: activePayment.id,
              actorType: PaymentRecoveryActorType.SYSTEM,
              gatewayReference: activePayment.gatewayReference ?? null,
              correlationId: randomUUID(),
              incidentReference: 'CUSTOMER_RETRY_SUPERSEDED_PROCESSING_PAYMENT',
              beforeState: PaymentStatus.PROCESSING,
              afterState: PaymentStatus.FAILED,
              providerOutcome: 'SUPERSEDED_BY_NEW_RETRY_ATTEMPT',
              details: {
                orderStatus: order.status,
                paymentMethod: activePayment.method,
                failureCode: 'SUPERSEDED_BY_CUSTOMER_RETRY',
                lateGatewaySuccessPolicy: 'MANUAL_REVIEW',
              },
            },
          });
        }

        if (order.status === OrderStatus.PAYMENT_FAILED) {
          try {
            await this.ordersService.transitionForPaymentRetry(
              orderId,
              userId,
              'Khách hàng thực hiện lại thanh toán',
              tx,
            );
          } catch (retryErr: any) {
            // Nếu order bị tranh quyền retry đồng thời, map thành PAYMENT_IN_PROGRESS
            if (retryErr?.status === 409) {
              throw new ConflictException({
                code: 'PAYMENT_IN_PROGRESS',
                message: 'Một yêu cầu thanh toán khác đang được xử lý cho đơn hàng này.',
              });
            }
            throw retryErr;
          }
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

          const payment = await this.paymentsRepository.createProcessingPayment(
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
          return { kind: 'created' as const, payment };
        });
      } catch (error: any) {
        if (error?.code === 'P2002') {
          const conflictingPayment = await this.paymentsRepository.findByIdempotencyKey(idempotencyKey);
          if (conflictingPayment && conflictingPayment.requestHash !== requestHash) {
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
      paymentUrl?: string | null;
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
      // VNPay PROCESSING: trả lại URL để frontend tiếp tục redirect
      if (payment.paymentUrl) {
        return {
          success: false,
          isRetried: true,
          status: PaymentResponseStatus.PROCESSING,
          paymentUrl: payment.paymentUrl,
        } as PaymentResponseDto;
      }
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

  /**
   * Reconciliation / Recovery cho Issue #41.
   *
   * Dùng khi một VNPay payment ở trạng thái PROCESSING quá lâu
   * (timeout, mất IPN, mạng gián đoạn).  Flow:
   *
   * 1. Kiểm tra payment còn PROCESSING với method VNPAY.
   * 2. Gọi VNPay QueryDr để lấy trạng thái thực tế.
   * 3. Nếu SUCCESS  → settle thành công (markSucceeded + markOrderPaid).
   * 4. Nếu DEFINITIVE_FAILURE → mark failed + markOrderPaymentFailed.
   * 5. Nếu PENDING / MANUAL_REVIEW / UNKNOWN → không làm gì,
   *    trả về outcome để caller quyết định (schedule retry sau).
   *
   * @throws {NotFoundException}          khi không tìm thấy payment.
   * @throws {ConflictException}          khi payment không đủ điều
   *                                      kiện recover (đã settled, sai
   *                                      method, thiếu dữ liệu).
   * @throws {ServiceUnavailableException} khi VNPay Inquiry chưa cấu
   *                                      hình.
   * @throws {VnpayInquiryError}          khi QueryDr thất bại — outcome
   *                                      = 'UNKNOWN', idempotent để retry.
   */
  async recoverStuckPayment(params: {
    paymentId: string;
    /** IP của server (dùng để ký QueryDr request). */
    serverIp: string;
  }): Promise<{
    outcome: 'SETTLED_SUCCESS' | 'SETTLED_FAILURE' | 'STILL_PROCESSING' | 'MANUAL_REVIEW';
    paymentId: string;
  }> {
    const { paymentId, serverIp } = params;

    if (isIP(serverIp) === 0) {
      throw new ConflictException({
        code: 'INVALID_SERVER_IP',
        message: 'serverIp không hợp lệ.',
      });
    }

    if (!this.vnpayInquiry || !this.vnpayGateway?.isEnabled()) {
      throw new ServiceUnavailableException({
        code: 'VNPAY_INQUIRY_NOT_CONFIGURED',
        message: 'VNPay Inquiry chưa được cấu hình.',
      });
    }

    // 1. Lấy payment và lock
    const payment = await this.paymentsRepository.findByGatewayReference(
      // findByGatewayReference yêu cầu gateway reference, nhưng chúng ta
      // có paymentId — dùng prisma trực tiếp để tìm theo ID
      await this.prisma.payment
        .findUniqueOrThrow({ where: { id: paymentId }, select: { gatewayReference: true } })
        .then((r) => r.gatewayReference!)
        .catch(() => {
          throw new NotFoundException({
            code: 'PAYMENT_NOT_FOUND',
            message: 'Không tìm thấy payment.',
          });
        }),
    );

    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Không tìm thấy payment.',
      });
    }

    if (payment.method !== PaymentMethod.VNPAY) {
      throw new ConflictException({
        code: 'RECOVERY_NOT_APPLICABLE',
        message: 'Recovery chỉ áp dụng cho giao dịch VNPay.',
      });
    }

    if (payment.status !== PaymentStatus.PROCESSING) {
      throw new ConflictException({
        code: 'PAYMENT_ALREADY_SETTLED',
        message: 'Giao dịch đã được xử lý xong, không cần recovery.',
      });
    }

    if (!payment.gatewayReference) {
      throw new ConflictException({
        code: 'MISSING_GATEWAY_REFERENCE',
        message: 'Payment thiếu gatewayReference để truy vấn VNPay.',
      });
    }

    // 2. Cần createdAt để build transactionDate cho QueryDr
    const fullPayment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: { createdAt: true, amount: true, orderId: true, order: { select: { userId: true, orderNumber: true } } },
    });

    const transactionDate = formatVnpayDate(fullPayment.createdAt);
    const orderInfo = 'BrewLite order ' + fullPayment.order.orderNumber;

    // 3. Gọi VNPay QueryDr
    let inquiryResult: Awaited<ReturnType<VnpayInquiryService['query']>>;
    try {
      inquiryResult = await this.vnpayInquiry.query({
        gatewayReference: payment.gatewayReference,
        amount: fullPayment.amount,
        transactionDate,
        orderInfo: normalizeOrderInfo(orderInfo),
        serverIp,
      });
    } catch (err) {
      if (err instanceof VnpayInquiryError) {
        this.logger.warn(
          'VNPay QueryDr outcome unknown for paymentId=' + paymentId + ': ' + err.message,
        );
        throw err; // rethrow — caller có thể schedule retry
      }
      throw err;
    }

    // 4. Settle dựa trên kết quả QueryDr
    if (inquiryResult.status === 'SUCCESS') {
      const transactionNo = inquiryResult.transactionNo;
      if (!transactionNo) {
        // Response thành công nhưng không có transactionNo — an toàn nhất là không settle
        this.logger.error(
          'VNPay QueryDr returned SUCCESS without transactionNo. paymentId=' + paymentId,
        );
        return { outcome: 'MANUAL_REVIEW', paymentId };
      }

      await this.prisma.$transaction(async (tx) => {
        await this.ordersService.getOrderForPaymentForUpdate(fullPayment.orderId, fullPayment.order.userId, tx);
        const lockedPayment = await tx.payment.findUnique({ where: { id: payment.id } });
        if (!lockedPayment || lockedPayment.status !== PaymentStatus.PROCESSING) return; // đã settle bởi IPN

        await this.paymentsRepository.markSucceeded(payment.id, transactionNo, new Date(), tx);
        await this.ordersService.markOrderPaid(
          fullPayment.orderId,
          fullPayment.order.userId,
          fullPayment.amount,
          tx,
        );
      });

      this.logger.log('Recovery: settled SUCCESS for paymentId=' + paymentId);
      return { outcome: 'SETTLED_SUCCESS', paymentId };
    }

    if (inquiryResult.status === 'DEFINITIVE_FAILURE') {
      await this.prisma.$transaction(async (tx) => {
        await this.ordersService.getOrderForPaymentForUpdate(fullPayment.orderId, fullPayment.order.userId, tx);
        const lockedPayment = await tx.payment.findUnique({ where: { id: payment.id } });
        if (!lockedPayment || lockedPayment.status !== PaymentStatus.PROCESSING) return;

        const failureCode = (
          'VNPAY_RECOVERY_' +
          inquiryResult.responseCode +
          '_' +
          inquiryResult.transactionStatus
        ).slice(0, 100);
        await this.paymentsRepository.markFailed(payment.id, failureCode, new Date(), tx);
        await this.ordersService.markOrderPaymentFailed(
          fullPayment.orderId,
          fullPayment.order.userId,
          failureCode,
          tx,
        );
      });

      this.logger.log('Recovery: settled DEFINITIVE_FAILURE for paymentId=' + paymentId);
      return { outcome: 'SETTLED_FAILURE', paymentId };
    }

    if (inquiryResult.status === 'MANUAL_REVIEW') {
      this.logger.warn('Recovery: VNPay QueryDr requires MANUAL_REVIEW for paymentId=' + paymentId);
      return { outcome: 'MANUAL_REVIEW', paymentId };
    }

    // PENDING hoặc UNKNOWN — chưa kết luận được, caller schedule retry
    this.logger.warn(
      'Recovery: paymentId=' + paymentId + ' still processing (status=' + inquiryResult.status + ')',
    );
    return { outcome: 'STILL_PROCESSING', paymentId };
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
    return this.applyVnpayResult(callback);
  }

  private async applyVnpayResult(
    callback: VerifiedVnpayCallback,
    source: 'ipn' | 'sandbox-return' = 'ipn',
  ): Promise<{ RspCode: string; Message: string }> {
    try {
      const initialPayment = await this.paymentsRepository.findByGatewayReference(callback.vnp_TxnRef);
      if (!initialPayment || initialPayment.method !== PaymentMethod.VNPAY) {
        return { RspCode: '01', Message: 'Order not found' };
      }
      if (source === 'sandbox-return' && !this.vnpayGateway?.isSandboxPaymentUrl(initialPayment.paymentUrl)) {
        return { RspCode: '01', Message: 'Sandbox payment not found' };
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
                source,
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
                  source,
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
                source,
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
          // Expiry leaves active payment reservations intact. Only the order state
          // determines whether a verified success can still settle the order.
          if (lockedOrder.status !== OrderStatus.PENDING) {
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
                  source,
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
        'VNPay callback processing failed. reference=' + callback.vnp_TxnRef,
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
    const callback = this.vnpayGateway.verifyCallback(query);
    if (!callback) {
      this.logger.warn('VNPay Return has invalid signature; redirecting to Checkout.');
    } else if (this.vnpayGateway.isSandboxPaymentUrl()) {
      // Settle verified Sandbox results before redirecting, even when Sandbox IPN is delayed.
      await this.applyVnpayResult(callback, 'sandbox-return');
    }
    return this.vnpayGateway.frontendReturnUrl();
  }
}

// ---------------------------------------------------------------------------
// Helpers dùng nội bộ trong payments.service.ts
// ---------------------------------------------------------------------------

function normalizeOrderInfo(value: string): string {
  return value
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function formatVnpayDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return fields.year + fields.month + fields.day + fields.hour + fields.minute + fields.second;
}

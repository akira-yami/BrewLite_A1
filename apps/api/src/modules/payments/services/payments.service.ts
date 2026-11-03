import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PaymentsRepository } from '../repositories/payments.repository.js';
import { OrdersService } from '../../orders/services/orders.service.js';
import { MockGatewayService } from './mock-gateway.service.js';
import { VnpayGatewayService } from './vnpay.gateway.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { PaymentMethod, PaymentStatus, OrderStatus } from '../../../generated/prisma/client.js';
import { PaymentMethod as DtoPaymentMethod } from '../dto/create-payment.dto.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly ordersService: OrdersService,
    private readonly mockGateway: MockGatewayService,
    private readonly prisma: PrismaService,
    @Optional() private readonly vnpayGateway?: VnpayGatewayService,
  ) {}

  async getPaymentStatus(idempotencyKey: string, userId: string) {
    const payment = await this.paymentsRepository.findStatusByIdempotencyKeyForUser(
      idempotencyKey,
      userId,
    );
    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Không tìm thấy giao dịch thanh toán cho khóa này.',
      });
    }
    return {
      success: payment.status === PaymentStatus.SUCCEEDED,
      isRetried: true,
      status: payment.status,
      gatewayTransactionId: payment.gatewayTransactionId ?? undefined,
      errorCode: payment.failureCode ?? undefined,
      ...(payment.paymentUrl ? { paymentUrl: payment.paymentUrl } : {}),
    };
  }

  async processPayment(params: {
    idempotencyKey: string;
    orderId: string;
    userId: string;
    method: PaymentMethod;
    amount: bigint;
    clientIp?: string;
  }) {
    const { idempotencyKey, orderId, userId, method, amount, clientIp } = params;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ orderId, method, amount: amount.toString() }))
      .digest('hex');

    const existingPayment = await this.paymentsRepository.findByIdempotencyKey(idempotencyKey);
    if (existingPayment) {
      if (existingPayment.requestHash !== requestHash) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'Idempotency Key đã được sử dụng cho một payload khác.',
        });
      }
      if (existingPayment.status === PaymentStatus.PROCESSING) {
        if (existingPayment.method === PaymentMethod.VNPAY && existingPayment.paymentUrl) {
          return {
            success: false,
            isRetried: true,
            status: PaymentStatus.PROCESSING,
            paymentUrl: existingPayment.paymentUrl,
          };
        }
        throw new ConflictException({
          code: 'PAYMENT_IN_PROGRESS',
          message: 'Giao dịch đang được xử lý, vui lòng không thử lại.',
        });
      }
      return {
        success: existingPayment.status === PaymentStatus.SUCCEEDED,
        isRetried: true,
        status: existingPayment.status,
        gatewayTransactionId: existingPayment.gatewayTransactionId ?? undefined,
        errorCode: existingPayment.failureCode ?? undefined,
      };
    }

    if (method === PaymentMethod.VNPAY && !this.vnpayGateway?.isEnabled()) {
      throw new ServiceUnavailableException({
        code: 'VNPAY_NOT_CONFIGURED',
        message: 'Thanh toán VNPay chưa được cấu hình cho môi trường này.',
      });
    }

    const processingPayment = await (async () => {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const order = await this.ordersService.getOrderForPaymentForUpdate(orderId, userId, tx);
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
            try {
              await this.ordersService.transitionForPaymentRetry(
                orderId,
                userId,
                'Khách hàng thực hiện lại thanh toán',
                tx,
              );
            } catch (error) {
              if (error instanceof ConflictException) {
                throw new ConflictException({
                  code: 'PAYMENT_IN_PROGRESS',
                  message: 'Một yêu cầu thanh toán khác đang được xử lý cho đơn hàng này.',
                });
              }
              throw error;
            }
          }

          const vnpayIntent = method === PaymentMethod.VNPAY
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
            code: 'PAYMENT_IN_PROGRESS',
            message: 'Đơn hàng đang có giao dịch thanh toán được xử lý.',
          });
        }
        throw error;
      }
    })();

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
        status: PaymentStatus.PROCESSING,
        paymentUrl: processingPayment.paymentUrl,
      };
    }

    const gatewayResult = await this.mockGateway.charge(
      Number(amount),
      method as unknown as DtoPaymentMethod,
    );
    const processedAt = new Date();
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
      status: gatewayResult.success ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
      gatewayTransactionId: gatewayResult.gatewayTransactionId,
      errorCode: gatewayResult.errorCode,
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
      if (BigInt(callback.vnp_Amount) !== initialPayment.amount * 100n) {
        this.logger.warn('VNPay IPN amount mismatch. reference=' + callback.vnp_TxnRef);
        return { RspCode: '04', Message: 'Invalid amount' };
      }

      const outcome = await this.prisma.$transaction(async (tx) => {
        const lockedOrder = await this.ordersService.getOrderForPaymentForUpdate(
          initialPayment.orderId,
          initialPayment.order.userId,
          tx,
        );
        const payment = await this.paymentsRepository.findByGatewayReference(callback.vnp_TxnRef, tx);
        if (!payment || payment.method !== PaymentMethod.VNPAY) return 'missing' as const;
        if (payment.status !== PaymentStatus.PROCESSING) return 'duplicate' as const;
        if (payment.amount * 100n !== BigInt(callback.vnp_Amount)) return 'amount-mismatch' as const;
        if (lockedOrder.status !== OrderStatus.PENDING) return 'order-conflict' as const;

        if (callback.vnp_ResponseCode === '00' && callback.vnp_TransactionStatus === '00') {
          const transactionNo = callback.vnp_TransactionNo || callback.vnp_BankTranNo;
          if (!transactionNo) return 'missing-transaction' as const;
          await this.paymentsRepository.markSucceeded(payment.id, transactionNo, new Date(), tx);
          await this.ordersService.markOrderPaid(payment.orderId, payment.order.userId, payment.amount, tx);
          return 'success' as const;
        }

        const failureCode = (
          'VNPAY_' + callback.vnp_ResponseCode + '_' + callback.vnp_TransactionStatus
        ).slice(0, 100);
        await this.paymentsRepository.markFailed(payment.id, failureCode, new Date(), tx);
        await this.ordersService.markOrderPaymentFailed(
          payment.orderId,
          payment.order.userId,
          failureCode,
          tx,
        );
        return 'success' as const;
      });

      if (outcome === 'duplicate') return { RspCode: '02', Message: 'Transaction already confirmed' };
      if (outcome === 'missing') return { RspCode: '01', Message: 'Order not found' };
      if (outcome === 'amount-mismatch') return { RspCode: '04', Message: 'Invalid amount' };
      if (outcome === 'order-conflict' || outcome === 'missing-transaction') {
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
    // The browser Return is display-only and never settles a Payment.
    if (!this.vnpayGateway.verifyCallback(query)) {
      this.logger.warn('VNPay Return has invalid signature; redirecting to read-only Checkout.');
    }
    return this.vnpayGateway.frontendReturnUrl();
  }
}

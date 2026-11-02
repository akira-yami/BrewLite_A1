import { ConflictException, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PaymentsRepository } from '../repositories/payments.repository.js';
import { OrdersService } from '../../orders/services/orders.service.js';
import { MockGatewayService } from './mock-gateway.service.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { PaymentMethod, PaymentStatus, OrderStatus } from '../../../generated/prisma/client.js';
import { PaymentMethod as DtoPaymentMethod } from '../dto/create-payment.dto.js';
import { randomUUID } from 'node:crypto';
import { VnpayGatewayService, type VnpayParameters } from './vnpay-gateway.service.js';
import * as crypto from 'crypto';

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

    private resolveExistingPayment(
        existingPayment: {
            requestHash: string;
            status: PaymentStatus;
            gatewayTransactionId?: string | null;
            failureCode?: string | null;
            gatewayProvider?: string;
            gatewayReference?: string | null;
            paymentUrl?: string | null;
        },
        requestHash: string,
    ) {
        if (existingPayment.requestHash !== requestHash) {
            throw new ConflictException({
                code: 'IDEMPOTENCY_KEY_REUSED',
                message: 'Idempotency Key đã được sử dụng cho một payload khác.',
            });
        }

        if (existingPayment.status === PaymentStatus.PROCESSING) {
            if (existingPayment.gatewayProvider === 'VNPAY' && existingPayment.paymentUrl) {
                return {
                    success: false,
                    isRetried: true,
                    status: existingPayment.status,
                    redirectUrl: existingPayment.paymentUrl,
                    gatewayReference: existingPayment.gatewayReference ?? undefined,
                };
            }
            throw new ConflictException({
                code: 'PAYMENT_IN_PROGRESS',
                message: 'Giao dịch đang được xử lý, vui lòng không thử lại.',
            });
        }

        // Trả về kết quả cũ nếu đã hoàn tất (SUCCEEDED hoặc FAILED), tuyệt đối không gọi Gateway.
        return {
            success: existingPayment.status === PaymentStatus.SUCCEEDED,
            isRetried: true,
            status: existingPayment.status,
            gatewayTransactionId: existingPayment.gatewayTransactionId ?? undefined,
            errorCode: existingPayment.failureCode ?? undefined,
        };
    }

    async processPayment(params: {
        idempotencyKey: string;
        orderId: string;
        userId: string;
        method: PaymentMethod;
        amount: bigint;
        ipAddress?: string;
        reservationExpiresAt?: Date;
    }) {
        const { idempotencyKey, orderId, userId, method, amount } = params;

        // 1. Tính toán chuỗi băm Request-Hash (Canonical JSON)
        const requestHash = crypto
                                .createHash('sha256')
                                .update(JSON.stringify({ orderId, method, amount: amount.toString() }))
                                .digest('hex');

        // 2. Tra cứu Idempotency-Key
        const existingPayment = await this.paymentsRepository.findByIdempotencyKey(idempotencyKey);

        if (existingPayment) {
            return this.resolveExistingPayment(existingPayment, requestHash);
        }

        // Build the signed VNPay URL before inserting PROCESSING, so missing
        // credentials or invalid HTTPS callback URLs cannot leave an unusable Payment.
        const useVnpay = (process.env.PAYMENT_GATEWAY ?? 'mock').trim().toLowerCase() === 'vnpay';
        if (useVnpay && !this.vnpayGateway) {
            throw new ServiceUnavailableException('VNPay gateway provider is not registered.');
        }
        const gatewayProvider = useVnpay ? 'VNPAY' : 'MOCK';
        const gatewayReference = useVnpay ? randomUUID().replaceAll('-', '').toUpperCase() : undefined;
        const paymentUrl = useVnpay
            ? this.vnpayGateway!.createPaymentUrl({
                txnRef: gatewayReference!,
                amount,
                orderInfo: `BrewLite payment ${gatewayReference}`,
                ipAddress: params.ipAddress ?? '127.0.0.1',
                expiresAt: params.reservationExpiresAt ?? new Date(Date.now() + 15 * 60 * 1000),
            })
            : undefined;
        const paymentData = {
            orderId, idempotencyKey, requestHash, method, amount,
            gatewayProvider, gatewayReference, paymentUrl,
        };
        const reservation = await (async () => {
            try {
                const transactionResult = await this.prisma.$transaction(async (tx) => {
                    // Cron expiry và Payment cùng khóa dòng Order để quyết định bên nào được thực thi trước.
                    const order = await this.ordersService.getOrderForPaymentForUpdate(
                        orderId,
                        userId,
                        tx,
                    );

                    // Re-check after locking the Order. A concurrent request may have
                    // inserted (and even completed) this key after the initial lookup.
                    const paymentWithSameKey = await this.paymentsRepository.findByIdempotencyKey(
                        idempotencyKey,
                        tx,
                    );
                    if (paymentWithSameKey) {
                        return { kind: 'existing' as const, payment: paymentWithSameKey };
                    }

                    if (order.status === OrderStatus.PAID) {
                        throw new ConflictException({
                            code: 'ORDER_ALREADY_PAID',
                            message: 'Đơn hàng này đã được thanh toán.',
                        });
                    }

                    if (
                        order.status !== OrderStatus.PENDING &&
                        order.status !== OrderStatus.PAYMENT_FAILED
                    ) {
                        throw new ConflictException({
                            code: 'ORDER_INVALID_TRANSITION',
                            message: 'Trạng thái đơn hàng không hợp lệ để thanh toán.',
                        });
                    }

                    // Kiểm tra lại expiry bên trong khóa để chặn request đọc Order trước hạn nhưng ghi Payment sau hạn.
                    if (order.reservationExpiresAt && new Date() >= order.reservationExpiresAt) {
                        throw new ConflictException({
                            code: 'ORDER_EXPIRED',
                            message: 'Đơn hàng đã hết hạn thanh toán do quá thời gian giữ chỗ.',
                        });
                    }

                    if (order.status === OrderStatus.PAYMENT_FAILED) {
                        // Chuyển PAYMENT_FAILED về PENDING và tạo Payment cùng transaction.
                        try {
                            await this.ordersService.transitionForPaymentRetry(
                                orderId,
                                userId,
                                'Khách hàng thực hiện lại thanh toán',
                                tx,
                            );
                        } catch (error) {
                            // Một tiến trình khác đã thắng quyền chuyển trạng thái.
                            if (error instanceof ConflictException) {
                                throw new ConflictException({
                                    code: 'PAYMENT_IN_PROGRESS',
                                    message: 'Một yêu cầu thanh toán khác đang được xử lý cho đơn hàng này.',
                                });
                            }
                            throw error;
                        }
                    }

                    const payment = await this.paymentsRepository.createProcessingPayment(paymentData, tx);
                    return { kind: 'created' as const, payment };
                });

                if (transactionResult.kind === 'existing') {
                    return {
                        kind: 'existing' as const,
                        result: this.resolveExistingPayment(transactionResult.payment, requestHash),
                    };
                }
                return transactionResult;
            } catch (error) {
                // Same-key requests can race across different Orders, where an Order row lock
                // cannot serialize them. Re-read after the unique-key constraint rejects one.
                if ((error as { code?: string })?.code === 'P2002') {
                    const concurrentPayment = await this.paymentsRepository.findByIdempotencyKey(
                        idempotencyKey,
                    );

                    if (concurrentPayment) {
                        return {
                            kind: 'existing' as const,
                            result: this.resolveExistingPayment(concurrentPayment, requestHash),
                        };
                    }

                    throw new ConflictException({
                        code: 'PAYMENT_IN_PROGRESS',
                        message: 'Đơn hàng đang có giao dịch thanh toán được xử lý.',
                    });
                }
                throw error;
            }
        })();

        if (reservation.kind === 'existing') {
            return reservation.result;
        }
        const processingPayment = reservation.payment;

        if (gatewayProvider === 'VNPAY') {
            return {
                success: false,
                isRetried: false,
                status: PaymentStatus.PROCESSING,
                redirectUrl: paymentUrl,
                gatewayReference,
            };
        }

        // 5. Gọi MockGatewayService (Call API I/O tốn thời gian, tuyệt đối KHÔNG đưa vào DB Lock)
        const gatewayResult = await this.mockGateway.charge(Number(amount), method as unknown as DtoPaymentMethod);
        const processedAt = new Date();

        // 6. Mở DB Transaction đồng bộ trạng thái Order và Payment
        await this.prisma.$transaction(async (tx) => {
            if (gatewayResult.success) {
                await this.paymentsRepository.markSucceeded(processingPayment.id, gatewayResult.gatewayTransactionId, processedAt, tx);
                await this.ordersService.markOrderPaid(orderId, userId, amount, tx);
            } else {
                await this.paymentsRepository.markFailed(processingPayment.id, gatewayResult.errorCode, processedAt, tx);
                await this.ordersService.markOrderPaymentFailed(orderId, userId, gatewayResult.errorCode ?? 'UNKNOWN_ERROR', tx,);
            }
        });

        // 7. Trả về kết quả
        return {
            success: gatewayResult.success,
            isRetried: false,
            status: gatewayResult.success ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
            gatewayTransactionId: gatewayResult.gatewayTransactionId,
            errorCode: gatewayResult.errorCode,
        };
    }

    normalizeVnpayQuery(query: Record<string, unknown>): VnpayParameters {
        return this.vnpayGateway?.normalizeQuery(query) ?? {};
    }

    async handleVnpayIpn(parameters: VnpayParameters) {
        const acknowledgement = (RspCode: string, Message: string) => ({ RspCode, Message });
        if (!this.vnpayGateway || !this.vnpayGateway.verifyResponse(parameters)) {
            return acknowledgement('97', 'Invalid signature');
        }

        const gatewayReference = parameters.vnp_TxnRef;
        const transactionNo = parameters.vnp_TransactionNo;
        const responseCode = parameters.vnp_ResponseCode;
        const transactionStatus = parameters.vnp_TransactionStatus;
        const rawAmount = parameters.vnp_Amount;
        if (!gatewayReference || !transactionNo || !responseCode || !transactionStatus || !rawAmount || !/^\\d+$/.test(rawAmount)) {
            return acknowledgement('99', 'Invalid input data');
        }

        try {
            const candidate = await this.paymentsRepository.findByGatewayReference(gatewayReference);
            if (!candidate || candidate.gatewayProvider !== 'VNPAY') {
                return acknowledgement('01', 'Order not found');
            }

            return await this.prisma.$transaction(async (tx) => {
                // Lock Order before Payment, matching cancel/expiry lock ordering.
                const order = await this.ordersService.getOrderForPaymentForUpdate(
                    candidate.orderId,
                    candidate.order.userId,
                    tx,
                );
                const payment = await this.paymentsRepository.findByGatewayReference(gatewayReference, tx);
                if (!payment || payment.gatewayProvider !== 'VNPAY') {
                    return acknowledgement('01', 'Order not found');
                }
                if (BigInt(rawAmount) !== payment.amount * 100n || order.total !== payment.amount) {
                    return acknowledgement('04', 'Invalid amount');
                }
                if (payment.status !== PaymentStatus.PROCESSING || order.status !== OrderStatus.PENDING) {
                    return acknowledgement('02', 'Order already confirmed');
                }

                const processedAt = new Date();
                const success = responseCode === '00' && transactionStatus === '00';
                if (success) {
                    await this.paymentsRepository.markSucceeded(payment.id, transactionNo, processedAt, tx);
                    await this.ordersService.markOrderPaid(
                        payment.orderId, candidate.order.userId, payment.amount, tx,
                    );
                } else {
                    const failureCode = `VNPAY_${responseCode}_${transactionStatus}`;
                    await this.paymentsRepository.markFailed(
                        payment.id, failureCode, processedAt, tx, transactionNo,
                    );
                    await this.ordersService.markOrderPaymentFailed(
                        payment.orderId, candidate.order.userId, failureCode, tx,
                    );
                }
                return acknowledgement('00', 'Confirm Success');
            });
        } catch (error) {
            this.logger.error('VNPay IPN processing failed', error instanceof Error ? error.stack : String(error));
            return acknowledgement('99', 'Unknown error');
        }
    }

    async getVnpayReturnRedirect(parameters: VnpayParameters): Promise<string> {
        if (!this.vnpayGateway) {
            throw new ServiceUnavailableException('VNPay gateway provider is not registered.');
        }
        const signatureValid = this.vnpayGateway.verifyResponse(parameters);
        let orderId: string | null = null;
        if (signatureValid && parameters.vnp_TxnRef) {
            const payment = await this.paymentsRepository.findByGatewayReference(parameters.vnp_TxnRef);
            if (payment?.gatewayProvider === 'VNPAY') orderId = payment.orderId;
        }
        return this.vnpayGateway.createFrontendReturnUrl(orderId, signatureValid);
    }
}

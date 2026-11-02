import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PaymentsRepository } from '../repositories/payments.repository.js';
import { OrdersService } from '../../orders/services/orders.service.js';
import { MockGatewayService } from './mock-gateway.service.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { PaymentMethod, PaymentStatus, OrderStatus } from '../../../generated/prisma/client.js';
import { PaymentMethod as DtoPaymentMethod } from '../dto/create-payment.dto.js';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private readonly paymentsRepository: PaymentsRepository,
        private readonly ordersService: OrdersService,
        private readonly mockGateway: MockGatewayService,
        private readonly prisma: PrismaService,
    ) {}

    async processPayment(params: {
        idempotencyKey: string;
        orderId: string;
        userId: string;
        method: PaymentMethod;
        amount: bigint;
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
            if (existingPayment.requestHash !== requestHash) {
                throw new ConflictException({
                    code: 'IDEMPOTENCY_KEY_REUSED',
                    message: 'Idempotency Key đã được sử dụng cho một payload khác.',
                });
            }

            if (existingPayment.status === PaymentStatus.PROCESSING) {
                throw new ConflictException({
                    code: 'PAYMENT_IN_PROGRESS',
                    message: 'Giao dịch đang được xử lý, vui lòng không thử lại.',
                });
            }

            // Trả về kết quả cũ nếu đã hoàn tất (SUCCEEDED hoặc FAILED)
            return {
                success: existingPayment.status === PaymentStatus.SUCCEEDED,
                isRetried: true,
                status: existingPayment.status,
                gatewayTransactionId: existingPayment.gatewayTransactionId ?? undefined,
                errorCode: existingPayment.failureCode ?? undefined,
            };
        }

        // 3. Khóa Order và kiểm tra trạng thái/hạn giữ chỗ ngay trước khi tạo Payment.
        const paymentData = { orderId, idempotencyKey, requestHash, method, amount };
        const processingPayment = await (async () => {
            try {
                return await this.prisma.$transaction(async (tx) => {
                    // Cron expiry và Payment cùng khóa dòng Order để quyết định bên nào được thực thi trước.
                    const order = await this.ordersService.getOrderForPaymentForUpdate(
                        orderId,
                        userId,
                        tx,
                    );

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

                    // An external gateway attempt can remain payable while the Order is
                    // still PENDING. Never create a second active payment for the Order.
                    const activePayment = await this.paymentsRepository.findProcessingByOrderId(orderId, tx);
                    if (activePayment) {
                        throw new ConflictException({
                            code: 'PAYMENT_IN_PROGRESS',
                            message: 'Đơn hàng đã có một giao dịch thanh toán đang xử lý.',
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

                    return this.paymentsRepository.createProcessingPayment(paymentData, tx);
                });
            } catch (error) {
                // A P2002 may be the idempotency-key unique constraint or the
                // partial unique index limiting one PROCESSING payment per Order.
                // Re-read the key to preserve the distinct payload-mismatch contract.
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
}

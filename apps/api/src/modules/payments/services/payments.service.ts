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

        // 3. Kiểm tra tính hợp lệ của Đơn hàng (Cổng tích hợp OrdersService)
        // 3. Kiểm tra tính hợp lệ của Đơn hàng (Cổng tích hợp OrdersService)
const order = await this.ordersService.getOrderForPayment(orderId, userId);

if (order.status === OrderStatus.PAID) {
    throw new ConflictException({
        code: 'ORDER_ALREADY_PAID',
        message: 'Đơn hàng này đã được thanh toán.',
    });
}

// Chỉ nhận đơn mới hoặc đơn thất bại thanh toán; đơn đã hủy/hết hạn không được mở lại.
if (
    order.status !== OrderStatus.PENDING &&
    order.status !== OrderStatus.PAYMENT_FAILED
) {
    throw new ConflictException({
        code: 'ORDER_INVALID_TRANSITION',
        message: 'Trạng thái đơn hàng không hợp lệ để thanh toán.',
    });
}

// Kiểm tra hạn giữ chỗ cho cả lần thanh toán đầu và mọi lần retry.
if (order.reservationExpiresAt && new Date() >= order.reservationExpiresAt) {
    throw new ConflictException({
        code: 'ORDER_EXPIRED',
        message: 'Đơn hàng đã hết hạn thanh toán do quá thời gian giữ chỗ.',
    });
}

const isPaymentRetry = order.status === OrderStatus.PAYMENT_FAILED;
const paymentData = { orderId, idempotencyKey, requestHash, method, amount };

// Tạo Payment PROCESSING; retry phải đổi Order và ghi Payment nguyên tử trong cùng transaction.
const processingPayment = await (async () => {
    try {
        if (isPaymentRetry) {
            return await this.prisma.$transaction(async (tx) => {
                // Chỉ một request được phép chuyển PAYMENT_FAILED về PENDING.
                await this.ordersService.transitionForPaymentRetry(
                    orderId,
                    userId,
                    'Khách hàng thực hiện lại thanh toán',
                    tx,
                );

                // Nếu tạo Payment thất bại, transaction sẽ rollback cả lần chuyển trạng thái.
                return this.paymentsRepository.createProcessingPayment(paymentData, tx);
            });
        }

        return await this.paymentsRepository.createProcessingPayment(paymentData);
    } catch (error) {
        // Partial unique index của PostgreSQL ngăn nhiều Payment PROCESSING trên cùng Order.
        if ((error as { code?: string })?.code === 'P2002') {
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
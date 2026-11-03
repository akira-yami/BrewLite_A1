import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';
import { PaymentMethod, PaymentStatus, OrderStatus } from '../../../generated/prisma/client.js';
import * as crypto from 'crypto';

describe('PaymentsService (Unit Test - TDD)', () => {
    let service: PaymentsService;
    let paymentsRepoMock: any;
    let ordersServiceMock: any;
    let gatewayMock: any;
    let prismaMock: any;
    let vnpayGatewayMock: any;

    const getExpectedHash = (orderId: string, method: PaymentMethod, amount: bigint) => {return crypto.createHash('sha256').update(JSON.stringify({ orderId, method, amount: amount.toString() })).digest('hex');};

    beforeEach(() => {
        paymentsRepoMock = {
            findByIdempotencyKey: vi.fn(),
            findStatusByIdempotencyKeyForUser: vi.fn(),
            findByGatewayReference: vi.fn(),
            findProcessingByOrderId: vi.fn().mockResolvedValue(null),
            createProcessingPayment: vi.fn(),
            markSucceeded: vi.fn(),
            markFailed: vi.fn(),
        };
        ordersServiceMock = {
            getOrderForPayment: vi.fn(),
            getOrderForPaymentForUpdate: vi.fn(),
            transitionForPaymentRetry: vi.fn(),
            markOrderPaid: vi.fn(),
            markOrderPaymentFailed: vi.fn(),
        };
        gatewayMock = {charge: vi.fn(),};
        prismaMock = {$transaction: vi.fn((callback) => callback(prismaMock)),};
        vnpayGatewayMock = {
            isEnabled: vi.fn().mockReturnValue(true),
            createPaymentUrl: vi.fn().mockReturnValue({ gatewayReference: 'vnp-ref-1', paymentUrl: 'https://sandbox.vnpayment.vn/pay?signed=1' }),
            verifyCallback: vi.fn(),
            frontendReturnUrl: vi.fn().mockReturnValue('https://brew.example/checkout?paymentReturn=1'),
        };

        service = new PaymentsService(
            paymentsRepoMock,
            ordersServiceMock,
            gatewayMock,
            prismaMock,
            vnpayGatewayMock,
        );
    });

    describe('getPaymentStatus', () => {
        it('trả trạng thái PROCESSING hiện tại, không gọi gateway hoặc tạo attempt mới', async () => {
            paymentsRepoMock.findStatusByIdempotencyKeyForUser.mockResolvedValue({
                orderId: 'order-1',
                status: PaymentStatus.PROCESSING,
                gatewayTransactionId: null,
                failureCode: null,
            });
            const result = await service.getPaymentStatus('key-1', 'user-1');
            expect(paymentsRepoMock.findStatusByIdempotencyKeyForUser).toHaveBeenCalledWith('key-1', 'user-1');
            expect(result).toEqual({
                success: false,
                isRetried: true,
                status: PaymentStatus.PROCESSING,
                gatewayTransactionId: undefined,
                errorCode: undefined,
            });
            expect(gatewayMock.charge).not.toHaveBeenCalled();
            expect(paymentsRepoMock.createProcessingPayment).not.toHaveBeenCalled();
        });

        it('trả PAYMENT_NOT_FOUND nếu key không thuộc Order của customer hoặc không tồn tại', async () => {
            paymentsRepoMock.findStatusByIdempotencyKeyForUser.mockResolvedValue(null);
            await expect(service.getPaymentStatus('foreign-or-missing-key', 'user-1'))
                .rejects.toThrow(NotFoundException);
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });
    });

    describe('processPayment', () => {
        const idempotencyKey = 'idemp-123';
        const orderId = 'o-1';
        const userId = 'u-1';
        const method = PaymentMethod.E_WALLET;
        const amount = 100000n;
        const expectedHash = getExpectedHash(orderId, method, amount);
        const vnpayExpectedHash = getExpectedHash(orderId, PaymentMethod.VNPAY, amount);

        it('1. Nên ném 409 IDEMPOTENCY_KEY_REUSED nếu trùng key nhưng khác requestHash', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue({
                idempotencyKey,
                requestHash: 'chuoi-hash-khac-hoan-toan',
            });

            await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount })).rejects.toThrow(new ConflictException({code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency Key đã được sử dụng cho một payload khác.'}));
        });

        it('2. Nên ném 409 PAYMENT_IN_PROGRESS nếu trùng key, cùng hash và đang PROCESSING', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue({
                idempotencyKey,
                requestHash: expectedHash,
                status: PaymentStatus.PROCESSING,
            });

            await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount }))
                .rejects.toThrow(new ConflictException({
                    code: 'PAYMENT_IN_PROGRESS',
                    message: 'Giao dịch đang được xử lý, vui lòng không thử lại.',
                }));
        });

        it('3. Nên trả về kết quả cũ (isRetried: true) không gọi Gateway nếu đã thanh toán hoàn tất SUCCEEDED', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue({
                idempotencyKey,
                requestHash: expectedHash,
                status: PaymentStatus.SUCCEEDED,
                gatewayTransactionId: 'GW-1',
            });

            const result = await service.processPayment({ idempotencyKey, orderId, userId, method, amount });

            expect(gatewayMock.charge).not.toHaveBeenCalled();
            expect(result).toEqual({
                success: true,
                isRetried: true,
                status: PaymentStatus.SUCCEEDED,
                gatewayTransactionId: 'GW-1',
            });
        });

        it('4. Nên ném 409 ORDER_ALREADY_PAID nếu dùng key mới nhưng đơn hàng đã thanh toán PAID', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({ status: OrderStatus.PAID });

            await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount }))
                    .rejects.toThrow(new ConflictException({code: 'ORDER_ALREADY_PAID', message: 'Đơn hàng này đã được thanh toán.'}));
        });

        it('5. Nên ném 409 ORDER_INVALID_TRANSITION nếu đơn hàng bị hủy hoặc đang ở trạng thái không cho phép thanh toán', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({status: OrderStatus.CANCELLED});

            await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount })).rejects.toThrow(new ConflictException({code: 'ORDER_INVALID_TRANSITION', message: 'Trạng thái đơn hàng không hợp lệ để thanh toán.'}));
        });

        it('6. Thành công (SUCCEEDED): Tạo PROCESSING, gọi Gateway ngoài tx, mở tx cập nhật Repository và OrdersService, trạng thái SUCCEEDED và PAID', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({status: OrderStatus.PENDING});
            paymentsRepoMock.createProcessingPayment.mockResolvedValue({ id: 'p-1' });

            // Gateway trả về thành công
            gatewayMock.charge.mockResolvedValue({ success: true, gatewayTransactionId: 'GW-123' });

            const result = await service.processPayment({ idempotencyKey, orderId, userId, method, amount });

            expect(paymentsRepoMock.createProcessingPayment).toHaveBeenCalledWith({
                orderId,
                idempotencyKey,
                requestHash: expectedHash,
                method,
                amount,
            }, prismaMock);
            // Xác nhận Order được khóa trước khi tạo Payment PROCESSING.
            expect(ordersServiceMock.getOrderForPaymentForUpdate).toHaveBeenCalledWith(
                orderId,
                userId,
                prismaMock,
            );
            // Đảm bảo gọi Gateway sau khi transaction tạo Payment đã hoàn tất.
            expect(gatewayMock.charge).toHaveBeenCalledWith(Number(amount), method);

            // Đảm bảo cập nhật trong Transaction
            expect(prismaMock.$transaction).toHaveBeenCalled();
            expect(paymentsRepoMock.markSucceeded).toHaveBeenCalledWith('p-1', 'GW-123', expect.any(Date), prismaMock);
            expect(ordersServiceMock.markOrderPaid).toHaveBeenCalledWith(orderId, userId, amount, prismaMock);

            expect(result.success).toBe(true);
        });

        it('7. Thất bại (FAILED): Tạo PROCESSING, gọi Gateway thất bại, mở tx cập nhật Repository và OrdersService, cập nhật FAILED và PAYMENT_FAILED trong tx', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({status: OrderStatus.PENDING});
            paymentsRepoMock.createProcessingPayment.mockResolvedValue({ id: 'p-1' });

            // Gateway trả về thất bại
            gatewayMock.charge.mockResolvedValue({ success: false, errorCode: 'FUNDS_EMPTY' });

            const result = await service.processPayment({ idempotencyKey, orderId, userId, method, amount });

            expect(prismaMock.$transaction).toHaveBeenCalled();
            expect(paymentsRepoMock.markFailed).toHaveBeenCalledWith('p-1', 'FUNDS_EMPTY', expect.any(Date), prismaMock);
            expect(ordersServiceMock.markOrderPaymentFailed).toHaveBeenCalledWith(orderId, userId, 'FUNDS_EMPTY', prismaMock);

            expect(result.success).toBe(false);
        });
        it('retry key mới chuyển FAILED về PENDING trước khi gọi gateway', async () => {
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({ status: OrderStatus.PAYMENT_FAILED, reservationExpiresAt: new Date(Date.now() + 60000) });
            paymentsRepoMock.createProcessingPayment.mockResolvedValue({ id: 'retry' });
            gatewayMock.charge.mockResolvedValue({ success: true });
            await service.processPayment({ idempotencyKey, orderId, userId, method, amount });
            expect(ordersServiceMock.transitionForPaymentRetry).toHaveBeenCalledWith(
                orderId,
                userId,
                'Khách hàng thực hiện lại thanh toán',
                prismaMock,
            );
            expect(ordersServiceMock.transitionForPaymentRetry.mock.invocationCallOrder[0]).toBeLessThan(gatewayMock.charge.mock.invocationCallOrder[0]);
        });

        it('không retry FAILED đã hết hạn và không gọi gateway', async () => {
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({ status: OrderStatus.PAYMENT_FAILED, reservationExpiresAt: new Date(0) });
            await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount })).rejects.toMatchObject({ response: { code: 'ORDER_EXPIRED' } });
            expect(ordersServiceMock.transitionForPaymentRetry).not.toHaveBeenCalled();
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('không gọi gateway nếu CAS retry bị từ chối', async () => {
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({ status: OrderStatus.PAYMENT_FAILED, reservationExpiresAt: new Date(Date.now() + 60000) });
            ordersServiceMock.transitionForPaymentRetry.mockRejectedValue(new ConflictException('Concurrent transition'));
            await expect(service.processPayment({ idempotencyKey, orderId, userId, method, amount })).rejects.toThrow(new ConflictException({ code: 'PAYMENT_IN_PROGRESS', message: 'Một yêu cầu thanh toán khác đang được xử lý cho đơn hàng này.' }));
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('8. Nên ném 409 ORDER_EXPIRED nếu đơn hàng PENDING nhưng đã quá hạn giữ chỗ', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);

            // Giả lập đơn hàng PENDING đã quá hạn giữ chỗ.
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PENDING,
                reservationExpiresAt: new Date(Date.now() - 1000),
            });

            await expect(
                service.processPayment({ idempotencyKey, orderId, userId, method, amount }),
            ).rejects.toThrow(new ConflictException({
                code: 'ORDER_EXPIRED',
                message: 'Đơn hàng đã hết hạn thanh toán do quá thời gian giữ chỗ.',
            }));
        });

        it('9. Replay cùng idempotency key của Payment FAILED phải trả kết quả cũ, không gọi Gateway', async () => {
            // Cùng key luôn trả kết quả cũ; retry nghiệp vụ phải dùng một key mới.
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue({
                idempotencyKey,
                requestHash: expectedHash,
                status: PaymentStatus.FAILED,
                failureCode: 'FUNDS_EMPTY',
            });

            const result = await service.processPayment({ idempotencyKey, orderId, userId, method, amount });

            expect(result).toEqual({
                success: false,
                isRetried: true,
                status: PaymentStatus.FAILED,
                errorCode: 'FUNDS_EMPTY',
            });
            expect(ordersServiceMock.transitionForPaymentRetry).not.toHaveBeenCalled();
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('10. Retry bằng key mới chuyển PAYMENT_FAILED về PENDING và tạo Payment trong cùng transaction', async () => {
            const retryKey = 'idemp-retry-456';
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PAYMENT_FAILED,
                reservationExpiresAt: new Date(Date.now() + 60_000),
            });
            paymentsRepoMock.createProcessingPayment.mockResolvedValue({ id: 'p-retry' });
            gatewayMock.charge.mockResolvedValue({
                success: true,
                gatewayTransactionId: 'GW-RETRY',
            });

            const result = await service.processPayment({
                idempotencyKey: retryKey,
                orderId,
                userId,
                method,
                amount,
            });

            // Transaction đầu tiên đổi Order + tạo PROCESSING; transaction thứ hai quyết toán Gateway.
            expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
            expect(ordersServiceMock.transitionForPaymentRetry).toHaveBeenCalledWith(
                orderId,
                userId,
                'Khách hàng thực hiện lại thanh toán',
                prismaMock,
            );
            expect(paymentsRepoMock.createProcessingPayment).toHaveBeenCalledWith(
                {
                    orderId,
                    idempotencyKey: retryKey,
                    requestHash: expectedHash,
                    method,
                    amount,
                },
                prismaMock,
            );
            expect(
                ordersServiceMock.transitionForPaymentRetry.mock.invocationCallOrder[0],
            ).toBeLessThan(
                paymentsRepoMock.createProcessingPayment.mock.invocationCallOrder[0],
            );
            expect(gatewayMock.charge).toHaveBeenCalledWith(Number(amount), method);
            expect(result.success).toBe(true);
        });

        it('11. Không cho retry nếu Order PAYMENT_FAILED đã hết hạn giữ chỗ', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PAYMENT_FAILED,
                reservationExpiresAt: new Date(Date.now() - 1000),
            });

            await expect(
                service.processPayment({
                    idempotencyKey: 'idemp-expired-retry',
                    orderId,
                    userId,
                    method,
                    amount,
                }),
            ).rejects.toThrow(new ConflictException({
                code: 'ORDER_EXPIRED',
                message: 'Đơn hàng đã hết hạn thanh toán do quá thời gian giữ chỗ.',
            }));

            expect(ordersServiceMock.transitionForPaymentRetry).not.toHaveBeenCalled();
            expect(paymentsRepoMock.createProcessingPayment).not.toHaveBeenCalled();
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('12. Chặn Payment PROCESSING thứ hai trên cùng Order bằng idempotency key khác', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PENDING,
                reservationExpiresAt: new Date(Date.now() + 60_000),
            });
            paymentsRepoMock.createProcessingPayment.mockRejectedValue({ code: 'P2002' });

            await expect(
                service.processPayment({
                    idempotencyKey: 'idemp-concurrent-2',
                    orderId,
                    userId,
                    method,
                    amount,
                }),
            ).rejects.toThrow(new ConflictException({
                code: 'PAYMENT_IN_PROGRESS',
                message: 'Đơn hàng đang có giao dịch thanh toán được xử lý.',
            }));

            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('13. Phân biệt key bị tái sử dụng khi unique constraint thắng cuộc đua insert', async () => {
            paymentsRepoMock.findByIdempotencyKey
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({
                    requestHash: 'different-request-hash',
                    status: PaymentStatus.PROCESSING,
                });
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PENDING,
                reservationExpiresAt: new Date(Date.now() + 60_000),
            });
            paymentsRepoMock.createProcessingPayment.mockRejectedValue({ code: 'P2002' });

            await expect(
                service.processPayment({
                    idempotencyKey: 'idemp-raced-payload',
                    orderId,
                    userId,
                    method,
                    amount,
                }),
            ).rejects.toMatchObject({
                response: { code: 'IDEMPOTENCY_KEY_REUSED' },
            });

            expect(paymentsRepoMock.findByIdempotencyKey).toHaveBeenCalledTimes(2);
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('14. Trả 409 PAYMENT_IN_PROGRESS khi unique constraint phát hiện cùng key và cùng payload đang xử lý', async () => {
            paymentsRepoMock.findByIdempotencyKey
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({
                    requestHash: expectedHash,
                    status: PaymentStatus.PROCESSING,
                });
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PENDING,
                reservationExpiresAt: new Date(Date.now() + 60_000),
            });
            paymentsRepoMock.createProcessingPayment.mockRejectedValue({ code: 'P2002' });

            await expect(
                service.processPayment({
                    idempotencyKey: 'idemp-raced-same-payload',
                    orderId,
                    userId,
                    method,
                    amount,
                }),
            ).rejects.toMatchObject({
                response: { code: 'PAYMENT_IN_PROGRESS' },
            });

            expect(paymentsRepoMock.findByIdempotencyKey).toHaveBeenCalledTimes(2);
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('rejects a different idempotency key while another payment for the same order is PROCESSING', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            paymentsRepoMock.findProcessingByOrderId.mockResolvedValue({
                id: 'p-existing',
                idempotencyKey: 'different-key',
                status: PaymentStatus.PROCESSING,
            });
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PENDING,
                reservationExpiresAt: new Date(Date.now() + 60_000),
            });

            await expect(service.processPayment({
                idempotencyKey: 'new-key',
                orderId,
                userId,
                method,
                amount,
            })).rejects.toMatchObject({
                response: { code: 'PAYMENT_IN_PROGRESS' },
            });

            expect(paymentsRepoMock.createProcessingPayment).not.toHaveBeenCalled();
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('15. Chuyển lỗi tranh quyền retry đồng thời thành 409 PAYMENT_IN_PROGRESS', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PAYMENT_FAILED,
                reservationExpiresAt: new Date(Date.now() + 60_000),
            });
            ordersServiceMock.transitionForPaymentRetry.mockRejectedValue(
                new ConflictException('Order status changed; cannot update this order'),
            );

            await expect(
                service.processPayment({
                    idempotencyKey: 'idemp-concurrent-retry',
                    orderId,
                    userId,
                    method,
                    amount,
                }),
            ).rejects.toThrow(new ConflictException({
                code: 'PAYMENT_IN_PROGRESS',
                message: 'Một yêu cầu thanh toán khác đang được xử lý cho đơn hàng này.',
            }));

            expect(paymentsRepoMock.createProcessingPayment).not.toHaveBeenCalled();
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('creates a persisted VNPay intent and never calls MockGateway', async () => {
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PENDING,
                orderNumber: 'BL-2026-001',
                reservationExpiresAt: new Date(Date.now() + 10 * 60_000),
            });
            paymentsRepoMock.createProcessingPayment.mockResolvedValue({
                id: 'p-vnpay',
                paymentUrl: 'https://sandbox.vnpayment.vn/pay?signed=1',
            });
            const result = await service.processPayment({
                idempotencyKey: 'vnpay-key',
                orderId,
                userId,
                method: PaymentMethod.VNPAY,
                amount,
                clientIp: '203.0.113.10',
            });
            expect(vnpayGatewayMock.createPaymentUrl).toHaveBeenCalledWith({
                amount,
                orderNumber: 'BL-2026-001',
                expiresAt: expect.any(Date),
                ipAddress: '203.0.113.10',
            });
            expect(paymentsRepoMock.createProcessingPayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: PaymentMethod.VNPAY,
                    gatewayReference: 'vnp-ref-1',
                    paymentUrl: 'https://sandbox.vnpayment.vn/pay?signed=1',
                }),
                prismaMock,
            );
            expect(gatewayMock.charge).not.toHaveBeenCalled();
            expect(ordersServiceMock.markOrderPaid).not.toHaveBeenCalled();
            expect(result).toMatchObject({
                success: false,
                status: PaymentStatus.PROCESSING,
                paymentUrl: 'https://sandbox.vnpayment.vn/pay?signed=1',
            });
        });

        it('replays the same persisted VNPay URL for the same idempotency key', async () => {
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue({
                requestHash: vnpayExpectedHash,
                method: PaymentMethod.VNPAY,
                status: PaymentStatus.PROCESSING,
                paymentUrl: 'https://sandbox.vnpayment.vn/pay?signed=1',
            });
            const result = await service.processPayment({
                idempotencyKey, orderId, userId, method: PaymentMethod.VNPAY, amount,
            });
            expect(result).toMatchObject({
                status: PaymentStatus.PROCESSING,
                isRetried: true,
                paymentUrl: 'https://sandbox.vnpayment.vn/pay?signed=1',
            });
            expect(vnpayGatewayMock.createPaymentUrl).not.toHaveBeenCalled();
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('rejects a new VNPay attempt while the gateway is disabled', async () => {
            vnpayGatewayMock.isEnabled.mockReturnValue(false);
            await expect(service.processPayment({
                idempotencyKey, orderId, userId, method: PaymentMethod.VNPAY, amount,
            })).rejects.toMatchObject({
                response: { code: 'VNPAY_NOT_CONFIGURED' },
            });
            expect(paymentsRepoMock.createProcessingPayment).not.toHaveBeenCalled();
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('settles a valid VNPay IPN once and rejects a duplicate callback', async () => {
            const callback = {
                vnp_TxnRef: 'vnp-ref-1',
                vnp_Amount: (amount * 100n).toString(),
                vnp_TmnCode: 'DEMO1234',
                vnp_ResponseCode: '00',
                vnp_TransactionStatus: '00',
                vnp_TransactionNo: 'vnp-transaction-1',
            };
            vnpayGatewayMock.verifyCallback.mockReturnValue(callback);
            paymentsRepoMock.findByGatewayReference.mockResolvedValue({
                id: 'p-vnpay',
                orderId,
                amount,
                method: PaymentMethod.VNPAY,
                status: PaymentStatus.PROCESSING,
                order: { userId },
            });
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({ status: OrderStatus.PENDING });
            const first = await service.handleVnpayIpn(callback);
            expect(first).toEqual({ RspCode: '00', Message: 'Confirm Success' });
            expect(paymentsRepoMock.markSucceeded).toHaveBeenCalledWith(
                'p-vnpay', 'vnp-transaction-1', expect.any(Date), prismaMock,
            );
            expect(ordersServiceMock.markOrderPaid).toHaveBeenCalledWith(orderId, userId, amount, prismaMock);

            paymentsRepoMock.findByGatewayReference.mockResolvedValue({
                id: 'p-vnpay',
                orderId,
                amount,
                method: PaymentMethod.VNPAY,
                status: PaymentStatus.SUCCEEDED,
                order: { userId },
            });
            const duplicate = await service.handleVnpayIpn(callback);
            expect(duplicate.RspCode).toBe('02');
            expect(paymentsRepoMock.markSucceeded).toHaveBeenCalledTimes(1);
        });

        it('rejects invalid VNPay signatures and amount mismatches without settlement', async () => {
            vnpayGatewayMock.verifyCallback.mockReturnValueOnce(null);
            expect(await service.handleVnpayIpn({})).toEqual({
                RspCode: '97', Message: 'Invalid signature',
            });
            vnpayGatewayMock.verifyCallback.mockReturnValueOnce({
                vnp_TxnRef: 'vnp-ref-1',
                vnp_Amount: '1',
                vnp_TmnCode: 'DEMO1234',
                vnp_ResponseCode: '00',
                vnp_TransactionStatus: '00',
            });
            paymentsRepoMock.findByGatewayReference.mockResolvedValue({
                id: 'p-vnpay',
                orderId,
                amount,
                method: PaymentMethod.VNPAY,
                status: PaymentStatus.PROCESSING,
                order: { userId },
            });
            expect(await service.handleVnpayIpn({})).toEqual({
                RspCode: '04', Message: 'Invalid amount',
            });
            expect(paymentsRepoMock.markSucceeded).not.toHaveBeenCalled();
            expect(paymentsRepoMock.markFailed).not.toHaveBeenCalled();
        });

        it('Return redirect never settles a Payment', async () => {
            vnpayGatewayMock.verifyCallback.mockReturnValue(null);
            await expect(service.getVnpayReturnRedirect({})).resolves.toBe(
                'https://brew.example/checkout?paymentReturn=1',
            );
            expect(paymentsRepoMock.markSucceeded).not.toHaveBeenCalled();
            expect(paymentsRepoMock.markFailed).not.toHaveBeenCalled();
        });
    });
});

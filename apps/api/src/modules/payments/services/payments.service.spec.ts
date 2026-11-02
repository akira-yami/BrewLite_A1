import { ConflictException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    const getExpectedHash = (orderId: string, method: PaymentMethod, amount: bigint) => {return crypto.createHash('sha256').update(JSON.stringify({ orderId, method, amount: amount.toString() })).digest('hex');};

    beforeEach(() => {
        paymentsRepoMock = {
            findByIdempotencyKey: vi.fn(),
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
        vnpayGatewayMock = {
            createPaymentUrl: vi.fn().mockReturnValue('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?signature=test'),
            verifyResponse: vi.fn().mockReturnValue(false),
            normalizeQuery: vi.fn((query) => query),
            createFrontendReturnUrl: vi.fn().mockReturnValue('https://web.example.test/orders/confirmation'),
        };
        paymentsRepoMock.findByGatewayReference = vi.fn();
        prismaMock = {$transaction: vi.fn((callback) => callback(prismaMock)),};

        service = new PaymentsService(
            paymentsRepoMock,
            ordersServiceMock,
            gatewayMock,
            prismaMock,
            vnpayGatewayMock,
        );
    });

    describe('processPayment', () => {
        const idempotencyKey = 'idemp-123';
        const orderId = 'o-1';
        const userId = 'u-1';
        const method = PaymentMethod.E_WALLET;
        const amount = 100000n;
        const expectedHash = getExpectedHash(orderId, method, amount);

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
                gatewayProvider: 'MOCK',
                gatewayReference: undefined,
                paymentUrl: undefined,
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
                    gatewayProvider: 'MOCK',
                    gatewayReference: undefined,
                    paymentUrl: undefined,
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

            expect(paymentsRepoMock.findByIdempotencyKey).toHaveBeenCalledTimes(3);
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('14. Trả 409 PAYMENT_IN_PROGRESS khi unique constraint phát hiện cùng key và cùng payload đang xử lý', async () => {
            paymentsRepoMock.findByIdempotencyKey
                .mockResolvedValueOnce(null)
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

            expect(paymentsRepoMock.findByIdempotencyKey).toHaveBeenCalledTimes(3);
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

        it('16. Tạo và replay cùng VNPay redirect mà không gọi MockGateway', async () => {
            vi.stubEnv('PAYMENT_GATEWAY', 'vnpay');
            const reservationExpiresAt = new Date(Date.now() + 10 * 60_000);
            paymentsRepoMock.findByIdempotencyKey.mockResolvedValue(null);
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PENDING,
                reservationExpiresAt,
            });
            paymentsRepoMock.createProcessingPayment.mockResolvedValue({ id: 'p-vnpay' });

            const result = await service.processPayment({
                idempotencyKey,
                orderId,
                userId,
                method,
                amount,
                ipAddress: '203.0.113.7',
                reservationExpiresAt,
            });

            expect(result).toMatchObject({
                success: false,
                isRetried: false,
                status: PaymentStatus.PROCESSING,
                redirectUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?signature=test',
            });
            expect(vnpayGatewayMock.createPaymentUrl).toHaveBeenCalledWith(expect.objectContaining({
                amount,
                ipAddress: '203.0.113.7',
                expiresAt: reservationExpiresAt,
            }));
            expect(paymentsRepoMock.createProcessingPayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderId,
                    idempotencyKey,
                    gatewayProvider: 'VNPAY',
                    gatewayReference: expect.stringMatching(/^[A-F0-9]{32}$/),
                    paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?signature=test',
                }),
                prismaMock,
            );
            expect(gatewayMock.charge).not.toHaveBeenCalled();
        });

        it('17. Xác nhận IPN thành công trong transaction sau khi kiểm tra chữ ký và amount', async () => {
            vnpayGatewayMock.verifyResponse.mockReturnValue(true);
            const payment = {
                id: 'p-vnpay',
                orderId,
                amount,
                status: PaymentStatus.PROCESSING,
                gatewayProvider: 'VNPAY',
                order: { userId },
            };
            paymentsRepoMock.findByGatewayReference.mockResolvedValue(payment);
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PENDING,
                total: amount,
            });

            const result = await service.handleVnpayIpn({
                vnp_TxnRef: 'VNREF123',
                vnp_TransactionNo: '900001',
                vnp_ResponseCode: '00',
                vnp_TransactionStatus: '00',
                vnp_Amount: (amount * 100n).toString(),
                vnp_TmnCode: 'DEMO1234',
                vnp_SecureHash: 'a'.repeat(128),
            });

            expect(result).toEqual({ RspCode: '00', Message: 'Confirm Success' });
            expect(paymentsRepoMock.findByGatewayReference).toHaveBeenCalledTimes(2);
            expect(paymentsRepoMock.markSucceeded).toHaveBeenCalledWith(
                'p-vnpay',
                '900001',
                expect.any(Date),
                prismaMock,
            );
            expect(ordersServiceMock.markOrderPaid).toHaveBeenCalledWith(
                orderId,
                userId,
                amount,
                prismaMock,
            );
            expect(ordersServiceMock.markOrderPaymentFailed).not.toHaveBeenCalled();
        });

        it('18. IPN từ chối giao dịch chuyển Payment và Order sang FAILED trong cùng transaction', async () => {
            vnpayGatewayMock.verifyResponse.mockReturnValue(true);
            const payment = {
                id: 'p-vnpay',
                orderId,
                amount,
                status: PaymentStatus.PROCESSING,
                gatewayProvider: 'VNPAY',
                order: { userId },
            };
            paymentsRepoMock.findByGatewayReference.mockResolvedValue(payment);
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PENDING,
                total: amount,
            });

            const result = await service.handleVnpayIpn({
                vnp_TxnRef: 'VNREF123',
                vnp_TransactionNo: '900002',
                vnp_ResponseCode: '24',
                vnp_TransactionStatus: '02',
                vnp_Amount: (amount * 100n).toString(),
                vnp_TmnCode: 'DEMO1234',
                vnp_SecureHash: 'b'.repeat(128),
            });

            expect(result).toEqual({ RspCode: '00', Message: 'Confirm Success' });
            expect(paymentsRepoMock.markFailed).toHaveBeenCalledWith(
                'p-vnpay',
                'VNPAY_24_02',
                expect.any(Date),
                prismaMock,
                '900002',
            );
            expect(ordersServiceMock.markOrderPaymentFailed).toHaveBeenCalledWith(
                orderId,
                userId,
                'VNPAY_24_02',
                prismaMock,
            );
            expect(ordersServiceMock.markOrderPaid).not.toHaveBeenCalled();
        });

        it('19. Từ chối IPN sai chữ ký và không truy cập Payment repository', async () => {
            vnpayGatewayMock.verifyResponse.mockReturnValue(false);
            const result = await service.handleVnpayIpn({
                vnp_TxnRef: 'VNREF123',
                vnp_SecureHash: 'invalid',
            });
            expect(result).toEqual({ RspCode: '97', Message: 'Invalid signature' });
            expect(paymentsRepoMock.findByGatewayReference).not.toHaveBeenCalled();
            expect(paymentsRepoMock.markSucceeded).not.toHaveBeenCalled();
        });

        it('20. Từ chối IPN sai amount và không quyết toán giao dịch', async () => {
            vnpayGatewayMock.verifyResponse.mockReturnValue(true);
            paymentsRepoMock.findByGatewayReference.mockResolvedValue({
                id: 'p-vnpay',
                orderId,
                amount,
                status: PaymentStatus.PROCESSING,
                gatewayProvider: 'VNPAY',
                order: { userId },
            });
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PENDING,
                total: amount,
            });
            const result = await service.handleVnpayIpn({
                vnp_TxnRef: 'VNREF123',
                vnp_TransactionNo: '900003',
                vnp_ResponseCode: '00',
                vnp_TransactionStatus: '00',
                vnp_Amount: '1',
                vnp_TmnCode: 'DEMO1234',
                vnp_SecureHash: 'c'.repeat(128),
            });
            expect(result).toEqual({ RspCode: '04', Message: 'Invalid amount' });
            expect(paymentsRepoMock.markSucceeded).not.toHaveBeenCalled();
            expect(ordersServiceMock.markOrderPaid).not.toHaveBeenCalled();
        });

        it('21. IPN lặp cho Payment đã quyết toán trả ORDER_ALREADY_CONFIRMED', async () => {
            vnpayGatewayMock.verifyResponse.mockReturnValue(true);
            paymentsRepoMock.findByGatewayReference.mockResolvedValue({
                id: 'p-vnpay',
                orderId,
                amount,
                status: PaymentStatus.SUCCEEDED,
                gatewayProvider: 'VNPAY',
                order: { userId },
            });
            ordersServiceMock.getOrderForPaymentForUpdate.mockResolvedValue({
                status: OrderStatus.PAID,
                total: amount,
            });
            const result = await service.handleVnpayIpn({
                vnp_TxnRef: 'VNREF123',
                vnp_TransactionNo: '900004',
                vnp_ResponseCode: '00',
                vnp_TransactionStatus: '00',
                vnp_Amount: (amount * 100n).toString(),
                vnp_TmnCode: 'DEMO1234',
                vnp_SecureHash: 'd'.repeat(128),
            });
            expect(result).toEqual({ RspCode: '02', Message: 'Order already confirmed' });
            expect(paymentsRepoMock.markSucceeded).not.toHaveBeenCalled();
            expect(paymentsRepoMock.markFailed).not.toHaveBeenCalled();
        });

        it('22. Return URL chỉ xác minh và redirect; không cập nhật trạng thái Payment', async () => {
            vnpayGatewayMock.verifyResponse.mockReturnValue(true);
            vnpayGatewayMock.createFrontendReturnUrl.mockReturnValue(
                'https://web.example.test/orders/confirmation?orderId=o-1&paymentReturn=1',
            );
            paymentsRepoMock.findByGatewayReference.mockResolvedValue({
                id: 'p-vnpay',
                orderId,
                gatewayProvider: 'VNPAY',
            });
            const result = await service.getVnpayReturnRedirect({
                vnp_TxnRef: 'VNREF123',
                vnp_SecureHash: 'e'.repeat(128),
            });
            expect(result).toContain('/orders/confirmation');
            expect(paymentsRepoMock.markSucceeded).not.toHaveBeenCalled();
            expect(paymentsRepoMock.markFailed).not.toHaveBeenCalled();
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
    });
});

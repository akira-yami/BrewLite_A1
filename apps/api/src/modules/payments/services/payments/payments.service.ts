import { Injectable, Logger, ConflictException, BadRequestException} from '@nestjs/common';
import { CreatePaymentDto } from '../../dto/create-payment.dto.js';
import { PaymentResponseDto, PaymentStatus } from '../../dto/payment-response.dto.js';
import { IPaymentGateway } from '../../gateways/payment.gateway.js';
import { MockGatewayService } from '../mock-gateway/mock-gateway.service.js';

@Injectable()
export class PaymentsService implements IPaymentGateway {
    private readonly logger = new Logger(PaymentsService.name);

    // Nhúng MockGateway vào đây để gọi
    constructor(private readonly mockGateway: MockGatewayService) {}

    async processPayment(payload: CreatePaymentDto): Promise<PaymentResponseDto> {
        this.logger.log(`[Idempotency] Đang kiểm tra Key: ${payload.idempotencyKey}`);

        /* ---------------------------------------------------------
        * LUỒNG 1: KIỂM TRA KHÓA ĐÃ TỒN TẠI (IDEMPOTENCY)
        * (Tạm thời giả lập chưa có khóa trong DB vì đợi Khang)
        * ---------------------------------------------------------*/
        // const existingRecord = await this.prisma.payment.findUnique({ where: { idempotencyKey: payload.idempotencyKey } });
        const existingRecord = null; // Giả lập DB chưa có bản ghi này

        if (existingRecord) {
        this.logger.log(`[Idempotency] Khóa đã tồn tại. Đang so sánh Hash...`);

        // Nhánh 1.1: Hash KHÔNG khớp -> Báo lỗi 409 Conflict
        // if (existingRecord.requestHash !== payload.requestHash) {
        //   throw new ConflictException({
        //     failureCode: 'IDEMPOTENCY_MISMATCH',
        //     message: 'Payload đã bị sửa đổi, không khớp với Idempotency-Key ban đầu!',
        //   });
        // }

        // Nhánh 1.2: Hash KHỚP -> Trả về kết quả cũ (Không gọi lại Gateway)
        this.logger.log(`[Idempotency] Hash khớp. Trả về kết quả giao dịch cũ.`);
        return {
            paymentId: 'PAY_CŨ_TỪ_DB',
            orderId: payload.orderId,
            amount: payload.amount,
            success: true,
            status: PaymentStatus.PAID,
            gatewayTransactionId: 'MOCK_TX_CŨ',
            failureCode: null,
            message: 'Lấy từ lịch sử giao dịch',
            isRetried: true, // Cờ báo hiệu đây là dữ liệu cũ
        };
        }

        /* ---------------------------------------------------------
        * LUỒNG 2: KHÓA MỚI -> GỌI MOCK GATEWAY & XỬ LÝ KẾT QUẢ
        * ---------------------------------------------------------*/
        this.logger.log(`[Idempotency] Khóa mới. Khởi tạo PROCESSING và gọi Mock Gateway...`);
        // TODO: Lưu DB trạng thái PROCESSING ở đây

        // Gọi Gateway giả lập (Sẽ mất 1-2s chờ mạng)
        const gatewayResult = await this.mockGateway.charge(payload.amount, payload.method);

        // Xử lý kết quả trả về
        if (gatewayResult.success) {
        this.logger.log(`[+] Gateway trả về THÀNH CÔNG. Chuẩn bị cập nhật DB...`);
        // TODO: Mở DB Transaction -> Cập nhật Payment (SUCCEEDED) -> Gọi OrderService (PAID) -> Commit

        return {
            paymentId: 'PAY_MỚI_TỪ_DB',
            orderId: payload.orderId,
            amount: payload.amount,
            success: true,
            status: PaymentStatus.PAID,
            gatewayTransactionId: gatewayResult.gatewayTransactionId || null,
            failureCode: null,
            message: 'Thanh toán thành công',
            isRetried: false,
        };
        } else {
        this.logger.warn(`[-] Gateway trả về THẤT BẠI. Chuẩn bị cập nhật DB...`);
        // TODO: Mở DB Transaction -> Cập nhật Payment (FAILED) -> Gọi OrderService (PAYMENT_FAILED) -> Commit

        throw new BadRequestException({
            success: false,
            status: PaymentStatus.PAYMENT_FAILED,
            failureCode: gatewayResult.errorCode || 'UNKNOWN_ERROR',
            message: 'Thanh toán thất bại từ Gateway',
            isRetried: false,
        });
        }
    }
    }
import { Injectable, Logger, NotImplementedException} from '@nestjs/common';
import { CreatePaymentDto } from '../../dto/create-payment.dto.js';
import { PaymentResponseDto } from '../../dto/payment-response.dto.js';
import { IPaymentGateway } from '../../gateways/payment.gateway.js';
import { MockGatewayService } from '../mock-gateway/mock-gateway.service.js';

@Injectable()
export class PaymentsService implements IPaymentGateway {
    private readonly logger = new Logger(PaymentsService.name);

    // Nhúng MockGateway vào đây để gọi
    constructor(private readonly mockGateway: MockGatewayService) {}

    async processPayment(
        payload: CreatePaymentDto,
        idempotencyKey: string,
        userId: string
    ): Promise<PaymentResponseDto> {
        this.logger.log(`[Sprint 1 Foundation] Chuẩn bị xử lý thanh toán cho Order: ${payload.orderId}, User: ${userId}, Key: ${idempotencyKey}`);

        // TODO (Sprint 2): 1. Nhận Idempotency-Key từ HTTP Header (do Controller truyền xuống)
        // TODO (Sprint 2): 2. Truy vấn OrdersService bằng payload.orderId để lấy tổng tiền (`amount`)
        // TODO (Sprint 2): 3. Tính toán và so khớp Request-Hash để chống sửa đổi payload
        // TODO (Sprint 2): 4. Tra cứu Idempotency-Key trong DB để chống double-charge
        // TODO (Sprint 2): 5. Gọi this.mockGateway.charge(amount, payload.method)
        // TODO (Sprint 2): 6. Mở DB Transaction -> Lưu Payment -> Gọi OrdersService cập nhật Order -> Commit
        
        throw new NotImplementedException(
        'Payment Orchestration (Idempotency, DB Transaction, chuyển trạng thái Order) sẽ được tích hợp ở Sprint 2'
        );

    }
}
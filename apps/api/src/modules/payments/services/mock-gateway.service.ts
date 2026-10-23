import { Injectable, Logger } from '@nestjs/common';
import { IMockGatewayService } from './mock-gateway.interface.js';
import { PaymentMethod } from '../dto/create-payment.dto.js';
import { randomUUID } from 'crypto';

@Injectable()
export class MockGatewayService implements IMockGatewayService {
private readonly logger = new Logger(MockGatewayService.name);

    async charge(
        amount: number,
        method: PaymentMethod
    ): Promise<{ success: boolean; gatewayTransactionId?: string; errorCode?: string }> {
        this.logger.log(`Bắt đầu giả lập thanh toán ${method} với số tiền ${amount}...`);

        // Giả lập mạng bị trễ ngẫu nhiên từ 1000ms đến 2000ms (1-2 giây)
        const delayMs = Math.floor(Math.random() * 1000) + 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Thuật toán tỷ lệ: 80% ra true (Thành công), 20% ra false (Thất bại)
        const isSuccess = Math.random() < 0.8;

        if (isSuccess) {
        // Sinh mã giao dịch giả lập
        const txId = `MOCK_${method}_${randomUUID().substring(0, 8).toUpperCase()}`;
        this.logger.log(`[+] Thanh toán THÀNH CÔNG. Mã giao dịch Gateway: ${txId}`);

        return {
            success: true,
            gatewayTransactionId: txId,
        };
        } else {
        // Giả lập rớt mạng hoặc thẻ hết tiền
        this.logger.warn(`[-] Thanh toán THẤT BẠI. Mã lỗi: INSUFFICIENT_FUNDS`);

        return {
            success: false,
            errorCode: 'INSUFFICIENT_FUNDS',
        };
        }
    }
    }
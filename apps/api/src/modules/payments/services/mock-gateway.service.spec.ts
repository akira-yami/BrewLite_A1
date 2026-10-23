import { Test, TestingModule } from '@nestjs/testing';
import { MockGatewayService } from './mock-gateway.service.js';
import { PaymentMethod } from '../dto/create-payment.dto.js';
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';

describe('MockGatewayService', () => {
    let service: MockGatewayService;

    beforeEach(async () => {
        // Khởi tạo một môi trường test cô lập
        const module: TestingModule = await Test.createTestingModule({
        providers: [MockGatewayService],
        }).compile();

        service = module.get<MockGatewayService>(MockGatewayService);

        // Kích hoạt cỗ máy thời gian của Vitest để bỏ qua delay 1-2s (Giải quyết KT-06)
        vi.useFakeTimers();
    });

    afterEach(() => {
        // Xóa các spy sau mỗi lần chạy để không ảnh hưởng test khác
        vi.restoreAllMocks();
        vi.useRealTimers(); // Trả lại thời gian thực sau khi test xong
    });

    describe('charge()', () => {
        it('nên trả về THÀNH CÔNG (success: true) khi random < 0.8', async () => {
        // Ép Math.random trả về 0.5 (nhỏ hơn 0.8 -> Chắc chắn thành công)
        vi.spyOn(Math, 'random').mockReturnValue(0.5);

        // Bắt đầu gọi hàm nhưng không await ngay vì nó vướng setTimeout
        const promise = service.charge(50000, PaymentMethod.E_WALLET);

        // Tua nhanh thời gian để bỏ qua thời gian chờ
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.success).toBe(true);
        expect(result.gatewayTransactionId).toBeDefined();
        expect(result.gatewayTransactionId).toContain('MOCK_E_WALLET_');
        expect(result.errorCode).toBeUndefined(); // Thành công thì không có lỗi
        });

        it('nên trả về THẤT BẠI (success: false) khi random >= 0.8', async () => {
        // Ép Math.random trả về 0.9 (lớn hơn 0.8 -> Chắc chắn thất bại)
        vi.spyOn(Math, 'random').mockReturnValue(0.9);

        const promise = service.charge(50000, PaymentMethod.CARD);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('INSUFFICIENT_FUNDS');
        expect(result.gatewayTransactionId).toBeUndefined(); // Thất bại thì không có mã giao dịch
        });
    });
});
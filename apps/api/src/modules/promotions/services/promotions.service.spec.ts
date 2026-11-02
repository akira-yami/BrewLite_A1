import { UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromotionsService } from './promotions.service.js';
import { PromotionsRepository } from '../repositories/promotions.repository.js';
import type { DiscountType } from '../../../generated/prisma/client.js';

describe('PromotionsService (Unit Test - TDD)', () => {
    let service: PromotionsService;
    let repositoryMock: any;
    const fixedNow = new Date('2026-10-22T08:00:00.000Z');

    const validCoupon = {
        id: 'c-1',
        code: 'WELCOME10',
        discountType: 'PERCENTAGE' as DiscountType,
        discountValue: 10n,
        maxDiscount: 20000n,
        minOrderValue: 50000n,
        usageLimit: 100,
        perUserLimit: 1,
        startsAt: new Date('2026-10-01T00:00:00Z'),
        endsAt: new Date('2026-11-01T00:00:00Z'),
        isActive: true,
    };

    beforeEach(() => {
        repositoryMock = {
        findByCode: vi.fn(),
        lockCoupon: vi.fn(),
        countRedemptions: vi.fn(),
        countTotalRedemptions: vi.fn(),
        createRedemption: vi.fn(),
        };
        service = new PromotionsService(repositoryMock as unknown as PromotionsRepository);
    });

    describe('validateCoupon (UC-07 Preview)', () => {
        it('Nên ném COUPON_NOT_APPLICABLE nếu mã không tồn tại hoặc inactive', async () => {
        repositoryMock.findByCode.mockResolvedValue(null);
        await expect(service.validateCoupon('INVALID', 100000, 'u-1', fixedNow))
            .rejects.toThrow(UnprocessableEntityException);

        repositoryMock.findByCode.mockResolvedValue({ ...validCoupon, isActive: false });
        await expect(service.validateCoupon('WELCOME10', 100000, 'u-1', fixedNow))
            .rejects.toThrow(UnprocessableEntityException);
        });

        it('Nên ném COUPON_NOT_APPLICABLE nếu ngoài thời gian áp dụng', async () => {
        const pastCoupon = { ...validCoupon, endsAt: new Date('2026-10-20T00:00:00Z') };
        repositoryMock.findByCode.mockResolvedValue(pastCoupon);
        await expect(service.validateCoupon('WELCOME10', 100000, 'u-1', fixedNow))
            .rejects.toThrow(UnprocessableEntityException);
        });

        it('Nên ném COUPON_NOT_APPLICABLE nếu chưa đạt giá trị đơn hàng tối thiểu', async () => {
        repositoryMock.findByCode.mockResolvedValue(validCoupon);
        await expect(service.validateCoupon('WELCOME10', 40000, 'u-1', fixedNow))
            .rejects.toThrow(UnprocessableEntityException);
        });

        it('Nên ném COUPON_NOT_APPLICABLE nếu vượt quá perUserLimit', async () => {
        repositoryMock.findByCode.mockResolvedValue(validCoupon);
        repositoryMock.countRedemptions.mockResolvedValue(1); // Đã dùng 1 lần, limit = 1
        await expect(service.validateCoupon('WELCOME10', 100000, 'u-1', fixedNow))
            .rejects.toThrow(UnprocessableEntityException);
        });

        it('Nên tính đúng PERCENTAGE discount có maxDiscount', async () => {
        repositoryMock.findByCode.mockResolvedValue(validCoupon);
        repositoryMock.countRedemptions.mockResolvedValue(0);
        repositoryMock.countTotalRedemptions.mockResolvedValue(0);

        // 10% của 300k = 30k -> Vượt max 20k -> Chỉ giảm 20k
        const result = await service.validateCoupon('WELCOME10', 300000, 'u-1', fixedNow);
        expect(result).toEqual({ code: 'WELCOME10', discountAmount: 20000 });
        });

        it('Nên tính đúng FIXED_AMOUNT discount không vượt quá subtotal', async () => {
            const fixedCoupon = {
                ...validCoupon,
                discountType: 'FIXED_AMOUNT' as DiscountType,
                discountValue: 50000n,
                minOrderValue: 0n // Ghi đè để vượt qua điều kiện kiểm tra subtotal
            };
            repositoryMock.findByCode.mockResolvedValue(fixedCoupon);
            repositoryMock.countRedemptions.mockResolvedValue(0);
            repositoryMock.countTotalRedemptions.mockResolvedValue(0);

            // Giảm 50k cho đơn 40k -> Chỉ giảm 40k
            const result = await service.validateCoupon('WELCOME10', 40000, 'u-1', fixedNow);
            expect(result).toEqual({ code: 'WELCOME10', discountAmount: 40000 });
        });

    });

    describe('quoteAndLock (UC-06 Transaction)', () => {
        it('Nên gọi lockCoupon, kiểm tra điều kiện và trả về CouponQuoteEntity', async () => {
        const txMock = {} as any;
        repositoryMock.lockCoupon.mockResolvedValue(validCoupon);
        repositoryMock.countRedemptions.mockResolvedValue(0);
        repositoryMock.countTotalRedemptions.mockResolvedValue(0);

        const result = await service.quoteAndLock(txMock, 'u-1', 'WELCOME10', 100000n, fixedNow);

        expect(repositoryMock.lockCoupon).toHaveBeenCalledWith('WELCOME10', txMock);
        expect(result).toEqual({
            couponId: 'c-1',
            code: 'WELCOME10',
            discountType: 'PERCENTAGE',
            discountAmount: 10000n,
            userId: 'u-1',
        });
        });

        it('Nên ném COUPON_NOT_APPLICABLE nếu bị khóa dòng trả về null', async () => {
        const txMock = {} as any;
        repositoryMock.lockCoupon.mockResolvedValue(null);

        await expect(service.quoteAndLock(txMock, 'u-1', 'NOT_FOUND', 100000n, fixedNow))
            .rejects.toThrow(UnprocessableEntityException);
        });
    });

    describe('reserve (UC-06 Transaction)', () => {
        it('Nên gọi createRedemption với đúng tx và dữ liệu', async () => {
        const txMock = {} as any;
        const quote = {
            couponId: 'c-1',
            code: 'WELCOME10',
            discountType: 'PERCENTAGE' as DiscountType,
            discountAmount: 15000n,
            userId: 'u-1',
        };
        const expiresAt = new Date('2026-10-22T08:15:00.000Z');
        repositoryMock.createRedemption.mockResolvedValue({ id: 'r-1' });

        await service.reserve(txMock, quote, 'o-1', expiresAt);

        expect(repositoryMock.createRedemption).toHaveBeenCalledWith({
            couponId: 'c-1',
            userId: 'u-1',
            orderId: 'o-1',
            discountAmount: 15000n,
            expiresAt,
        }, txMock);
        });
    });

    describe('releaseByOrderId (Order Expiry / Cancellation)', () => {
        it('Nên gọi repository.releaseByOrderId để chuyển trạng thái CouponRedemption sang EXPIRED hoặc RELEASED', async () => {
            const txMock = {} as any;
            const releasedAt = new Date('2026-10-22T08:30:00.000Z');
            repositoryMock.releaseByOrderId = vi.fn().mockResolvedValue(1);

            const count = await service.releaseByOrderId('o-1', 'EXPIRED', releasedAt, txMock);

            expect(count).toBe(1);
            expect(repositoryMock.releaseByOrderId).toHaveBeenCalledWith(
                'o-1',
                'EXPIRED',
                releasedAt,
                txMock,
            );
        });
    });
});
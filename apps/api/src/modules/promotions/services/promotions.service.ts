import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PromotionsRepository } from '../repositories/promotions.repository.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { CouponQuoteResponseDto } from '../dto/coupon-quote-response.dto.js';
import { toCouponQuoteResponse } from '../mappers/coupon.mapper.js';
import type { CouponQuoteEntity } from '../entities/coupon-quote.entity.js';

@Injectable()
export class PromotionsService {
    constructor(private readonly repository: PromotionsRepository) {}

    async validateCoupon(
        code: string,
        subtotal: number,
        userId: string,
        now: Date,
    ): Promise<CouponQuoteResponseDto> {
        const coupon = await this.repository.findByCode(code);

        if (!coupon || !coupon.isActive) {
            throw new UnprocessableEntityException({
                error: {
                    code: 'COUPON_NOT_APPLICABLE',
                    message: 'Mã giảm giá không tồn tại hoặc đã ngừng hoạt động.',
                },
            });
        }

        if (now < coupon.startsAt || now >= coupon.endsAt) {
            throw new UnprocessableEntityException({
                error: {
                    code: 'COUPON_NOT_APPLICABLE',
                    message: 'Mã giảm giá không trong thời gian có hiệu lực.',
                },
            });
        }

        const subtotalBigInt = BigInt(subtotal);
        if (subtotalBigInt < coupon.minOrderValue) {
            throw new UnprocessableEntityException({
                error: {
                    code: 'COUPON_NOT_APPLICABLE',
                    message: 'Đơn hàng chưa đạt giá trị tối thiểu để áp dụng mã.',
                },
            });
        }

        const userRedemptions = await this.repository.countRedemptions(
        coupon.id,
        userId,
        now,
        );
        if (userRedemptions >= coupon.perUserLimit) {
            throw new UnprocessableEntityException({
                error: {
                    code: 'COUPON_NOT_APPLICABLE',
                    message: 'Bạn đã hết lượt sử dụng mã giảm giá này.',
                },
            });
        }

        if (coupon.usageLimit !== null) {
            const totalRedemptions = await this.repository.countTotalRedemptions(
                coupon.id,
                now,
            );
            if (totalRedemptions >= coupon.usageLimit) {
                throw new UnprocessableEntityException({
                    error: {
                        code: 'COUPON_NOT_APPLICABLE',
                        message: 'Mã giảm giá đã hết lượt sử dụng trên toàn hệ thống.',
                    },
                });
            }
        }

        let discountAmount = 0n;
        if (coupon.discountType === 'PERCENTAGE') {
        discountAmount = (subtotalBigInt * coupon.discountValue) / 100n;
        if (coupon.maxDiscount !== null && discountAmount > coupon.maxDiscount) {
            discountAmount = coupon.maxDiscount;
        }
        } else {
        discountAmount =
            subtotalBigInt < coupon.discountValue
            ? subtotalBigInt
            : coupon.discountValue;
        }

        return toCouponQuoteResponse(coupon.code, discountAmount);
    }

    async quoteAndLock(
        tx: Prisma.TransactionClient,
        userId: string,
        code: string,
        subtotal: bigint,
        now: Date,
    ): Promise<CouponQuoteEntity> {
        const coupon = await this.repository.lockCoupon(code, tx);

        if (!coupon || !coupon.isActive) {
            throw new UnprocessableEntityException({
                error: {
                    code: 'COUPON_NOT_APPLICABLE',
                    message: 'Mã giảm giá không tồn tại hoặc đã ngừng hoạt động.',
                },
            });
        }

        if (now < coupon.startsAt || now >= coupon.endsAt) {
            throw new UnprocessableEntityException({
                error: {
                    code: 'COUPON_NOT_APPLICABLE',
                    message: 'Mã giảm giá không trong thời gian có hiệu lực.',
                },
            });
        }

        if (subtotal < coupon.minOrderValue) {
            throw new UnprocessableEntityException({
                error: {
                    code: 'COUPON_NOT_APPLICABLE',
                    message: 'Đơn hàng chưa đạt giá trị tối thiểu để áp dụng mã.',
                },
            });
        }

        const userRedemptions = await this.repository.countRedemptions(
        coupon.id,
        userId,
        now,
        tx,
        );
        if (userRedemptions >= coupon.perUserLimit) {
            throw new UnprocessableEntityException({
                error: {
                    code: 'COUPON_NOT_APPLICABLE',
                    message: 'Bạn đã hết lượt sử dụng mã giảm giá này.',
                },
            });
        }

        if (coupon.usageLimit !== null) {
            const totalRedemptions = await this.repository.countTotalRedemptions(
                coupon.id,
                now,
                tx,
            );
            if (totalRedemptions >= coupon.usageLimit) {
                throw new UnprocessableEntityException({
                    error: {
                        code: 'COUPON_NOT_APPLICABLE',
                        message: 'Mã giảm giá đã hết lượt sử dụng trên toàn hệ thống.',
                    },
                });
            }
        }

        let discountAmount = 0n;
        if (coupon.discountType === 'PERCENTAGE') {
        discountAmount = (subtotal * coupon.discountValue) / 100n;
        if (coupon.maxDiscount !== null && discountAmount > coupon.maxDiscount) {
            discountAmount = coupon.maxDiscount;
        }
        } else {
        discountAmount =
            subtotal < coupon.discountValue ? subtotal : coupon.discountValue;
        }

        return {
        couponId: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountAmount,
        userId,
        };
    }

    async reserve(
        tx: Prisma.TransactionClient,
        quote: CouponQuoteEntity,
        orderId: string,
        expiresAt: Date,
    ) {
        return this.repository.createRedemption(
        {
            couponId: quote.couponId,
            userId: quote.userId,
            orderId,
            discountAmount: quote.discountAmount,
            expiresAt,
        },
        tx,
        );
    }

/*
*Rà soát consumeRedemption & releaseRedemption trong promotions.service.ts và chạy test promotions.repository.spec.ts
→ Tại sao cần kiểm tra bước này?
    Ở tầng PromotionsRepository, hai hàm consumeByOrderId và releaseByOrderId sử dụng điều kiện where: { orderId, status: 'RESERVED' }.
    Điều này cực kỳ quan trọng vì nó đảm bảo tính Idempotent cho vòng đời Coupon:
        - chỉ những lượt đang RESERVED mới được chuyển sang CONSUMED (khi PAID)
        - hoặc RELEASED/EXPIRED (khi hủy/hết hạn), ngăn chặn tuyệt đối việc tiêu thụ hoặc giải phóng mã lặp lại.
*/

    async consumeRedemption(tx: Prisma.TransactionClient, orderId: string): Promise<void> {await this.repository.consumeByOrderId(orderId, new Date(), tx);}

    async releaseRedemption(
        tx: Prisma.TransactionClient,
        orderId: string,
        isExpired: boolean,
    ): Promise<void> {
        const targetStatus = isExpired ? 'EXPIRED' : 'RELEASED';
        await this.repository.releaseByOrderId(orderId, targetStatus, new Date(), tx);
    }
}
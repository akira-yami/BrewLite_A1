
import {
  CouponRedemptionStatus,
  DiscountType,
  OrderStatus,
  type PrismaClient,
} from '../src/generated/prisma/client.js';

export async function seedCoupons(prisma: PrismaClient) {
  const now = new Date();

  // Coupon có hiệu lực từ hôm qua đến một năm sau.
  const startsAt = new Date(now);
  startsAt.setDate(startsAt.getDate() - 1);

  const endsAt = new Date(now);
  endsAt.setFullYear(endsAt.getFullYear() + 1);

  await prisma.$transaction(async (tx) => {
    // 1. Tạo tài khoản demo dành riêng cho dữ liệu seed.
    // Tài khoản này bị vô hiệu hóa, không dùng để đăng nhập.
    const user = await tx.user.upsert({
      where: {
        username: 'demo-coupon-user',
      },
      update: {
        isActive: false,
      },
      create: {
        username: 'demo-coupon-user',
        passwordHash: 'SEED_ONLY_NO_LOGIN',
        isActive: false,
      },
    });

    // 2. Tạo coupon demo.
    // BREW10-DEMO giảm 10%, tối đa 50.000đ.
    const coupon = await tx.coupon.upsert({
      where: {
        code: 'BREW10-DEMO',
      },
      update: {
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10n,
        maxDiscount: 50000n,
        minOrderValue: 0n,
        usageLimit: null,
        perUserLimit: 100,
        startsAt,
        endsAt,
        isActive: true,
      },
      create: {
        code: 'BREW10-DEMO',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10n,
        maxDiscount: 50000n,
        minOrderValue: 0n,
        usageLimit: null,
        perUserLimit: 100,
        startsAt,
        endsAt,
        isActive: true,
      },
    });
    // 2.1. Tạo các coupon thử nghiệm.

// BREW10-TEST01 giảm 10%.
await tx.coupon.upsert({
  where: { code: 'BREW10-TEST01' },
  update: {
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10n,
    maxDiscount: 50000n,
    minOrderValue: 0n,
    usageLimit: null,
    perUserLimit: 1,
    startsAt,
    endsAt,
    isActive: true,
  },
  create: {
    code: 'BREW10-TEST01',
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10n,
    maxDiscount: 50000n,
    minOrderValue: 0n,
    usageLimit: null,
    perUserLimit: 1,
    startsAt,
    endsAt,
    isActive: true,
  },
});

// BREW10-TEST02 giảm 10%.
await tx.coupon.upsert({
  where: { code: 'BREW10-TEST02' },
  update: {
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10n,
    maxDiscount: 50000n,
    minOrderValue: 0n,
    usageLimit: null,
    perUserLimit: 1,
    startsAt,
    endsAt,
    isActive: true,
  },
  create: {
    code: 'BREW10-TEST02',
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10n,
    maxDiscount: 50000n,
    minOrderValue: 0n,
    usageLimit: null,
    perUserLimit: 1,
    startsAt,
    endsAt,
    isActive: true,
  },
});

// BREW10-TEST03 giảm 10%.
await tx.coupon.upsert({
  where: { code: 'BREW10-TEST03' },
  update: {
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10n,
    maxDiscount: 50000n,
    minOrderValue: 0n,
    usageLimit: null,
    perUserLimit: 1,
    startsAt,
    endsAt,
    isActive: true,
  },
  create: {
    code: 'BREW10-TEST03',
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10n,
    maxDiscount: 50000n,
    minOrderValue: 0n,
    usageLimit: null,
    perUserLimit: 1,
    startsAt,
    endsAt,
    isActive: true,
  },
});

// CHUATAYDAU20 giảm 20%.
await tx.coupon.upsert({
  where: { code: 'CHUATAYDAU20' },
  update: {
    discountType: DiscountType.PERCENTAGE,
    discountValue: 20n,
    maxDiscount: 50000n,
    minOrderValue: 0n,
    usageLimit: null,
    perUserLimit: 1,
    startsAt,
    endsAt,
    isActive: true,
  },
  create: {
    code: 'CHUATAYDAU20',
    discountType: DiscountType.PERCENTAGE,
    discountValue: 20n,
    maxDiscount: 50000n,
    minOrderValue: 0n,
    usageLimit: null,
    perUserLimit: 1,
    startsAt,
    endsAt,
    isActive: true,
  },
});

    // 3. Lấy một biến thể sản phẩm thật đã được seed.
    // Không tự tạo sản phẩm hoặc biến thể giả.
    const variant = await tx.productVariant.findFirst({
      where: {
        isActive: true,
        product: {
          isActive: true,
        },
      },
      include: {
        product: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!variant) {
      throw new Error(
        'Không tìm thấy ProductVariant đang hoạt động. Hãy chạy seed Catalog trước.',
      );
    }

    // 4. Tính số tiền của đơn demo.
    const subtotal = variant.price;
    const discountAmount = (subtotal * 10n) / 100n;
    const total = subtotal - discountAmount;

    // 5. Tạo đơn hàng demo đã hủy.
    // Đơn có OrderItem thật nhưng không tạo InventoryReservation.
    const order = await tx.order.upsert({
      where: {
        orderNumber: 'DEMO-COUPON-001',
      },
      update: {
        status: OrderStatus.CANCELLED,
        subtotal,
        discountAmount,
        total,
        couponCodeSnapshot: coupon.code,
        reservationExpiresAt: now,
      },
      create: {
        orderNumber: 'DEMO-COUPON-001',
        userId: user.id,
        status: OrderStatus.CANCELLED,
        subtotal,
        discountAmount,
        total,
        couponCodeSnapshot: coupon.code,
        reservationExpiresAt: now,

        items: {
          create: [
            {
              productVariantId: variant.id,
              productNameSnapshot: variant.product.name,
              variantNameSnapshot: variant.size,
              unitPrice: variant.price,
              quantity: 1,
            },
          ],
        },

        statusHistories: {
          create: [
            {
              fromStatus: null,
              toStatus: OrderStatus.PENDING,
              changedByUserId: user.id,
              reason: 'Tạo đơn demo từ dữ liệu seed',
            },
            {
              fromStatus: OrderStatus.PENDING,
              toStatus: OrderStatus.CANCELLED,
              changedByUserId: user.id,
              reason: 'Hủy đơn demo sau khi kiểm tra coupon',
            },
          ],
        },
      },
    });

    // 6. Tạo CouponRedemption có đủ 3 khóa ngoại hợp lệ.
    // RELEASED nghĩa là lượt sử dụng đã được giải phóng,
    // không chiếm lượt sử dụng coupon.
    await tx.couponRedemption.upsert({
      where: {
        orderId: order.id,
      },
      update: {
        couponId: coupon.id,
        userId: user.id,
        discountAmount,
        status: CouponRedemptionStatus.RELEASED,
        expiresAt: now,
        consumedAt: null,
        releasedAt: now,
      },
      create: {
        couponId: coupon.id,
        userId: user.id,
        orderId: order.id,
        discountAmount,
        status: CouponRedemptionStatus.RELEASED,
        expiresAt: now,
        releasedAt: now,
      },
    });
  });

  console.log('Đã seed Coupon và CouponRedemption thành công.');
}

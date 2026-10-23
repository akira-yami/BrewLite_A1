# Thiết kế Sequence Diagram: Module Promotions & Coupon (SD-12)

> **Mã thiết kế:** SD-12
> **Dự án:** BrewLite (Hệ thống đặt đồ uống & thanh toán)
> **Tác giả (Owner):** Dev Kiệt (Promotions & Payments)
> **Người duyệt (Reviewer):** Dev Huy (Auth & Security)
> **Trạng thái:** Đã giải quyết phản biện, chuẩn bị Implementation

## 1. Giải quyết Phản biện Kỹ thuật của Dev Huy

Thiết kế này đã áp dụng 4 khuyến nghị từ `docs/reviews/huy-review-coupon-sd12.md`:
1. **Thứ tự Insert:** Tách API nội bộ thành `quoteAndLock` (để kiểm tra và khóa dòng coupon) và `reserve` (để insert `CouponRedemption`). `OrdersService` sẽ gọi `reserve` **sau** khi đã insert `Order`, đảm bảo không vi phạm khóa ngoại `order_id`.
2. **Kiểm soát đồng thời (Concurrency):** Bảng `coupons` không lưu cột đếm. `PromotionsService` dùng `SELECT COUNT(...) FOR UPDATE` trên bảng `coupon_redemptions` (chỉ đếm `RESERVED` và `CONSUMED`) trong transaction để đảm bảo `usageLimit` và `perUserLimit` không bị vượt khi có request đồng thời.
3. **Tính toán Server-side:** Client chỉ gửi `couponCode` dạng chuỗi. Backend tự truy vấn catalog, đối chiếu `minOrderValue` với `subtotal`, và dùng phép toán số nguyên `BIGINT` (VND) để tính `discountAmount`.
4. **Vòng đời trạng thái:** `CouponRedemption` được khởi tạo là `RESERVED`. `OrdersService` sẽ gọi `PromotionsService` để chuyển sang `CONSUMED` khi thanh toán thành công (khớp SD-11), hoặc `RELEASED`/`EXPIRED` khi đơn bị hủy/hết hạn.

---

## 2. SD-12: Sequence Diagram

```mermaid
%%{init: { 
  'theme': 'dark', 
  'themeVariables': {
    'background': 'transparent',
    'actorBkg': 'rgba(44, 62, 80, 0.6)',
    'actorBorder': 'rgba(93, 173, 226, 0.8)',
    'actorTextColor': '#E5E8E8',
    'signalColor': '#F2F3F4',
    'signalLineColor': 'rgba(170, 183, 184, 0.6)',
    'labelBoxBkgColor': 'transparent',
    'labelBoxBorderColor': 'transparent',
    'labelTextColor': '#F2F3F4',
    'noteBkgColor': 'rgba(244, 208, 63, 0.15)',
    'noteBorderColor': 'rgba(244, 208, 63, 0.6)',
    'noteTextColor': '#F9E79F',
    'activationBkgColor': 'rgba(82, 190, 128, 0.25)',
    'activationBorderColor': 'rgba(82, 190, 128, 0.7)'
  }
}}%%
sequenceDiagram
    autonumber
    
    actor C as Khách hàng
    participant FE as Frontend
    participant PC as PromotionsController
    participant PS as PromotionsService
    participant OS as OrdersService
    participant DB as PostgreSQL (Prisma)

    %% Khối 1: Tím Hồng Pastel Neon mờ cho Giỏ hàng
    rect rgba(235, 170, 250, 0.06)
        note right of C: 1. Giao diện Giỏ hàng: Xem trước Coupon (Không khóa DB)
        C->>FE: Nhập mã giảm giá & Bấm "Áp dụng"
        activate C
        activate FE
        FE->>PC: POST /api/v1/coupons/validate { code, items }
        activate PC
        
        PC->>PS: validateCoupon(code, items, userId)
        activate PS
        
        PS->>DB: Đọc thông tin Coupon & đếm Redemption (chỉ READ, không LOCK)
        activate DB
        DB-->>PS: Thông tin Coupon & Lượt dùng
        deactivate DB
        
        alt Không hợp lệ / Hết hạn / Hết lượt / Không đủ subtotal
            PS-->>PC: Throw UnprocessableEntity (COUPON_NOT_APPLICABLE)
            PC-->>FE: HTTP 422 Unprocessable Entity
        else Hợp lệ
            PS->>PS: Tính toán discountAmount (Server-side BigInt)
            PS-->>PC: Trả về Quote { discountAmount, code }
            deactivate PS
            
            PC-->>FE: HTTP 200 OK
            deactivate PC
            
            FE-->>C: Hiển thị mức giảm giá dự kiến
            deactivate FE
            deactivate C
        end
    end

    %% Khối 2: Xanh Dương Pastel Neon mờ cho Transaction
    rect rgba(133, 193, 233, 0.06)
        note right of C: 2. Áp dụng thật trong Transaction Tạo Đơn (SD-10)
        C->>FE: Bấm "Đặt hàng"
        activate C
        activate FE
        FE->>OS: POST /api/v1/orders { items, couponCode }
        activate OS

        OS->>DB: BEGIN TRANSACTION (tx)
        activate DB
        DB-->>OS: OK
        deactivate DB

        OS->>PS: quoteAndLock(tx, userId, couponCode, subtotal, now)
        activate PS
        
        PS->>DB: SELECT * FROM coupons WHERE code = couponCode FOR UPDATE (Khóa dòng Coupon)
        activate DB
        DB-->>PS: Dữ liệu Coupon
        deactivate DB
        
        PS->>DB: Đếm số REDEMPTION (RESERVED + CONSUMED) theo couponId và userId
        activate DB
        DB-->>PS: Số lượt đã dùng
        deactivate DB
        
        PS->>PS: Kiểm tra usageLimit, perUserLimit, minOrderValue
        
        alt Vi phạm điều kiện
            PS-->>OS: Throw UnprocessableEntity (COUPON_NOT_APPLICABLE)
            deactivate PS
            OS->>DB: ROLLBACK
            activate DB
            DB-->>OS: OK
            deactivate DB
            OS-->>FE: HTTP 422 Unprocessable Entity
        else Đạt điều kiện
            activate PS
            PS->>PS: Tính discountAmount
            PS-->>OS: Trả về CouponQuote
            deactivate PS

            Note over OS,DB: Sửa lỗi khóa ngoại:<br/>Insert Order TRƯỚC
            OS->>DB: INSERT orders (PENDING)
            activate DB
            DB-->>OS: orderId
            deactivate DB

            OS->>PS: reserve(tx, quote, orderId, expiresAt)
            activate PS
            PS->>DB: INSERT coupon_redemptions (status = RESERVED, orderID)
            activate DB
            DB-->>PS: OK
            deactivate DB
            PS-->>OS: Lượt đã được giữ
            deactivate PS

            OS->>DB: COMMIT
            activate DB
            DB-->>OS: OK
            deactivate DB
            
            OS-->>FE: HTTP 201 Created (Kèm discountAmount)
            deactivate OS
            FE-->>C: Chuyển sang màn hình Thanh toán
            deactivate FE
            deactivate C
        end
    end

    %% Khối 3: Xanh Lá Pastel Neon mờ cho Vòng đời đơn hàng
    rect rgba(130, 224, 170, 0.06)
        note right of C: 3. Quyết toán Coupon theo vòng đời Đơn hàng (SD-11 & SD-04)
        alt Thanh toán THÀNH CÔNG (PaymentsService → OrdersService)
            OS->>PS: consumeRedemption(tx, orderId)
            activate OS
            activate PS
            PS->>DB: UPDATE coupon_redemptions SET status = CONSUMED, consumedAt = now() WHERE orderId = ? AND status = RESERVED
            activate DB
            DB-->>PS: OK
            deactivate DB
            PS-->>OS: Done
            deactivate PS
            deactivate OS
        else Hủy đơn / Hết hạn 15 phút
            OS->>PS: releaseRedemption(tx, orderId, isExpired)
            activate OS
            activate PS
            PS->>DB: UPDATE coupon_redemptions SET status = RELEASED/EXPIRED, releasedAt = now() WHERE orderId = ? AND status = RESERVED
            activate DB
            DB-->>PS: OK
            deactivate DB
            PS-->>OS: Done
            deactivate PS
            deactivate OS
        end
    end

# Báo cáo Phản biện Kỹ thuật: Thiết kế SD-12 & Logic Coupon

- **Người thực hiện review:** Dev Huy (Development Team — Auth & Security)
- **Tác giả module:** Dev Huỳnh Thái Kiệt (Development Team — Payments & Promotions)
- **Thời gian review:** 20/10/2026 (Tuần 3 / Sprint 2)
- **Mục tiêu:** Thẩm định thiết kế SD-12, hợp đồng API và logic xử lý khuyến mãi (Coupon / Voucher) nhằm đảm bảo tính toàn vẹn dữ liệu, kiểm soát đồng thời (concurrency control) và bảo mật theo chuẩn BrewLite.

---

## 1. Tóm tắt Đánh giá Chung

Thiết kế phân hệ Coupon đóng vai trò quan trọng trong việc tính giá đơn hàng tại `POST /orders` (Sprint 2) và quyết toán khuyến mãi khi thanh toán thành công tại `POST /payments` (Sprint 3).

| Tiêu chí | Đánh giá | Trạng thái |
|---|---|:---:|
| **Tuân thủ Kiến trúc Phân tầng** | Phù hợp mô hình Controller -> Service -> Repository -> Prisma ORM | ✅ Đạt |
| **Bảo mật & User Isolation** | Ràng buộc `userId` theo token xác thực (JWT), không nhận từ client | ✅ Đạt |
| **Ràng buộc Khóa Ngoại & Transaction** | Cần lưu ý thứ tự ghi bản ghi để không vi phạm FK `order_id` | ⚠️ Cần chú ý |
| **Kiểm soát Cạnh tranh (Concurrency)** | Cần phòng chống race condition vượt `usageLimit` và `perUserLimit` | ⚠️ Cần chuẩn hóa |
| **Xử lý Vòng đời Khuyến mãi** | Chuyển trạng thái `RESERVED -> CONSUMED / RELEASED / EXPIRED` | ✅ Đạt |

---

## 2. Chi tiết Các Điểm Phản biện & Đề xuất Cải tiến

### Điểm 1: Thứ tự Insert trong Database Transaction Tạo Đơn
* **Hiện trạng rủi ro:** Trong bảng `coupon_redemptions`, trường `order_id` là khóa ngoại (`FOREIGN KEY (order_id) REFERENCES orders(id) RESTRICT`). Nếu luồng xử lý của `PromotionsService` tạo bản ghi `CouponRedemption` trước khi `Order` được insert, cơ sở dữ liệu PostgreSQL sẽ lập tức ném lỗi vi phạm ràng buộc khóa ngoại (Foreign Key Constraint Violation).
* **Khuyến nghị của Huy:** Trong transaction chung của `POST /orders`, bắt buộc phải insert bản ghi `Order` (ở trạng thái `PENDING`) trước, sau đó mới insert `CouponRedemption` (ở trạng thái `RESERVED`) cùng với `InventoryReservation`. Nếu có bất kỳ lỗi nào xảy ra trong chuỗi (ví dụ hết hàng tồn kho), toàn bộ transaction sẽ rollback tự động.

### Điểm 2: Kiểm soát Đặt hàng Đồng thời (Race Condition trên `perUserLimit` và `usageLimit`)
* **Hiện trạng rủi ro:** Một người dùng có thể mở đồng thời 2 tab trình duyệt hoặc gửi song song 2 request cùng lúc chứa cùng 1 mã coupon có giới hạn `perUserLimit = 1`. Nếu chỉ dùng truy vấn `findMany()` hoặc `count()` thông thường (check-then-act) ngoài transaction có lock, cả 2 request đều thấy "chưa dùng" và đều được chấp thuận.
* **Khuyến nghị của Huy:**
  1. Tận dụng chỉ mục duy nhất hoặc transaction isolation:
     Bảng `coupon_redemptions` đã có index `@@index([couponId, userId, status])`. Khi kiểm tra hạn mức trong transaction tạo đơn, cần khóa dòng (hoặc thực hiện atomic check) trên lượt sử dụng còn lại của Coupon.
  2. Chỉ tính các redemption có status là `RESERVED` (còn hạn giữ chỗ) và `CONSUMED`. Các bản ghi `RELEASED` hoặc `EXPIRED` không được tính vào hạn mức đã dùng.

### Điểm 3: Tính toán Giá trị Giảm giá trên Server-Side
* **Nguyên tắc bảo mật:**
  - Client tuyệt đối không được gửi số tiền giảm (`discountAmount`) hay tổng tiền (`total`).
  - Client chỉ được phép gửi mã `couponCode` (dạng chuỗi 1..50 ký tự đã được trim hai đầu, case-sensitive hoặc normalize thống nhất).
  - Backend tự tra cứu bảng `coupons`:
    - Kiểm tra `isActive === true`.
    - Kiểm tra thời gian hiệu lực: `startsAt <= now() <= endsAt`.
    - Kiểm tra giá trị đơn hàng tối thiểu: `subtotal >= minOrderValue`.
    - Tính toán giá trị giảm:
      - Nếu `PERCENTAGE`: `discountAmount = min(subtotal * discountValue / 100, maxDiscount ?? infinity)`.
      - Nếu `FIXED_AMOUNT`: `discountAmount = min(discountValue, subtotal)`.
    - Đảm bảo `total = max(0, subtotal - discountAmount)`.

### Điểm 4: Đồng bộ Vòng đời Trạng thái với Module Thanh toán (SD-11)
* **Khớp nối với SD-11 của Kiệt:**
  - Khi thanh toán thành công (`Payment` chuyển `SUCCEEDED`, `Order` chuyển `PAID`): Bản ghi `CouponRedemption` lập tức chuyển từ `RESERVED -> CONSUMED` (ghi nhận `consumedAt = now()`).
  - Khi đơn hàng bị hủy (`CANCELLED`) hoặc hết hạn giữ chỗ 15 phút: `CouponRedemption` chuyển thành `RELEASED` hoặc `EXPIRED`, giải phóng hạn mức để người dùng có thể áp dụng mã cho đơn hàng khác.

---

## 3. Kết luận & Đề xuất Phê duyệt

Thiết kế logic Coupon hoàn toàn khả thi và nhất quán với kiến trúc tổng thể của BrewLite. Dev Kiệt cần đảm bảo các lưu ý về thứ tự insert trong transaction và atomic lock khi triển khai code nghiệp vụ cho Sprint 2.

- **Đánh giá của Reviewer:** ✅ **RECOMMENDED FOR APPROVAL (Khuyến nghị thông qua kèm các lưu ý kỹ thuật trên)**.
- **Ký tên:** Dev Huy (Auth & Security Specialist)

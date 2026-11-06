# Biên Bản Bàn Giao Kỹ Thuật - Tuần 3 (Sprint 2)

**Dự án:** BrewLite (Monorepo)
**Người thực hiện:** Huỳnh Thái Kiệt (MSSV: 3124410172)
**Ngày bàn giao:** 27/10/2026
**Trạng thái:** Hoàn tất ✅

---

## 1. Các Thẻ Tính Năng (Jira/Trello Cards) Đã Hoàn Tất

*   **[A1-10.5] Xử lý vòng đời Coupon, Payment Retry an toàn và Tích hợp Frontend UI:** Đã hoàn thiện luồng xử lý mã giảm giá, bảo vệ chống thanh toán lặp và tích hợp giao diện Giỏ hàng (Cart).
*   **[A1-8.3] (Bug Fix) Lưu vết vòng đời trạng thái Đơn hàng:** Vá thành công lỗ hổng thiếu lịch sử khi đơn hàng chuyển sang `PAID`.

---

## 2. Chi Tiết Triển Khai Kỹ Thuật

### 2.1. Backend Architecture (NestJS + Prisma)
*   **Promotions Module:** Hoàn thiện public API cho `PromotionsService` với 2 hàm `consumeRedemption` (khi PAID) và `releaseRedemption` (khi Cancel/Hết hạn). Tuân thủ nghiêm ngặt ranh giới module (ADR-001).
*   **Orders Module:** 
    *   Tích hợp gọi chéo an toàn sang `PromotionsService` trong hàm `markOrderPaid`.
    *   Xây dựng hàm `cancelOrder` hỗ trợ nhả lượt (release) coupon khi hết hạn 15 phút.
    *   Bổ sung `tx.orderStatusHistory.create` ghi nhận lịch sử chuyển trạng thái về `PAID`.
*   **Payments Module & Bảo mật Idempotency:**
    *   Hỗ trợ luồng **Payment Retry**: Cho phép đơn hàng ở trạng thái `PAYMENT_FAILED` được thanh toán lại bằng `Idempotency-Key` mới thông qua hàm `transitionForPaymentRetry`.
    *   Bảo vệ hệ thống thành công trước lỗi *Replay Attack* và *Unique Constraint* trùng mã giao dịch.

### 2.2. Frontend UI (Next.js + Tailwind CSS)
*   Tích hợp API `POST /api/v1/coupons/validate` vào Component `CartDrawer.tsx`.
*   Xử lý tinh tế UX/UI: 
    *   Bắt mã lỗi HTTP 422 (`COUPON_NOT_APPLICABLE`, `COUPON_EXPIRED`) và ánh xạ thành thông báo tiếng Việt thân thiện chữ đỏ.
    *   Tự động gỡ bỏ Coupon hiện tại nếu người dùng thay đổi số lượng món trong giỏ (làm thay đổi `subtotal`).

---

## 3. Kết Quả Kiểm Thử (TDD & Regression)

*   **Unit Tests (Vitest):** Đạt 100% Pass Rate (Màu xanh).
    *   `orders.service.spec.ts`: PASS 20/20 cases.
    *   `payments.service.spec.ts`: PASS 8/8 cases.
*   **Integration Tests (DB Thật):** 
    *   Môi trường: PostgreSQL Disposable (`brewlite_foundation_smoke_test`).
    *   Kết quả: PASS 10/10 kịch bản, bao gồm kiểm tra Race Condition, Giới hạn sử dụng, Retry thanh toán, và Rollback khi lỗi.

---

## 4. Ghi Chú cho Reviewer
*   Kiến trúc đã được đảm bảo tính toàn vẹn State Machine của Order và vòng đời của CouponRedemption. Code đã push lên nhánh `feature/A1-10.5` sẵn sàng cho thao tác Merge Pull Request.
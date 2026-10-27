# 🚀 Handover Report - Sprint 2 / Tuần 3

**Người thực hiện:** Huỳnh Thái Kiệt
**Vai trò:** Backend Engineer
**Phân hệ phụ trách:** Promotions (Coupon) & Payments
**Ngày báo cáo:** 22/10/2026

---

## 1. Hạng mục hoàn thành (Tasks Completed)

### 🎟️ Module Promotions (Hoàn tất 100%)
- Triển khai `PromotionsService` với quy tắc Business Logic (TDD): Kiểm tra thời hạn, áp trần discount, giới hạn số lần sử dụng.
- Hoàn thiện 2 cổng giao tiếp `quoteAndLock` và `reserve` để tích hợp với Transaction của `OrdersService`.
- Mở API Endpoint: `POST /api/v1/coupons/validate` (Được bảo vệ bởi JwtAuthGuard & RolesGuard).

### 💳 Module Payments (Hoàn tất 100%)
- Triển khai `PaymentsRepository` và `OrdersService` transition ports (Fail-fast chống truy cập chéo, quản lý trạng thái).
- Xây dựng `PaymentsService` với cơ chế chống Double-Charge:
  - Băm dữ liệu `requestHash` bằng thuật toán SHA-256 để chống thay đổi payload.
  - Xử lý Idempotency triệt để (Ném 409 khi trùng key khác dữ liệu, hoặc giao dịch đang `PROCESSING`).
- Cấu hình gọi `MockGatewayService` độc lập với Database Transaction nhằm ngăn chặn cạn kiệt Connection Pool.
- Mở API Endpoint: `POST /api/v1/payments`.

### 🤝 Frontend Contracts
- Cập nhật file types: `checkout.contract.ts`.
- Cung cấp HTTP Client helper: `checkout.api.ts` (Sử dụng `authenticatedRequest` và bắt buộc kèm header `Idempotency-Key`) để bàn giao cho Khải ghép giao diện.

---

## 2. Chỉ số chất lượng (Definition of Done)
- [x] Linter (`oxlint`): **0 errors, 0 warnings** (Đã fix triệt để Type Widening).
- [x] Typecheck: **PASS**.
- [x] Unit Test & Integration Test: **PASS 100%**.
- [x] Test Coverage: **>= 80%** (Đính kèm screenshot hoặc terminal log trong PR).

---

## 3. Pull Request & Reviewers
Mã nguồn đã sẵn sàng để merge vào branch `develop`.
- **Reviewer 1:** @huy-dev (Yêu cầu review kỹ logic nghiệp vụ tính toán của Coupon tại `PromotionsService`).
- **Reviewer 2:** @khang-dev (Yêu cầu review luồng Transaction thay đổi trạng thái PENDING -> PAID và luồng Idempotency tại `PaymentsService`).
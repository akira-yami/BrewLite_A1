# Bàn giao Huy — Tuần 3: RBAC, Ownership Guard & User Isolation

Ngày hoàn thiện kỹ thuật: 20/10/2026. Nhánh: `codex/huy-week-3-rbac-ownership`, base `cd49fe6`.

Phạm vi:
- **Design Trước Code:** Cập nhật tài liệu thiết kế SD-06 trong `Huy-A2/docs/architecture/sequence-diagrams-auth.md` bổ sung Giai đoạn 3 (Ownership Guard & User Isolation) và chuẩn hóa ma trận mã lỗi 401/403/404.
- **Backend:** Xây dựng `OwnershipGuard` kiểm soát quyền sở hữu và `HttpExceptionFilter` chuẩn hóa mã lỗi 401 (`UNAUTHORIZED`) và 403 (`FORBIDDEN_RESOURCE`) theo đúng chuẩn envelope của BrewLite. Bổ sung endpoint `GET /api/v1/auth/users/:userId` và `GET /api/v1/auth/barista-only`.
- **Frontend:** Cập nhật `AuthApiError` trong `apps/web/src/features/auth/api.ts` hỗ trợ bóc tách mã lỗi `code` từ response server; đảm bảo 403 Forbidden hiển thị thông báo thân thiện và bảo toàn phiên làm việc của người dùng (không bị logout như 401).
- **Review:** Lập báo cáo phản biện kỹ thuật độc lập cho thiết kế SD-12 và logic Coupon của Dev Kiệt (`docs/reviews/huy-review-coupon-sd12.md`).
- **Done Criteria:** Bộ test TDD chứng minh User Isolation (Khách hàng A không thể xem dữ liệu của Khách hàng B, Barista truy cập theo vai trò), đạt độ phủ kiểm thử $\ge 80\%$.

---

## Đã thực hiện

1. **Thiết kế Sequence Diagram (SD-06 Giai đoạn 3):**
   - Phân định rõ 3 giai đoạn: Đăng nhập & cấp phát JWT -> Phân quyền RBAC trên từng request -> Kiểm tra quyền sở hữu (Ownership & User Isolation).
   - Chuẩn hóa ma trận mã lỗi: 401 `UNAUTHORIZED`, 403 `FORBIDDEN_RESOURCE`, 404 `ORDER_NOT_FOUND` (chống UUID enumeration theo `security.md`).
2. **Backend Guard & Filter:**
   - Tạo `OwnershipGuard` (`apps/api/src/modules/auth/guards/ownership.guard.ts`): Bắt buộc người dùng đã xác thực; đối chiếu `user.id === targetUserId` đối với `CUSTOMER`; cho phép `BARISTA` truy cập theo quyền vận hành.
   - Tạo `HttpExceptionFilter` (`apps/api/src/common/filters/http-exception.filter.ts`): Tự động chuẩn hóa mọi phản hồi 401/403 thành envelope `{ error: { code, message, details, requestId } }`; đăng ký toàn cục qua `APP_FILTER` trong `AppModule`.
   - Bổ sung endpoint dữ liệu người dùng tại `AuthController`: `GET /auth/users/:userId` và `GET /auth/barista-only`.
3. **Frontend API Error Enhancement:**
   - Cập nhật `AuthApiError` (`apps/web/src/features/auth/api.ts`) bổ sung `public readonly code?: string`.
   - Bóc tách `json?.error?.code` trả về từ API.
   - Đảm bảo mã lỗi 403 không gọi `authSession.invalidate(token)`.
4. **Báo cáo Review Kỹ thuật SD-12:**
   - Soạn thảo `docs/reviews/huy-review-coupon-sd12.md` góp ý về thứ tự insert trong transaction (`Order` trước `CouponRedemption`) và atomic lock chống race condition vượt `usageLimit` / `perUserLimit`.

---

## Kiểm chứng TDD & Đánh giá Độ phủ (Coverage)

| Nhóm kiểm thử | Kết quả | Ghi chú |
|---|---|---|
| **Backend Unit Tests** | **113 / 113 PASS** | Gồm 6 test mới cho OwnershipGuard và 4 test cho HttpExceptionFilter |
| **Backend HTTP E2E** | **16 / 16 PASS** | 14 test Auth (gồm 6 test RBAC/Ownership/User Isolation) + 2 test Readiness |
| **Backend Test Coverage** | **84.9% Lines (Vượt $\ge 80\%$)** | `OwnershipGuard`: 100% Lines, 92.85% Branches; `HttpExceptionFilter`: 80% Lines |
| **Frontend Tests** | **53 / 53 PASS** | Thêm test kiểm chứng 403 không bị logout và giữ mã lỗi `FORBIDDEN_RESOURCE` |
| **Linter & Typecheck** | **PASS (0 warning, 0 error)** | `oxlint`, `eslint`, `tsc` cả hai phân hệ web và api |
| **Docker Compose Config** | **4 / 4 PASS** | Kiểm tra bảo mật `JWT_SECRET` |

---

## Quy trình TDD (Red - Green - Refactor)
- **RED:** Viết các bài test cho `OwnershipGuard`, `HttpExceptionFilter`, kịch bản E2E User Isolation và frontend 403; chạy test xác nhận thất bại trước khi viết code nghiệp vụ.
- **GREEN:** Viết mã tối thiểu trong Guard, Filter, Controller và API wrapper; xác nhận toàn bộ test chuyển sang GREEN.
- **REFACTOR:** Tối ưu hóa xử lý lỗi, đảm bảo 503 readiness probe của hạ tầng không bị ảnh hưởng và đo lường độ phủ đạt $\ge 80\%$.

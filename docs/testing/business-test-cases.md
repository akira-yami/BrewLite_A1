# BrewLite · Bộ test case theo nghiệp vụ & bằng chứng

> Tài liệu thiết kế test (test design) cho các nghiệp vụ cốt lõi của BrewLite, tập trung vào
> **Đặt hàng (Order)**, **Thanh toán (Payment)**, **Tranh chấp đồng thời (Concurrency)** và
> **Đăng nhập / Phân quyền (Auth)**. Mỗi ca ghi rõ: điều kiện, thao tác, kết quả mong đợi,
> mã lỗi/HTTP, và bất biến hệ thống đảm bảo.
>
> Các ca này được **kiểm chứng bằng test chạy thật trên PostgreSQL** — log đặt trong
> `docs/testing/evidence/business-suite-2026-11-12/`.

---

## 0. Tổng quan kết quả chạy (ngày 12/11/2026)

| # | Nhóm test | Loại | File test | Kết quả | Log bằng chứng |
|---|-----------|------|-----------|---------|----------------|
| 1 | Máy trạng thái đơn + hàng đợi barista | Unit (không DB) | `src/modules/orders/state/order-state-machine.spec.ts`, `services/orders.service.staff.spec.ts` | **47/47 PASS** | [01-unit-state-machine-and-barista.log](evidence/business-suite-2026-11-12/01-unit-state-machine-and-barista.log) |
| 2 | Tranh chấp tồn kho — ly cuối cùng | Integration (PostgreSQL) | `test/inventory-concurrency.integration-spec.ts` | **6/6 PASS** | [02-inventory-concurrency-last-cup.log](evidence/business-suite-2026-11-12/02-inventory-concurrency-last-cup.log) |
| 3 | Đặt hàng + idempotency thanh toán + vòng đời đơn | Integration (PostgreSQL) | `test/orders.integration-spec.ts`, `test/order-state-machine.integration-spec.ts` | **35/35 PASS** | [03-orders-and-payment-idempotency.log](evidence/business-suite-2026-11-12/03-orders-and-payment-idempotency.log) |
| 4 | Đăng nhập, JWT, cô lập người dùng (RBAC) | E2E (HTTP) | `test/auth.e2e-spec.ts` | **18/18 PASS** | [04-auth-login-isolation.log](evidence/business-suite-2026-11-12/04-auth-login-isolation.log) |
| 5 | Hết hạn thanh toán + hoàn kho + đổi điểm (loyalty) | Integration (PostgreSQL) | `test/payment-expiry.integration-spec.ts`, `test/loyalty-redemption.integration-spec.ts` | **19/19 PASS** | [05-payment-expiry-and-loyalty.log](evidence/business-suite-2026-11-12/05-payment-expiry-and-loyalty.log) |

**Tổng: 125 test PASS** (47 unit + 78 integration/e2e), chạy thật qua tầng HTTP (supertest) và
PostgreSQL thật. Chuẩn bị DB: [00-db-migrate.log](evidence/business-suite-2026-11-12/00-db-migrate.log).

> Lưu ý: trong log integration có vài dòng `[Nest] ... ERROR` và `Error: ...` — đó là **fault
> injection có chủ đích** bên trong các ca kiểm thử nhánh lỗi (ví dụ "coupon write failed",
> "force transaction rollback"), không phải lỗi thật. Ca tương ứng vẫn `✓ PASS`.

### Quan hệ với các tài liệu kiểm thử khác

Dự án có ba tài liệu kiểm thử ở ba thời điểm; **file này (12/11/2026) là nguồn hiện hành và đầy đủ nhất**:

| Tài liệu | Ngày | Phạm vi | Quan hệ |
|---|---|---|---|
| **business-test-cases.md** (file này) | 12/11/2026 | Toàn bộ nghiệp vụ Order/Payment/Concurrency/Auth/Loyalty | Nguồn hiện hành |
| [a1-task-10-review.md](a1-task-10-review.md) | 10/11/2026 | 3 ca trọng tâm Task 10 cho nghiệm thu | Tập con của file này |
| [staff-acceptance.md](staff-acceptance.md) | 04/11/2026 | Nghiệm thu Compose + Barista + quản lý kho | Bổ sung mảng Compose/Barista, số liệu thuộc đợt 04/11 |

---

## 1. Nghiệp vụ ĐẶT HÀNG (Orders) — `POST /orders`

Chỉ CUSTOMER (JWT hợp lệ) đặt được. Giá tính **từ DB**, không nhận từ client. Tạo đơn chạy
trong transaction **Serializable + retry ≤3**, giữ tồn kho theo công thức (BOM) và khóa coupon
trong cùng transaction.

| Mã | Tiêu đề | Điều kiện | Thao tác | Kết quả mong đợi |
|----|---------|-----------|----------|------------------|
| ORD-01 | Tạo đơn hợp lệ, snapshot bất biến | Variant active, đủ nguyên liệu | POST /orders với 1–20 món | **201**. Đơn `PENDING`, lưu snapshot tên/size/giá; `subtotal/discount/total` tính từ DB |
| ORD-02 | Gộp dòng trùng cấu hình | 2 dòng cùng variant+topping+đường/đá/note | POST /orders | 201, hai dòng gộp làm một, cộng dồn số lượng |
| ORD-03 | Chặn giá giả mạo & topping trùng | Client gửi giá hoặc topping trùng | POST /orders | **400 VALIDATION_ERROR / INVALID_OPTION**, giá lấy từ server |
| ORD-04 | Quá 20 ly / cấu hình | quantity > 20 sau khi gộp | POST /orders | **400 VALIDATION_ERROR** |
| ORD-05 | Hết nguyên liệu | Tồn kho thiếu / variant chưa có công thức | POST /orders | **409 OUT_OF_STOCK** kèm `details[]` |
| ORD-06 | Variant / topping không khả dụng | Variant inactive hoặc không thuộc sản phẩm | POST /orders | **400 INVALID_OPTION** |
| ORD-07 | Rollback khi lỗi muộn | Lỗi sau khi đã ghi order rows | POST /orders (giả lập lỗi) | Rollback toàn bộ: order, tồn kho/version, reservation, coupon |
| ORD-08 | Cô lập lịch sử đơn | 2 user khác nhau | GET /orders/me | Mỗi user chỉ thấy đơn của mình; phân trang keyset |
| ORD-09 | Chặn dò ID đơn người khác | Đơn thuộc user B | GET /orders/:id bằng token user A | **404 ORDER_NOT_FOUND** (không phải 403, chống dò ID) |

Bằng chứng: log #3 — ví dụ `merges normalized lines, preserves 0/null preferences, snapshots and ownership`,
`rejects invalid preferences, forged prices, duplicate normalized toppings and quantities above 20`,
`rolls back all order rows, stock/version, reservation and coupon after a late failure`,
`paginates equal timestamps and validates history queries without leaking other users`.

---

## 2. Nghiệp vụ TRANH CHẤP ĐỒNG THỜI (Concurrency) — "2 người cùng đặt ly cuối"

Cơ chế: **optimistic concurrency** — compare-and-set trên cột `version` của nguyên liệu
(`UPDATE ... WHERE id=? AND version=? AND stockQuantity>=qty`). Người thua `version` → hỏng → vòng
retry đọc lại trạng thái mới → hết kho → `OUT_OF_STOCK` / `INVENTORY_CONFLICT`.

| Mã | Tiêu đề | Điều kiện | Thao tác | Kết quả mong đợi (bất biến) |
|----|---------|-----------|----------|------------------------------|
| CON-01 | Hai người tranh ly cuối (service) | Nguyên liệu đủ **đúng 1 ly** | 2 reservation đồng thời (`Promise.allSettled`) | **Đúng 1 thành công, 1 thất bại**; tồn cuối = 0; chỉ 1 reservation ACTIVE; version +1 |
| CON-02 | Hai người tranh ly cuối (HTTP) | Kho đủ 1 ly | 2 × POST /orders đồng thời | Một 201, một 409; không bán vượt kho |
| CON-03 | Hai barista nhận cùng đơn | Đơn đang PAID | 2 × PATCH /staff/orders/:id/status đồng thời | Đúng 1 người thành công, người sau **409** (khóa dòng + CAS) |
| CON-04 | Release đồng thời một reservation | 1 reservation ACTIVE | 2 × release song song | Chỉ 1 release thành công; hoàn kho **đúng một lần** |
| CON-05 | Coupon giới hạn dùng dưới tải | Coupon `usageLimit=1` | Nhiều đơn đồng thời áp mã | Chỉ 1 lượt giữ được; các đơn khác bị chặn |
| CON-06 | Đổi điểm (loyalty) đồng thời | User có điểm đủ 1 lần đổi | 2 lần redeem khác key đồng thời | Serialize bằng `SELECT ... FOR UPDATE`: 1 thành công, 1 từ chối; số dư cuối = 0; đúng 1 giao dịch REDEEM |

Bằng chứng: log #2 (`allows only one to reserve the last cup`, `allows only one of two concurrent
releases to restore ingredients`), log #3 (`allows exactly one of two concurrent buyers to reserve the
last drink`, `hai barista nhận cùng một đơn đồng thời: đúng một người thành công`), log #5
(`serializes two distinct concurrent redemptions so points cannot be spent twice`).

---

## 3. Nghiệp vụ MÁY TRẠNG THÁI ĐƠN (Order State Machine)

9 mũi tên hợp lệ. Mọi lần ghi trạng thái đi qua `assertTransition` (cổng duy nhất). Barista chỉ
đặt được `PREPARING / READY / COMPLETED`.

| Mã | Tiêu đề | Thao tác | Kết quả mong đợi |
|----|---------|----------|------------------|
| STM-01 | Luồng chính | PENDING → PAID → PREPARING → READY → COMPLETED | Hợp lệ, ghi đủ lịch sử, khách xem được timeline |
| STM-02 | Chuyển nhảy cóc bị chặn | PAID → READY (bỏ qua PREPARING) | **409 INVALID_ORDER_TRANSITION**; trạng thái & lịch sử **không đổi** |
| STM-03 | PAID → COMPLETED trực tiếp | Bỏ qua PREPARING/READY | **409 INVALID_ORDER_TRANSITION** |
| STM-04 | Lặp trạng thái | PREPARING → PREPARING | **409 INVALID_ORDER_TRANSITION** |
| STM-05 | Lùi trạng thái | READY → PREPARING | **409 INVALID_ORDER_TRANSITION** |
| STM-06 | Trạng thái kết thúc | COMPLETED → READY | **409**; COMPLETED/CANCELLED là terminal |
| STM-07 | Nhánh thanh toán lỗi | PENDING → PAYMENT_FAILED → PENDING → PAID | Hợp lệ; PAYMENT_FAILED **không** sang PAID trực tiếp |
| STM-08 | Nhánh hủy | PENDING / PAYMENT_FAILED / PAID → CANCELLED | Hợp lệ |
| STM-09 | Chặn ở repository (không qua API) | Ghi trạng thái sai trực tiếp | Vẫn **409** — không có đường vòng |

Bằng chứng: log #1 (30 ca unit ma trận 7×7) và log #3 (các ca `... bị 409 INVALID_ORDER_TRANSITION,
trạng thái và lịch sử không đổi`, `repository chặn chuyển tiếp sai ngay cả khi không đi qua API barista`).

---

## 4. Nghiệp vụ THANH TOÁN (Payments) — `POST /payments`

Bắt buộc header **`Idempotency-Key`**. Số tiền lấy từ `order.total` (server). Mock gateway chế độ
`deterministic`: CARD luôn fail (`INSUFFICIENT_FUNDS`), E_WALLET luôn thành công.

| Mã | Tiêu đề | Điều kiện | Thao tác | Kết quả mong đợi |
|----|---------|-----------|----------|------------------|
| PAY-01 | Thanh toán thành công | Đơn PENDING, E_WALLET | POST /payments | 200 `success:true`; đơn → PAID; reservation → CONSUMED; cộng điểm |
| PAY-02 | **Gửi 2 lần cùng Idempotency-Key** | Lần 1 đã xử lý | POST /payments lần 2 cùng key, cùng payload | Trả lại kết quả cũ, `isRetried:true`, **cùng** `gatewayTransactionId`; **chỉ 1 order, 1 payment** (không double-charge) |
| PAY-03 | Dùng lại key cho payload khác | Cùng key, khác orderId/amount/method | POST /payments | **409 IDEMPOTENCY_KEY_REUSED** |
| PAY-04 | Chặn thanh toán song song cùng đơn | Đơn đang có payment PROCESSING | POST /payments (key khác) | **409 PAYMENT_IN_PROGRESS** |
| PAY-05 | Đơn đã thanh toán | Đơn PAID | POST /payments | **409 ORDER_ALREADY_PAID** |
| PAY-06 | Đơn hết hạn giữ chỗ | `now >= reservationExpiresAt` | POST /payments | **409 ORDER_EXPIRED** (chặn trước khi gọi gateway) |
| PAY-07 | Thử lại sau khi fail | Đơn PAYMENT_FAILED | POST /payments | PAYMENT_FAILED → PENDING rồi charge lại; thành công consume coupon đúng 1 lần |
| PAY-08 | VNPay chưa cấu hình | `VNPAY_ENABLED=false` | POST /payments method VNPAY | **503 VNPAY_NOT_CONFIGURED** |
| PAY-09 | Gateway trả kết quả sau TTL | Charge hoàn tất sau hết hạn | — | Settle đúng (success/fail) mà không hoàn kho sai |

Bằng chứng: log #3 (`keeps one order and one payment after two requests with the same Idempotency-Key`,
`blocks a second PROCESSING payment for the same order even when its idempotency key differs`,
`Regression: Payment FAILED → retry success consumes coupon once...`), log #5 (`rejects an expired
order before contacting the gateway`, `settles a gateway success/failure that finishes after TTL`).

---

## 5. Nghiệp vụ ĐĂNG NHẬP & PHÂN QUYỀN (Auth / Login / RBAC)

Mật khẩu bcrypt cost 10; JWT `{sub, username, role}`, hết hạn 15 phút. Lỗi đăng nhập **đồng nhất**
để chống dò tài khoản.

| Mã | Tiêu đề | Điều kiện | Thao tác | Kết quả mong đợi |
|----|---------|-----------|----------|------------------|
| AUTH-01 | Đăng nhập đúng | User active, đúng mật khẩu | POST /auth/login | **200**, trả JWT verify được; **không lộ** `passwordHash`; `expiresIn=900` |
| AUTH-02 | Sai mật khẩu | Mật khẩu sai | POST /auth/login | **401 INVALID_CREDENTIALS** (thông báo giống hệt tài khoản không tồn tại) |
| AUTH-03 | Tài khoản không tồn tại | Username lạ | POST /auth/login | **401 INVALID_CREDENTIALS** (không tiết lộ username sai) |
| AUTH-04 | Tài khoản bị khóa | `isActive=false` | POST /auth/login | **403 ACCOUNT_INACTIVE** (sau khi đã verify mật khẩu) |
| AUTH-05 | Thiếu / sai token | Không có hoặc token rác | GET /auth/me | **401**, không truy vấn user |
| AUTH-06 | Token hết hạn / sai chữ ký / sai issuer / audience | JWT không hợp lệ | GET /auth/me | **401**; không lộ token/hash trong body |
| AUTH-07 | Cô lập người dùng | CUSTOMER A đọc dữ liệu user B | GET /auth/users/:idB | **403 FORBIDDEN_RESOURCE** |
| AUTH-08 | Vai trò nâng cao | BARISTA đọc dữ liệu user bất kỳ | GET /auth/users/:id | **200** (role elevated) |
| AUTH-09 | Chặn route theo vai trò | CUSTOMER gọi route BARISTA-only | GET /auth/barista-only | **403 FORBIDDEN_RESOURCE** |

Bằng chứng: log #4 (18/18 ca, gồm `rejects a wrong password without disclosing which credential
failed`, `rejects an inactive account after verifying its password`, `rejects invalid claims or
signature`, `blocks CUSTOMER from reading another user data ... with FORBIDDEN_RESOURCE`).

---

## 6. Cách chạy lại (reproduce)

Cần Docker + PostgreSQL thử nghiệm có tên bắt đầu `brewlite_foundation_smoke`. Ví dụ dựng container
tạm cổng 5434:

```bat
docker run --rm --name brewlite-smoke-pg ^
  -e POSTGRES_USER=brewlite -e POSTGRES_PASSWORD=ci_only_password ^
  -e POSTGRES_DB=brewlite_foundation_smoke_ci -p 5434:5432 ^
  postgres:18.4-alpine3.23
```

Đặt biến môi trường rồi deploy migration và chạy test (từ `apps/api`):

```bat
set DATABASE_URL=postgresql://brewlite:ci_only_password@localhost:5434/brewlite_foundation_smoke_ci?schema=public
set SMOKE_DATABASE_URL=%DATABASE_URL%
set JWT_SECRET=cf40f6ffdda376c12dfb4370b2f84db0a740a6c4efc6eb71032602c99e6ad933
set JWT_ISSUER=brewlite-api
set JWT_AUDIENCE=brewlite-web
set MOCK_PAYMENT_MODE=deterministic

npm run prisma:generate
npm run prisma:deploy

:: Unit (không cần DB)
npx vitest run order-state-machine.spec orders.service.staff.spec

:: Integration & E2E (cần PostgreSQL)
npm run test:integration -- inventory-concurrency orders.integration order-state-machine.integration payment-expiry loyalty-redemption
npm run test:e2e -- auth
```

---

## 7. Vai trò của Postman trong bộ bằng chứng

Các ca trên được tự động hóa bằng Vitest/Supertest. **Postman + Newman** là lớp kiểm thử API đen
(black-box) chạy trên server thật, phục vụ **demo nghiệm thu** và tạo report độc lập:

- Collection: `postman/BrewLite_API.postman_collection.json` (bao phủ 7 tiêu chí nghiệm thu: đơn
  hàng, tồn kho BOM, coupon, cô lập người dùng, retry thanh toán…).
- Chạy: `npm run test:api` (trong `apps/api`) → `scripts/run-api-tests.mjs` tự khởi động API, chờ
  `/health`, chạy Newman, xuất `logs/api-test-run.log`, `logs/api-test-errors.log`,
  `logs/newman-report.json`.

Nói ngắn gọn: Vitest/Supertest kiểm chứng nghiệp vụ ở tầng code + DB (như tài liệu này), còn Postman
cho bằng chứng end-to-end qua HTTP thật để trình bày khi nghiệm thu.

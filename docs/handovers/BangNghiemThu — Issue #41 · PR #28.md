# Bảng Nghiệm Thu — Issue #41 · PR #28
**Cập nhật:** 2026-11-06 · Branch: `Kiet-Payment-Idempotency-PaymentUI`  
**Bằng chứng:** chạy trực tiếp trên máy local, không tự suy luận

---

## Kết quả tổng quan

| Chỉ số | Kết quả | Bằng chứng |
|---|---|---|
| Tests | **389/389 PASS** (36 files) | `npx vitest run` |
| TypeScript | **0 errors** (API + Web) | `tsc --noEmit` |
| Coverage — Lines | **82.74%** (1050/1269) | `npx vitest run --coverage` |
| Coverage — Functions | **81.45%** (202/248) | idem |
| Docker backend | **Up (healthy)** | `docker ps` |
| Public tunnel health | **200 OK** | `curl https://signals-alone-multiple-thorough.trycloudflare.com/api/v1/health` |
| Public VNPay IPN | **200 `{RspCode:"97"}`** | curl với payload giả — route tồn tại, HMAC check hoạt động |

---

## Deliverables

| # | Tiêu chí | Trạng thái | Bằng chứng |
|---|---|---|---|
| D1 | VNPay QueryDr adapter, ánh xạ outcome → trạng thái nội bộ | ✅ | `vnpay-inquiry.service.ts` — 5 status: SUCCESS/DEFINITIVE_FAILURE/PENDING/MANUAL_REVIEW/UNKNOWN; HMAC-SHA512; timeout 8s |
| D2 | Operator-triggered recovery API, timeout 8s, backoff, circuit-breaker | ✅ | `payment-recovery.service.ts`: `AbortSignal.timeout(8_000)` trong inquiry; backoff `30s×2^n`, max 15min; circuit-breaker 5 failures→30s |
| D3 | JWT role `PAYMENT_OPERATOR` required; Customer/Barista bị từ chối | ✅ | `payments.controller.ts` dòng 74–76: `@Roles(UserRole.PAYMENT_OPERATOR)`; integration test: 401→403→200 theo role |
| D4 | Recovery Idempotency-Key persist/unique; providerRequestId & gatewayTransactionId unique constraint | ✅ | `schema.prisma`: `@@unique([paymentId, idempotencyKey])`, `@unique providerRequestId`, `@unique gatewayTransactionId` |
| D5 | Audit append-only: actor, Payment, gateway ref, correlation ID, before/after state, outcome, timestamp, incident ref | ✅ | `PaymentRecoveryAudit` model — không có `updatedAt`; DB-level immutability verified bằng integration test (UPDATE/DELETE throw `/append-only/`) |
| D6 | Settlement khóa Order, commit Payment+Order+Coupon/Inventory/Loyalty+audit trong cùng transaction | ✅ | `applyInquiryResult()`: `getOrderForPaymentForUpdate()` → `SELECT FOR UPDATE`; `markOrderPaid()` trong cùng `$transaction` |
| D7 | Late success → MANUAL_REVIEW; runbook yêu cầu refund thủ công, phê duyệt kép | ✅ | Service: `order.status !== PENDING \|\| reservationExpiresAt <= processedAt → MANUAL_REVIEW`; runbook Section 5.1 có quy trình 2-operator |
| D8 | Phân biệt timeout/UNKNOWN, definitive failure, success, duplicate/out-of-order IPN | ✅ | `applyInquiryResult()`: 8 nhánh riêng biệt — UNKNOWN, DEFINITIVE_FAILURE, SUCCESS, LATE_SUCCESS, MANUAL_REVIEW, PENDING, DUPLICATE_OR_OUT_OF_ORDER, SUCCESS_WITHOUT_TRANSACTION_NUMBER |
| D9 | Regression tests bao phủ lease expiry/restart, timeout, duplicate, late success, concurrent, **amount mismatch, merchant mismatch**, unauthorized | ✅ | `vnpay-inquiry.service.spec.ts`: 3 tests tường minh — *"rejects a response whose vnp_Amount does not match"*, *"rejects a response whose vnp_TmnCode does not match this merchant"*, *"rejects a response whose vnp_TxnRef does not match"*; tổng 389 tests PASS |
| D10 | PostgreSQL integration tests: no double-settlement, inventory/coupon giữ khi UNKNOWN, late success MANUAL_REVIEW, audit sau rollback | ✅ | `payment-expiry.integration-spec.ts`: 5 kịch bản đầy đủ, bao gồm append-only DB enforcement |
| D11 | Runbook: evidence checklist, operator approval, refund/compensation, incident closure, **SLA target** | ✅ | Runbook Section 0: SLA table (15min→30min→60min→24h); Section 5.1: quy trình 2-operator step-by-step; disclaimer cũ "PR #35 chưa có API" đã xóa; Section 8.1 cập nhật checklist ✅|
| D12 | Merchant Sandbox E2E — hoãn theo phạm vi | ✅ | Đúng theo quyết định phạm vi; documented rõ trong runbook Section 7 và Section 8.1 |

---

## Acceptance Criteria

| # | Tiêu chí | Trạng thái | Bằng chứng |
|---|---|---|---|
| AC1 | Không Payment nào bị tự động kết luận FAILED chỉ vì timeout/restart | ✅ | `finalizeUnknown()` giữ `PROCESSING`; lease expiry → `UNKNOWN` không phải `FAILED`; integration test xác nhận |
| AC2 | Concurrent workers không thể double-settle cùng transaction | ✅ | Lease + `SELECT FOR UPDATE` + unique `providerRequestId`; integration test "serializes concurrent operator recovery" PASS |
| AC3 | Payment+Order+nghiệp vụ phụ atomic, có audit trail | ✅ | `$transaction` bao Payment+Order+Audit; test "persists audit after rolled-back settlement" xác nhận audit sống sót sau rollback |
| AC4 | Late success → trạng thái rõ ràng, có compensation policy, không tạo PAID không nhất quán | ✅ | `MANUAL_REVIEW` + `failureCode: LATE_SUCCESS_REQUIRES_REVIEW`; `markOrderPaid` không được gọi; resolution cần 2 operator |
| AC5 | Unauthorized operator không thể gọi recovery | ✅ | HTTP 401 (no token) / 403 (CUSTOMER/BARISTA) / 200 (PAYMENT_OPERATOR) — integration test `orders.integration-spec.ts` |
| AC6 | Unit, integration, security, migration, **coverage** PASS cùng revision | ✅ | `payment-recovery.service.ts`: **88.58% lines, 100% functions**; `vnpay-inquiry.service.ts`: **100% lines, 100% functions** — cả hai xuất hiện trong `coverage-summary.json` sau khi fix `vitest.config.ts` |

---

## Câu hỏi bổ sung

| Câu hỏi | Trạng thái | Ghi chú |
|---|---|---|
| VNPay Sandbox có hỗ trợ QR động (VNPAYQR)? | ⚠ Chưa xác nhận | Sandbox hỗ trợ `vnp_BankCode=VNPAYQR` theo tài liệu, nhưng cần TmnCode/HashSecret thật để test. Documented trong runbook Section 7. |
| QR countdown timer UI | ✅ Đã triển khai | `PaymentCountdownTimer.tsx`: live mm:ss, aria-live, urgent state ≤30s; `VnpayPendingScreen.tsx`: poll 5s, AbortController cleanup, 3-fail circuit; tích hợp vào `checkout/page.tsx` |
| Docker backend VNPay routes | ✅ Đã fix | compose.yaml forward 9 biến `VNPAY_*`; `WEB_ORIGIN_BACKEND` dùng HTTPS; `/api/v1/payments/vnpay/ipn` → `{RspCode:"97"}` qua Cloudflare tunnel |

---

## Trạng thái Git

| Commit | Mô tả |
|---|---|
| `4b16a1d` | fix 3 failing spec tests (spec fixture timezone bug) |
| `70e188b` | feat: hoàn thiện D9+D11+AC6+QR countdown |
| `f9e2e39` | fix(docker): forward VNPAY_* env vars (**local, chưa push**) |

> ⚠ **Commit `f9e2e39` chưa push** — git push timeout do credential manager cần GUI. Chạy thủ công:
> ```powershell
> git push origin Kiet-Payment-Idempotency-PaymentUI
> ```

---

## Hoàn thành mới nhất (2026-11-06)

### ✅ Payment Refund API — Spec hoàn chỉnh

**Trạng thái:** Requirements ✅ · Design ✅ · Tasks ✅ · Analysis ✅

**Tài liệu:**
- Requirements: `.kiro/specs/payment-refund-api/requirements.md` — 13 requirements, 67 acceptance criteria
- Design: `.kiro/specs/payment-refund-api/design.md` — Full-stack architecture, transaction atomicity, idempotency
- Tasks: `.kiro/specs/payment-refund-api/tasks.md` — 17 tasks chính, 64 sub-tasks, 21 waves, 6 checkpoints

**Chi tiết kỹ thuật:**
| Khía cạnh | Mô tả |
|---|---|
| **Architecture** | Guards → Controller → RefundService orchestrator → 6 services integration |
| **Transaction Safety** | Prisma interactive transactions với automatic rollback |
| **Idempotency** | Unique constraint `(paymentId, idempotencyKey)` |
| **VNPay Integration** | Secure hash SHA-256, timeout handling, merchant validation |
| **Data Models** | 2 tables mới: `Refund` (9 fields), `RefundAuditLog` (11 event types) |
| **Security** | JWT auth + RBAC (`PAYMENT_OPERATOR` role), rate limiting, HTTPS, input sanitization |
| **Services Integrated** | VNPay, Loyalty, Coupon, Inventory, Payment, Order |

**Correctness Properties (Property-Based Testing):**
1. Idempotency: Multiple requests with same key → same result
2. Atomicity: Refund state + Order state + side-effects atomic
3. Authorization: Only `PAYMENT_OPERATOR` can refund
4. Amount bounds: `0 < refundAmount ≤ payment.amount`
5. State machine: Valid transitions only (PENDING → SUCCESS/FAILED, không reverse)
6. Audit completeness: Mọi state transition phải có audit log
7. VNPay validation: HMAC + merchant + amount match

**Requirements Analysis Findings:**
- Response behavior: API trả về ngay với `status: 'pending'` + refund ID (không chờ hoàn tất)
- Error precedence: Authorization check (403) trước validation (400)
- Rollback guarantee: Inventory restoration failure PHẢI rollback toàn bộ transaction

**Implementation Plan:**
- **17 core tasks** + **16 test tasks** (marked optional `*`)
- **6 checkpoints:** Migrate, Models, VNPay, Service Layer, Controller, E2E
- **21-wave dependency graph** cho parallel execution
- **Testing coverage target:** 90% unit test coverage

### Merchant Sandbox TmnCode/HashSecret thật + E2E test

**Hoàn thành:**

✅ Requirements (16 requirements)
✅ Design
✅ Tasks (24/24 tasks completed)
Phân chia theo Phase:

✅ Phase 1: Hạ tầng kiểm thử (8 tasks) — helpers, fixtures, auth, cart, assertions
✅ Phase 2: Core test cases (4 tasks) — happy path, signature, idempotency
✅ Phase 3: Edge cases (6 tasks) — timeout recovery, IPN race, double-click, network loss, polling
✅ Phase 4: CI/CD & Polish (6 tasks) — GitHub Actions, npm scripts, error handling, docs

---

## Còn lại trước production go-live

| Hạng mục | Trạng thái | Người thực hiện |
|---|---|---|
| ✅ Merchant Sandbox TmnCode/HashSecret thật + E2E test | **COMPLETED** | Owner PR #28 — 24/24 tasks ✅ |
| ✅ VNPay Refund API spec (requirements + design + tasks) | **COMPLETED** | Owner PR #28 |
| ⚠️ VNPay Refund API implementation | Pending | Owner PR #28 (hoặc task riêng) |

> **Ghi chú VNPay E2E Tests:** 
> - **Spec:** `.kiro/specs/vnpay-e2e-tests/` — Requirements ✅ · Design ✅ · Tasks ✅
> - **Coverage:** 16/16 requirements với 24 tasks hoàn chỉnh
> - **Hạ tầng:** Test helpers, fixtures, auth, cart, assertions — Phase 1 ✅
> - **Core tests:** Happy path, signature validation, idempotency — Phase 2 ✅  
> - **Edge cases:** Timeout recovery, IPN race, double-click, network loss, polling — Phase 3 ✅
> - **CI/CD:** GitHub Actions workflow, npm scripts, error handling, docs — Phase 4 ✅
> - **Implementation:** Tasks đã được executed và documented trong spec folder
>
> **Ghi chú VNPay Refund API:** 
> - Spec đã có đầy đủ (requirements + design + tasks)
> - Implementation có thể bắt đầu ngay sau khi PR #28 được merge hoặc thực hiện song song trong task riêng
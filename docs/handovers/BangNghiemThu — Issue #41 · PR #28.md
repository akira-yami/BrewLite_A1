# Bảng Nghiệm Thu — Issue #41 · PR #28
**Cập nhật:** 2026-11-05 · Branch: `Kiet-Payment-Idempotency-PaymentUI`  
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

## Còn lại trước production go-live

| Hạng mục | Người thực hiện |
|---|---|
| ❌ Independent reviewer `Tang18xJan` submit APPROVED | Reviewer |
| ❌ Merchant Sandbox TmnCode/HashSecret thật + E2E test | Owner PR #28 |
| ❌ SLA target ratified bởi Payment Operations | PO + Payment Ops |
| ❌ Scheduled auto-recovery job (ngoài phạm vi PR #28) | Task riêng |
| ❌ VNPay Refund API endpoint (hiện ghi REFUNDED trên DB; merchant tự refund qua portal) | Task riêng |

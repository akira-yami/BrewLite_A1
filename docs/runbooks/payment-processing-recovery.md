# Runbook — Payment bị treo ở trạng thái `PROCESSING`

**Phạm vi:** Payment/Order trong BrewLite; VNPay là gateway bất đồng bộ được triển khai từ Issue #41.  
**Mục tiêu:** khôi phục trạng thái nhất quán mà không tạo double-charge, trả kho sớm hoặc làm mất dấu vết đối soát.  
**Phân loại:** tài liệu vận hành và quy trình ứng cứu; recovery API đã được triển khai tại `POST /api/v1/payments/:paymentId/recovery` (yêu cầu role `PAYMENT_OPERATOR`).

> **Trạng thái triển khai (cập nhật 2026-11-05):**
> Recovery operator API (`POST /payments/:paymentId/recovery`), VNPay QueryDr adapter, durable audit, circuit-breaker, backoff và MANUAL_REVIEW workflow **đã được triển khai** trong nhánh `Kiet-Payment-Idempotency-PaymentUI` (PR #28 + Issue #41).
> Điều kiện chưa hoàn thành trước production go-live: (1) merchant Sandbox TmnCode/HashSecret thật và E2E test; (2) SLA time-to-resolve phải được Payment Operations ratify theo bảng bên dưới.

## 0. SLA mục tiêu (chờ Payment Operations ratification)

| Mốc | Mục tiêu tạm thời | Trạng thái |
|---|---|---|
| Phát hiện Payment `PROCESSING` nghi vấn | ≤ 15 phút kể từ khi cảnh báo | ⏳ Chờ ratify |
| Escalate cho PAYMENT_OPERATOR | ≤ 30 phút sau phát hiện | ⏳ Chờ ratify |
| Hoàn tất QueryDr và ghi kết quả | ≤ 60 phút sau escalation | ⏳ Chờ ratify |
| Đóng incident (bao gồm refund nếu có) | ≤ 24 giờ sau phát hiện | ⏳ Chờ ratify |

**Lưu ý:** Các mốc trên chỉ là đề xuất kỹ thuật; phải được Payment Operations và PO ký duyệt trước production go-live. Không sử dụng mốc của MockGateway (5 phút) cho VNPay.

## 1. Nguyên tắc an toàn bắt buộc

1. `PROCESSING` có nghĩa là kết quả cuối chưa được ghi nhận trong database. Không suy luận rằng gateway thất bại chỉ vì request timeout, process restart hoặc `updated_at` đã cũ.
2. Không xóa Payment, không đổi `PROCESSING` thành `FAILED` bằng SQL thủ công và không tạo Payment mới với Idempotency-Key khác để “thử lại”.
3. Chỉ cho phép một Payment `PROCESSING` trên mỗi Order. Partial unique index `uq_one_processing_payment_per_order` là hàng rào cuối ở database; không vô hiệu hóa index để xử lý incident.
4. Không hủy Order hoặc giải phóng inventory/coupon khi chưa xác định được kết quả gateway. Order expiry và inventory expiry phải giữ nguyên tài nguyên trong lúc còn Payment `PROCESSING`.
5. Mọi quyết định cập nhật Payment và Order phải được thực hiện nguyên tử, có khóa Order, lưu actor/ticket/evidence và đi qua nghiệp vụ cập nhật Order. `OrdersService.markOrderPaid()` còn quyết toán Loyalty/Inventory/Coupon; chỉ cập nhật `payments.status` hoặc `orders.status` riêng lẻ sẽ làm dữ liệu lệch.
6. Với trạng thái chưa rõ, ưu tiên giữ `PROCESSING` và escalate cho người vận hành thanh toán thay vì đoán kết quả.

## 2. Khi nào mở incident

- Với MockGateway hiện tại, gateway giả lập chỉ trì hoãn khoảng 1–2 giây. Payment vẫn `PROCESSING` quá 5 phút có thể đưa vào hàng đợi điều tra; mốc này chỉ là ngưỡng triage, không phải căn cứ tự động đổi trạng thái.
- Nếu sau này dùng gateway bất đồng bộ, thay ngưỡng 5 phút bằng timeout/settlement SLA đã được phê duyệt cho gateway đó. Không tái sử dụng mốc MockGateway cho VNPay.
- Ghi nhận UTC timestamp, environment, release/commit SHA, Order ID, Payment ID và request/correlation ID. Không đưa secret, VNPay HashSecret hoặc toàn bộ thông tin thẻ vào ticket/log.

## 3. Chẩn đoán chỉ đọc

Chạy bằng tài khoản DB read-only trong đúng environment. Query dưới đây không sửa dữ liệu:

```sql
SELECT
  p.id AS payment_id,
  p.order_id,
  o.order_number,
  p.method,
  p.amount,
  p.status AS payment_status,
  p.gateway_transaction_id,
  p.failure_code,
  p.created_at AS payment_created_at,
  p.updated_at AS payment_updated_at,
  o.status AS order_status,
  o.reservation_expires_at
FROM payments AS p
JOIN orders AS o ON o.id = p.order_id
WHERE p.status = 'PROCESSING'
  AND p.created_at < NOW() - INTERVAL '5 minutes'
ORDER BY p.created_at ASC;
```

Kiểm tra invariant không có nhiều Payment `PROCESSING` trên một Order:

```sql
SELECT order_id, COUNT(*) AS processing_count
FROM payments
WHERE status = 'PROCESSING'
GROUP BY order_id
HAVING COUNT(*) > 1;
```

Kết quả mong đợi của query thứ hai là 0 rows. Nếu có dòng, giữ nguyên tất cả bản ghi, dừng mọi thao tác retry/cancel liên quan và escalate DBA/on-call; không tự chọn một Payment để xóa.

## 3.1. Tra cứu trạng thái ứng dụng (read-only)

Với customer đã đăng nhập, API cung cấp endpoint chỉ đọc:

```http
GET /api/v1/payments/status
Authorization: Bearer <customer-access-token>
Idempotency-Key: <original-payment-key>
```

Endpoint chỉ trả trạng thái Payment có cùng Idempotency-Key và thuộc Order của customer hiện tại; key không tồn tại hoặc thuộc customer khác trả `404 PAYMENT_NOT_FOUND`. Endpoint không gọi gateway, không tạo attempt mới và không tự sửa `PROCESSING`.

- `SUCCEEDED`: kiểm tra Order tương ứng đã `PAID`; không gửi Payment mới.
- `FAILED`: đây là kết quả đã ghi nhận; retry nghiệp vụ phải dùng key mới trên cùng Order nếu Order còn hạn.
- `PROCESSING`: tiếp tục giữ nguyên Order, inventory và coupon; tra cứu lại sau hoặc thực hiện quy trình incident.
- `PAYMENT_NOT_FOUND`: nếu client đã lưu attempt trước khi gửi POST, chỉ replay POST bằng chính Idempotency-Key cũ; tuyệt đối không tạo key mới chỉ vì chưa thấy bản ghi.

## 4. Thu thập bằng chứng

1. Tìm log theo Payment ID, Order ID và khoảng thời gian; đối chiếu thời điểm tạo Payment, bắt đầu gọi gateway và thời điểm process restart/timeout.
2. Ghi lại `method`, `amount`, trạng thái Order, `gateway_transaction_id` nếu đã được persist, `failure_code`, `created_at`, `updated_at` và `processed_at`.
3. Không coi việc thiếu log là bằng chứng gateway thất bại. Với MockGateway, nhánh random success có log mã giao dịch; nhánh deterministic có thể không log mã giao dịch. Hiện tại mã giao dịch chỉ được ghi DB trong transaction cuối sau khi gateway trả kết quả.
4. Lưu snapshot query, app logs đã redact, ticket incident và người ra quyết định. Nếu truy vấn được chạy bằng SQLTools, ghi rõ DB/environment và thời điểm; không ghi nhận bằng chứng người dùng cung cấp như thể hệ thống tự xác minh.

## 5. Quyết định theo kết quả đối soát

| Bằng chứng | Xử lý an toàn |
|---|---|
| DB đã có Payment `SUCCEEDED` và Order `PAID` | Không thao tác; xác minh amount và gateway reference khớp nhau. |
| Payment `FAILED` và Order `PAYMENT_FAILED` | Không chạy recovery lần nữa; kiểm tra lỗi và quy tắc retry bình thường. |
| Gateway có bằng chứng thành công chắc chắn, DB vẫn `PROCESSING` | Giữ chặn retry; chuyển cho on-call/DBA dùng recovery operation có kiểm soát để ghi Payment `SUCCEEDED` và chạy cùng nghiệp vụ `markOrderPaid` trong một transaction. Kiểm tra Order chưa được thanh toán trước đó, amount khớp tuyệt đối và reference chưa được gắn với Payment khác. |
| Gateway xác nhận thất bại/không phát sinh charge | Chỉ sau khi có bằng chứng dứt khoát, recovery operation được phê duyệt mới được ghi Payment `FAILED` và Order `PAYMENT_FAILED` trong cùng transaction; giữ nguyên history và evidence. |
| Gateway không thể xác định kết quả | Tiếp tục giữ `PROCESSING`; không tạo Payment mới, không hủy Order, không giải phóng kho/coupon. Escalate để gateway/operator đối soát. |
| Có dấu hiệu charge trùng hoặc charge thành công sau khi Order hết hạn/đã hủy | Không cố ép Order sang `PAID` hoặc đánh dấu `FAILED` để che dấu. Giữ evidence, chuyển quy trình refund/compensation có phê duyệt và đối soát tồn kho/coupon/loyalty. |

**Trạng thái triển khai (cập nhật 2026-11-05):** Recovery API (`POST /api/v1/payments/:paymentId/recovery`) và MANUAL_REVIEW resolution workflow (`POST /api/v1/payments/:paymentId/recovery/resolve`) **đã được triển khai** và kiểm thử (Issue #41). Operator có role `PAYMENT_OPERATOR` có thể gọi API trực tiếp theo quy trình dưới đây thay vì chờ DBA can thiệp thủ công.

## 5.1. Quy trình phê duyệt kép cho MANUAL_REVIEW

Khi QueryDr trả về `SUCCESS` nhưng Order đã hết hạn hoặc đã hủy, Payment chuyển sang `MANUAL_REVIEW`. Quy trình giải quyết bắt buộc có phê duyệt kép:

**Điều kiện bắt buộc:**
- Operator **khởi tạo** recovery và operator **xác nhận** kết quả phải là **hai người khác nhau** (system enforce bằng `SECOND_OPERATOR_REQUIRED` error code).
- Evidence reference (mã đối chiếu bên ngoài từ VNPay portal hoặc ngân hàng) là bắt buộc.

**Bước 1 — Operator 1** (người chạy QueryDr ban đầu):
```http
POST /api/v1/payments/:paymentId/recovery
Authorization: Bearer <PAYMENT_OPERATOR-token>
Idempotency-Key: <unique-recovery-key>

{ "incidentReference": "INC-2026-XXXX" }
```
→ Kết quả: `paymentStatus: "MANUAL_REVIEW"`

**Bước 2 — Operator 2** (người khác, xác minh bằng chứng refund từ VNPay):
```http
POST /api/v1/payments/:paymentId/recovery/resolve
Authorization: Bearer <different-PAYMENT_OPERATOR-token>
Idempotency-Key: <unique-resolution-key>

{
  "decision": "REFUND_CONFIRMED",       // hoặc "NO_CHARGE_CONFIRMED"
  "evidenceReference": "VN-REFUND-2026-XXXX",
  "incidentReference": "INC-2026-XXXX"
}
```
→ Kết quả: `paymentStatus: "REFUNDED"` (nếu refund) hoặc `"FAILED"` (nếu no-charge).

**Lưu ý bảo mật:**
- Không bao giờ dùng cùng một JWT token cho cả hai bước.
- `evidenceReference` phải là mã đối chiếu từ hệ thống VNPay hoặc ngân hàng, không phải nội bộ tự đặt.
- Sau khi giải quyết, audit record là **append-only** tại database level và không thể sửa xóa.

## 6. Ảnh hưởng của expiry jobs

- Chỉ có `OrderExpiryJob` là cron có thẩm quyền xử lý hết hạn; provider này được đăng ký trong `OrdersModule` và scheduler được bật tại `AppModule`. `InventoryExpiryJob` độc lập đã bị loại bỏ.
- Job chỉ chọn Order `PENDING`/`PAYMENT_FAILED` đã hết hạn và không có Payment `PROCESSING`; bên trong transaction nó khóa lại Order, kiểm tra Payment lần nữa, cập nhật trạng thái/lịch sử, release coupon và release reservation.
- `InventoryExpiryJob` độc lập đã bị loại bỏ vì chưa được đăng ký và việc scan reservation rồi release ngoài Order row lock tạo cửa sổ race với Payment; không đăng ký lại job này.
- `OrdersService.cancelOrder()` từ chối hủy nếu Order còn Payment `PROCESSING`.
- Sau khi Payment được đối soát và hoàn tất bằng recovery operation được phê duyệt, Order expiry có thể tiếp tục theo trạng thái và deadline. Không chạy cron thủ công để “dọn” dữ liệu.

## 7. Ranh giới triển khai VNPay hiện tại

**Đã triển khai (Issue #41):**
- `VnpayInquiryService` — QueryDr adapter với HMAC-SHA512, timeout 8 giây, ánh xạ outcome → trạng thái nội bộ.
- `PaymentRecoveryService` — operator-triggered recovery API, durable backoff, circuit-breaker, MANUAL_REVIEW, second-operator approval.
- `PaymentRecoveryAudit` — append-only audit trail với beforeState/afterState/correlationId/incidentReference.
- `POST /payments/:paymentId/recovery` và `/recovery/resolve` — HTTP endpoints với PAYMENT_OPERATOR guard.

**Chưa triển khai (production blocker):**
- Merchant Sandbox TmnCode/HashSecret thật và kết quả E2E thực tế qua VNPay Sandbox.
- Automated inquiry / scheduled reconciliation job (ngoài phạm vi PR #28).
- Refund API gọi VNPay refund endpoint (hiện chỉ ghi `REFUNDED` trên DB; merchant phải tự thao tác refund trên VNPay portal với evidence reference từ Operator 2).
- QR Code dynamic payment với `VNPAYQR` — cần `vnp_BankCode=VNPAYQR` và Sandbox credentials.
- Frontend QR countdown timer — cần task riêng.

Không dùng MockGateway evidence để kết luận giao dịch merchant thực tế đã thành công/thất bại.

## 8. Điều kiện đóng incident

- [ ] Gateway outcome được xác minh bằng nguồn có thẩm quyền; nếu không thể xác minh thì incident vẫn mở.
- [ ] Payment và Order nhất quán sau thao tác; amount/reference đã đối soát.
- [ ] Inventory reservation, coupon redemption và loyalty state được kiểm tra.
- [ ] Không còn duplicate `PROCESSING` payment trên Order.
- [ ] Evidence, actor, thời gian UTC, ticket và quyết định refund/compensation (nếu có) được lưu.
- [ ] Root cause và corrective action được ghi nhận; nếu cần recovery automation thì tạo PR/work item riêng.

**Không đóng incident chỉ vì Payment đã rời `PROCESSING`; phải xác nhận cả Order và các side effects nghiệp vụ.**


## 8. VNPay asynchronous settlement

1. VNPay IPN (GET /api/v1/payments/vnpay/ipn) is the only authoritative settlement input. It must pass HMAC-SHA512, TmnCode and exact amount checks before database mutation.
2. IPN handling locks the Order, re-reads Payment by its unique gateway_reference, and applies Payment + Order settlement in one transaction.
3. Duplicate terminal callbacks do not run settlement twice and return VNPay acknowledgement code 02.
4. Browser Return (GET /api/v1/payments/vnpay/return) is display-only. Never mark a Payment as paid from Return query parameters.
5. If Checkout returns while Payment remains PROCESSING, keep the existing Idempotency-Key and wait for IPN or escalate for gateway inquiry/reconciliation. Do not create another payment attempt.
6. Automated inquiry, late-success recovery, refund and operator-approved reconciliation are not included in the current implementation; they remain required production operations work.


### 8.1. Trạng thái triển khai Issue #41

Recovery operator API đã được triển khai trong `Kiet-Payment-Idempotency-PaymentUI` (PR #28). Các điều kiện còn lại trước production go-live được theo dõi tại [Issue #41](https://github.com/akira-yami/BrewLite_A1/issues/41):

- ✅ VNPay QueryDr adapter, HMAC-SHA512, timeout 8 giây
- ✅ Operator-triggered recovery API với PAYMENT_OPERATOR guard
- ✅ Durable backoff, circuit-breaker, lease management
- ✅ MANUAL_REVIEW + second-operator resolution workflow
- ✅ Append-only audit (DB-level immutability verified)
- ✅ PostgreSQL integration tests (5 kịch bản)
- ❌ Merchant Sandbox E2E (production blocker — chờ TmnCode/HashSecret thật)
- ❌ SLA target ratified bởi Payment Operations
- ❌ Automated scheduled reconciliation job

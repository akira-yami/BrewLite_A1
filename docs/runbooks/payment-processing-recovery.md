# Runbook — Payment bị treo ở trạng thái `PROCESSING`

**Phạm vi:** Payment/Order trong BrewLite; implementation hiện tại chỉ đăng ký `MockGatewayService`.  
**Mục tiêu:** khôi phục trạng thái nhất quán mà không tạo double-charge, trả kho sớm hoặc làm mất dấu vết đối soát.  
**Phân loại:** tài liệu vận hành và quy trình ứng cứu; **không phải** một recovery endpoint/script đã được triển khai.

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

**Giới hạn triển khai hiện tại:** PR #35 chưa có admin recovery command/API, gateway status inquiry, refund API hoặc durable audit record cho thao tác phục hồi. Vì vậy runbook này hướng dẫn triage/escalation; không cho phép DBA tự viết `UPDATE` trực tiếp để hoàn tất các trạng thái nêu trên. Cần một work item riêng để triển khai recovery operation có authorization, idempotency, audit log và integration tests trước khi tự động hóa.

## 6. Ảnh hưởng của expiry jobs

- Chỉ có `OrderExpiryJob` là cron có thẩm quyền xử lý hết hạn; provider này được đăng ký trong `OrdersModule` và scheduler được bật tại `AppModule`. `InventoryExpiryJob` độc lập đã bị loại bỏ.
- Job chỉ chọn Order `PENDING`/`PAYMENT_FAILED` đã hết hạn và không có Payment `PROCESSING`; bên trong transaction nó khóa lại Order, kiểm tra Payment lần nữa, cập nhật trạng thái/lịch sử, release coupon và release reservation.
- `InventoryExpiryJob` độc lập đã bị loại bỏ vì chưa được đăng ký và việc scan reservation rồi release ngoài Order row lock tạo cửa sổ race với Payment; không đăng ký lại job này.
- `OrdersService.cancelOrder()` từ chối hủy nếu Order còn Payment `PROCESSING`.
- Sau khi Payment được đối soát và hoàn tất bằng recovery operation được phê duyệt, Order expiry có thể tiếp tục theo trạng thái và deadline. Không chạy cron thủ công để “dọn” dữ liệu.

## 7. Ranh giới MockGateway và VNPay

- `PaymentsModule` hiện chỉ đăng ký `MockGatewayService`; chưa có VNPay adapter, payment URL, IPN signature validation, Return URL, provider status inquiry, refund, late-success handler hoặc Sandbox E2E.
- Schema hiện tại có `gatewayTransactionId` nhưng chưa có provider name/provider order reference/payload audit fields đủ cho quy trình VNPay reconciliation. Không dùng MockGateway evidence để kết luận giao dịch merchant thực tế đã thành công/thất bại.
- Trước VNPay go-live cần thiết kế riêng: stable `vnp_TxnRef` gắn với Payment, chữ ký IPN, xác minh TmnCode/amount/order, chống replay callback, idempotent state transition, Return URL chỉ hiển thị trạng thái, status inquiry, xử lý late success, refund và daily settlement reconciliation. Cần sandbox credentials và kết quả E2E từ merchant sandbox; không đưa credentials vào repo.

## 8. Điều kiện đóng incident

- [ ] Gateway outcome được xác minh bằng nguồn có thẩm quyền; nếu không thể xác minh thì incident vẫn mở.
- [ ] Payment và Order nhất quán sau thao tác; amount/reference đã đối soát.
- [ ] Inventory reservation, coupon redemption và loyalty state được kiểm tra.
- [ ] Không còn duplicate `PROCESSING` payment trên Order.
- [ ] Evidence, actor, thời gian UTC, ticket và quyết định refund/compensation (nếu có) được lưu.
- [ ] Root cause và corrective action được ghi nhận; nếu cần recovery automation thì tạo PR/work item riêng.

**Không đóng incident chỉ vì Payment đã rời `PROCESSING`; phải xác nhận cả Order và các side effects nghiệp vụ.**

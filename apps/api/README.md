# BrewLite API

Backend BrewLite sử dụng NestJS, TypeScript và REST API với global prefix `/api/v1`.

## Chạy local

```bash
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
# Điền giá trị vừa tạo vào JWT_SECRET trong .env trước khi khởi động.
npm run prisma:generate
npm run prisma:deploy
npm run start:dev
```

Tạo database `brewlite` và user tương ứng trong PostgreSQL trước khi migrate. API chạy tại `http://localhost:3001`; readiness endpoint `GET /api/v1/health` kiểm tra kết nối DB bằng `SELECT 1` và trả 503 khi DB lỗi. Trên PowerShell dùng `Copy-Item .env.example .env`.

Các biến môi trường chính:

```dotenv
PORT=3001
WEB_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://brewlite:change_me_local_only@localhost:5432/brewlite?schema=public
JWT_SECRET=<secret ngẫu nhiên vừa tạo>
JWT_ISSUER=brewlite-api
JWT_AUDIENCE=brewlite-web
JWT_EXPIRES_IN=15m
ORDER_RESERVATION_TTL_MINUTES=15
TRUSTED_PROXY_CIDRS=
```

`WEB_ORIGIN` chấp nhận nhiều origin phân tách bằng dấu phẩy.

`TRUSTED_PROXY_CIDRS` là allowlist tùy chọn cho địa chỉ IP/CIDR của reverse-proxy/ingress trực tiếp kết nối tới API. Để trống khi client kết nối thẳng. Khi cấu hình, Express chỉ tin `X-Forwarded-For` từ các proxy nằm trong allowlist này; địa chỉ `@Ip()` dùng cho VNPay được suy ra theo proxy chain đã tin cậy. Dùng IP/CIDR nội bộ thực tế do người quản trị hạ tầng xác nhận, không sao chép giá trị ví dụ hoặc đoán dải IP. Không dùng `true`, `*`, `0.0.0.0/0` hay `::/0`; API phải được firewall để client Internet không thể giả làm ingress tin cậy.

`JWT_SECRET` bắt buộc để ký và xác thực JWT. API dừng khi thiếu biến này. File `.env` dùng cho local được Git bỏ qua; không ghi secret thật vào `.env.example`.
`JWT_EXPIRES_IN` nhận duration dương dạng `s`, `m`, `h` hoặc `d` (ví dụ `900s`, `15m`, `1h`) và tối đa 7 ngày; `ORDER_RESERVATION_TTL_MINUTES` phải là số nguyên từ 1 đến 10080 (7 ngày). API dừng lúc khởi động nếu một trong hai giá trị không hợp lệ.

## Seed Catalog

Sau khi migrate, chạy `npm run db:seed` để bổ sung catalog mẫu. Seed chỉ thêm sản phẩm, size, topping và liên kết còn thiếu theo SKU/code/khóa liên kết; có thể chạy nhiều lần mà không tạo bản ghi trùng.

Seed cũng bổ sung nguyên liệu (`ingredients`) và công thức (`recipe_items`) cho từng size còn thiếu. Seed giữ nguyên ID, giá, tồn kho nguyên liệu, version, trạng thái và nội dung đã chỉnh sửa của bản ghi hiện có (kể cả công thức đã sửa). Không xóa đơn hàng, chi tiết đơn, topping của đơn hoặc giữ chỗ tồn kho. Toàn bộ seed chạy trong một transaction: nếu gặp lỗi, dữ liệu vừa thêm được rollback và lệnh trả mã lỗi.

## Tồn kho theo nguyên liệu và công thức (BOM)

Thành phẩm (ly cà phê, trà sữa...) **không có số lượng trong CSDL**: `products` và `product_variants` không có cột `stock`, `quantity` hay `version`. Tồn kho chỉ nằm ở nguyên liệu thô.

| Bảng | Vai trò |
|---|---|
| `ingredients` | Nguyên liệu thô. `stock_quantity` tính theo đơn vị cơ sở của `unit` (`G`, `ML`, `PCS`); `version` dùng cho compare-and-set khi trừ kho. |
| `recipe_items` | Công thức (BOM): khóa chính `(product_variant_id, ingredient_id)`, `quantity` là lượng nguyên liệu cho 1 ly. |
| `inventory_reservation_items` | Lượng nguyên liệu thực tế đã giữ cho từng reservation, dùng để hoàn đúng số lượng khi hủy hoặc hết hạn, kể cả khi công thức đổi sau đó. |

Topping theo cùng nguyên tắc, bảng `topping_recipe_items` (công thức 1 phần topping) và cột `toppings.type`:

- `PREPACKAGED` (nhập sẵn: thạch hộp, trân châu 3Q, flan đóng hộp): đúng 1 dòng công thức, 1 phần = 1 định lượng nguyên liệu thô, ví dụ 30g trân châu 3Q.
- `PREPARED` (chế biến: trân châu đen đường đen, kem cheese tự đánh): bán thành phẩm, 1 phần gồm nhiều nguyên liệu thô (bột năng, đường đen, sữa tươi...). Không có tồn kho riêng cho bán thành phẩm; tồn kho chỉ nằm ở nguyên liệu thô.

Mỗi ly kèm một phần topping, nguyên liệu của topping được trừ cùng lúc với nguyên liệu của ly và ghi vào reservation. `toppings[].available` trong API là `true` khi topping đang hoạt động và mọi nguyên liệu đủ cho ít nhất 1 phần. Topping chưa có công thức bị coi là hết hàng (tạo đơn trả `OUT_OF_STOCK` kèm `toppingId`). Số lượng công thức là số nguyên theo đơn vị cơ sở nên chọn đơn vị (g, ml) đủ nhỏ để không cần phần thập phân. Migration `20261101100000_topping_recipe`.

Số ly tối đa của một size được tính khi đọc, không lưu: `min(floor(stock_quantity / recipe_items.quantity))` trên mọi dòng công thức. Ví dụ kho 100g cà phê và công thức 10g/ly cho tối đa 10 ly. Size chưa có công thức hoặc có nguyên liệu `is_active = false` được coi là 0 ly. API menu/detail trả giá trị này ở `variants[].availableServings` (thay cho `stock`).

Khi tạo đơn, hệ thống quy đổi số ly thành nhu cầu nguyên liệu theo công thức, cộng dồn các nguyên liệu dùng chung giữa các dòng, rồi trừ kho nguyên liệu bằng `UPDATE ... WHERE version = ? AND stock_quantity >= ?` theo thứ tự ID trong transaction `Serializable`. Migration `20261101090000_ingredient_recipe_inventory` tạo ba bảng trên và xóa `product_variants.stock`/`version`. Số lượng thành phẩm cũ không được chuyển đổi; sau khi `npm run prisma:deploy`, chạy `npm run db:seed` để có nguyên liệu và công thức mẫu.

## Kiểm tra

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Build/typecheck tự generate client; `src/generated/prisma` được bỏ qua trong Git. Docker dùng migration one-shot trước backend. Không sửa migration đã chạy trên database chia sẻ.

## Mức đường/đá của OrderItem

`sugarLevel Int? @map("sugar_level")` và `iceLevel Int? @map("ice_level")` nhận phần trăm nguyên 0..100. Null hoặc không gửi dùng công thức chuẩn; 0 là không đường/đá. Migration `20261010090000_order_item_sugar_ice_levels` thêm hai cột nullable và CHECK, giữ đơn cũ với null. Cập nhật DB đang dùng bằng `npm run prisma:deploy`, rồi `npm run prisma:generate` (hoặc build/typecheck).

`CreateOrderDto` validate các trường mới; `toOrderItemResponse` trả nguyên lựa chọn từ snapshot, không phụ thu. Đây là contract cho orders controller/service chưa triển khai; khi tích hợp, lưu bằng `value ?? null` để giữ 0 và tổng hợp tồn kho theo variant qua các dòng khác tùy chọn. Xem [API spec](../../Khang-A2/docs/architecture/api-spec.md).

## Ghi chú của OrderItem

`OrderItem.note String? @db.VarChar(500)` lưu ghi chú cho từng dòng. Migration `20261010100000_order_item_note` thêm cột nullable, giữ đơn cũ với null. DTO trim đầu/cuối, rỗng thành null, validate chuỗi tối đa 500 ký tự; mapper trả nguyên note đã lưu. Chỉ gộp dòng khi cùng ghi chú đã chuẩn hóa; không đổi giá. Áp dụng bằng `npm run prisma:deploy` rồi generate/build như trên.

## Migration smoke từ database sạch

Tạo **database test mới, rỗng** có tên bắt đầu bằng `brewlite_foundation_smoke_test`, rồi chạy:

```powershell
$env:SMOKE_DATABASE_URL = 'postgresql://brewlite:change_me_local_only@localhost:5432/brewlite_foundation_smoke_test?schema=public'
npm run test:migration
```

Script không đọc `.env`, không reset/drop database và từ chối DB không rỗng. Nó validate/generate, migrate deploy hai lần, kiểm tra migration status và chạy integration tests với Prisma thật. Dữ liệu fixture chỉ nằm trong DB test này. Lần chạy mới cần DB test rỗng khác.

Integration kiểm tra CHECK, FK, partial unique payment/loyalty và rollback; chưa chứng minh implementation Task 10 (state machine, payment idempotency service, inventory concurrency), vốn thuộc các Sprint sau.

`test/s1.integration-spec.ts` bổ sung kiểm tra HTTP qua AppModule với PostgreSQL thật: Register → Login → JWT/profile, hash/response an toàn, whitelist, credential lỗi và Menu đọc giá từ DB. Bộ này chạy cùng `test:migration`/`test:integration` và chỉ ghi fixture vào `SMOKE_DATABASE_URL` đã được kiểm tra tên.

## Hợp đồng Orders tuần 2

S1-10/SD-10 được bàn giao tại [Orders contract](../../Khang-A2/docs/architecture/orders-contract.md), [UC-06](../../Khang-A2/docs/use-cases/UC-06-tao-don-hang.md), [OpenAPI](../../docs/api/orders.openapi.yaml) và [mã PlantUML riêng](../../Khang-A2/docs/architecture/diagrams/SD-10-create-order.puml). DTO request/response chuẩn bị cho S2-W3; `POST /orders` chưa được đăng ký. `couponCode` được trim, giữ nguyên hoa/thường và từ chối chuỗi trắng.



## VNPay gateway (opt-in)

MockGateway remains the default local/CI provider. VNPay is disabled unless a merchant explicitly enables it with real credentials and public HTTPS endpoints. Do not commit merchant secrets.

Environment variables:
- VNPAY_ENABLED=true
- VNPAY_TMN_CODE=8-character-merchant-code
- VNPAY_HASH_SECRET=merchant-hash-secret
- VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
- VNPAY_QUERY_URL=https://sandbox.vnpayment.vn/merchant_webapi/api/transaction (QueryDr; official sandbox endpoint by default)
- VNPAY_RETURN_URL=https://api.example.com/api/v1/payments/vnpay/return
- VNPAY_IPN_URL=https://api.example.com/api/v1/payments/vnpay/ipn
- WEB_ORIGIN=https://brew.example

- POST /api/v1/payments with method VNPAY stores a PROCESSING Payment, a unique merchant reference and signed payment URL before returning the redirect URL.
- Replaying the same Idempotency-Key returns the persisted URL; it does not create a second merchant transaction.
- GET /api/v1/payments/status includes the saved payment URL for the authenticated Order owner.
- GET /api/v1/payments/vnpay/ipn is the only settlement path. It validates HMAC-SHA512, merchant code, exact amount and processes Payment/Order transition in one transaction.
- GET /api/v1/payments/vnpay/return redirects to Checkout only. Browser Return parameters never settle Payment.
- Enable the frontend option at build time with NEXT_PUBLIC_VNPAY_ENABLED=true.
- When API is behind a reverse proxy, configure `TRUSTED_PROXY_CIDRS` with only the exact ingress proxy IP/CIDRs so VNPay receives the client IP rather than the proxy address; never enable blanket proxy trust.
- A real Sandbox merchant transaction, registered HTTPS IPN URL and gateway inquiry/reconciliation process still require separate acceptance. Code tests do not prove a live merchant transaction.


## Payment PROCESSING reconciliation (Issue #41)

### Architecture and safety rules

- QueryDr is an operator-triggered, single-Payment operation (bounded batch size: 1) with an 8-second provider timeout.
- Recovery uses an `Idempotency-Key` scoped to the Payment. The provider request ID is committed before QueryDr is called; replaying the same recovery key never creates another inquiry.
- QueryDr runs outside the database transaction. Settlement then locks the Order, re-reads Payment and Order, and commits Payment + Order + inventory/loyalty + coupon consumption + audit atomically.
- Provider timeout, transport failure, malformed/unsigned response, amount/merchant mismatch, and unknown/pending outcomes never set Payment to FAILED. They keep Payment PROCESSING.
- Late success or provider outcomes requiring investigation move Payment to MANUAL_REVIEW. Expiry and cancellation retain coupon/inventory reservations while Payment is PROCESSING or MANUAL_REVIEW.
- PostgreSQL trigger rejects UPDATE and DELETE on the recovery audit table. HashSecret and signed request/response payloads are never persisted in audit.

### Provisioning an operator

Public registration always assigns CUSTOMER. Never add a role field to registration or trust a role sent by a client. A trusted database administrator must promote an existing, separately verified account:

```sql
UPDATE "users"
SET "role" = 'PAYMENT_OPERATOR'
WHERE "username" = '<approved-operator-account>';
```

The operator must sign in again to receive a JWT containing the provisioned role. Remove the role with a controlled DBA action when access is revoked.

### Recovery API

```http
POST /api/v1/payments/{paymentId}/recovery
Authorization: Bearer <operator-jwt>
Idempotency-Key: <unique-recovery-key>
X-Correlation-Id: <optional-correlation-id>
Content-Type: application/json

{ "incidentReference": "INC-2026-1042" }
```

The request is restricted to PAYMENT_OPERATOR. The server requires `VNPAY_QUERY_SERVER_IP` to be the trusted fixed egress IP configured by infrastructure; it must not come from a browser request. The API processes one Payment per call, serializes concurrent inquiries for one Payment, uses a durable lease and exponential backoff (30 seconds, doubling up to 15 minutes), and opens a process-local circuit breaker after five consecutive inquiry failures.

### Operator runbook

1. Open an incident/ticket before invoking recovery. Capture Payment ID, Order ID/number, VNPay transaction reference, amount, transaction creation timestamp, last IPN evidence and correlation ID. Never collect or paste HashSecret into the ticket or logs.
2. Verify the operator account has PAYMENT_OPERATOR through the approved DBA access procedure. Customer and Barista accounts must receive HTTP 403.
3. Call the recovery endpoint once with a new idempotency key and incident reference. A retry with the same key is a replay, not a new inquiry.
4. If the result is PROCESSING/UNKNOWN, do not retry immediately and do not create a new payment attempt. Observe the backoff/circuit-breaker response and escalate to payment operations.
5. If Payment becomes MANUAL_REVIEW, keep Order assets reserved. A second operator must review provider evidence and decide refund/reversal/compensation through the approved merchant process. This API deliberately does not issue refunds automatically.
6. Close the incident only after provider evidence, Payment/Order consistency, coupon/inventory/loyalty state and immutable audit entries have been independently checked.

### Explicitly deferred

This delivery does not provide a scheduled worker, automatic refund adapter, or merchant Sandbox acceptance. QueryDr recovery is operator-triggered and one Payment at a time. The circuit breaker is process-local; multi-replica circuit coordination remains a follow-up. Merchant Sandbox evidence is deferred by project decision and is not reported as passed.

# Thiết kế cơ sở dữ liệu BrewLite

## 1. Công nghệ và nguyên tắc

- PostgreSQL là nguồn sự thật duy nhất cho dữ liệu giao dịch.
- Prisma quản lý schema, migration và transaction.
- Tiền lưu bằng `BIGINT` theo VND; không dùng `float`/`double`.
- Thời gian dùng `timestamptz`, UTC.
- UUID làm khóa chính; mã hiển thị như `order_number` có unique constraint riêng.
- Xóa cứng chỉ áp dụng cho dữ liệu test. Product/topping/user dùng `is_active` để vô hiệu hóa.
- Bảng giao dịch và lịch sử không cascade delete trong production.

ERD đầy đủ nằm tại [erd.md](./erd.md), đặc tả trường tại [entities.md](./entities.md).

## 2. Danh sách bảng

| Nhóm | Bảng |
|---|---|
| Identity | `users` |
| Catalog | `products`, `product_variants`, `toppings`, `product_toppings` |
| Order | `orders`, `order_items`, `order_item_toppings`, `order_status_histories` |
| Payment | `payments` |
| Inventory | `inventory_reservations` |
| Promotion | `coupons`, `coupon_redemptions` |
| Loyalty | `loyalty_transactions` |

## 3. Ràng buộc dữ liệu bắt buộc

### Unique

- `users.username`.
- `products.sku`, `toppings.code`, `coupons.code`, `orders.order_number`.
- `product_variants(product_id, size)`.
- `product_toppings(product_id, topping_id)`.
- `payments.idempotency_key`.
- `payments.gateway_transaction_id` khi khác null.
- `coupon_redemptions.order_id`.
- `inventory_reservations(order_id, product_variant_id)`.

Partial unique index cần migration SQL thủ công:

```sql
CREATE UNIQUE INDEX uq_one_successful_payment_per_order
ON payments (order_id)
WHERE status = 'SUCCEEDED';

CREATE UNIQUE INDEX uq_loyalty_earn_per_order
ON loyalty_transactions (order_id, type)
WHERE order_id IS NOT NULL AND type = 'EARN';
```

### Check

```sql
CHECK (stock >= 0)
CHECK (quantity > 0)
CHECK (sugar_level IS NULL OR sugar_level BETWEEN 0 AND 100)
CHECK (ice_level IS NULL OR ice_level BETWEEN 0 AND 100)
CHECK (price >= 0)
CHECK (subtotal >= 0 AND discount_amount >= 0 AND total >= 0)
CHECK (discount_amount <= subtotal)
CHECK (total = subtotal - discount_amount)
CHECK (starts_at < ends_at)
```

Tổng từng dòng order được tính ở Service từ snapshot giá và quantity; ERD không lưu `line_total` nên không có check constraint cho cột này.

`order_items.sugar_level` và `ice_level` là `INTEGER NULL`, không có default. Migration `20261010090000_order_item_sugar_ice_levels` thêm cột và CHECK, giữ dữ liệu cũ với hai giá trị null; không sửa migration đã áp dụng và không backfill thành 100. Null dùng công thức chuẩn; 0 là lựa chọn không đường/đá. DTO kiểm tra số nguyên trước transaction, DB bảo vệ khoảng 0..100. Các mức này không ảnh hưởng tính tiền.

### Foreign key và hành vi xóa

| Quan hệ | On delete |
|---|---|
| Product -> ProductVariant/ProductTopping | `RESTRICT`; dùng `is_active` |
| Order -> OrderItem/StatusHistory/Reservation | `RESTRICT` trong production |
| OrderItem -> OrderItemTopping | `RESTRICT` |
| User -> Order/Payment-related ledger | `RESTRICT` |
| Coupon -> Redemption | `RESTRICT` |

Không dùng cascade từ User/Product vào dữ liệu lịch sử vì sẽ phá audit. Nếu cần xóa dữ liệu cá nhân, ẩn danh hóa trường nhận diện thay vì xóa giao dịch.

## 4. Index phục vụ truy vấn

| Index | Truy vấn phục vụ |
|---|---|
| `products(is_active, created_at)` | Danh sách menu |
| `product_variants(product_id, is_active)` | Chi tiết sản phẩm |
| `orders(user_id, created_at DESC)` | `GET /orders/me` |
| `orders(status, created_at)` | Hàng đợi barista |
| `payments(order_id, created_at DESC)` | Lịch sử attempt theo order |
| `order_status_histories(order_id, created_at)` | Timeline trạng thái |
| `inventory_reservations(status, expires_at)` | Job giải phóng reservation hết hạn |
| `coupon_redemptions(coupon_id, user_id, status)` | Kiểm tra giới hạn coupon/user chỉ trên `RESERVED`/`CONSUMED` |
| `coupon_redemptions(status, expires_at)` | Giải phóng lượt coupon của order hết hạn |
| `loyalty_transactions(user_id, created_at DESC)` | Lịch sử điểm |

Không tạo index dư thừa trên cột ít phân biệt như boolean đơn lẻ. Dùng `EXPLAIN ANALYZE` để xác nhận trước khi bổ sung.

## 5. Transaction tạo đơn

Migration `20261010100000_order_item_note` thêm `order_items.note VARCHAR(500) NULL`, không default; đơn cũ nhận null. DTO kiểm tra chuỗi tối đa 500 ký tự sau trim, chuỗi trắng được chuẩn hóa thành null. Snapshot ghi chú cùng item, không đổi giá. Chỉ gộp dòng khi cùng cả note đã chuẩn hóa, nhưng reservation vẫn cộng quantity theo variant.

Transaction cần ngắn và không gọi HTTP bên ngoài:

```text
BEGIN
  đọc product/variant/topping active
  validate đường/đá 0..100; chuẩn hóa thiếu thành null, giữ 0
  tính snapshot giá, subtotal, coupon, total
  kiểm tra giới hạn coupon và INSERT coupon_redemption(status=RESERVED) nếu có
  với từng variant:
    UPDATE product_variants
      SET stock = stock - qty, version = version + 1
      WHERE id = :id AND version = :expected_version AND stock >= :qty
    nếu row_count = 0: conflict/hết hàng
  INSERT order + items + item_toppings
  lưu sugar_level/ice_level cho từng item, cùng snapshot giá
  lưu note đã trim (rỗng/thiếu thành null) cùng item
  INSERT inventory_reservations(status=ACTIVE)
  INSERT order_status_history(NULL -> PENDING)
COMMIT
```

Nếu câu lệnh trừ tồn không cập nhật được dòng nào, Service trả `409 OUT_OF_STOCK` kèm variant bị thiếu. Chỉ retry transaction khi PostgreSQL trả lỗi serialization/deadlock có thể retry an toàn.

Thứ tự lock/update variant luôn theo `product_variant_id` tăng dần để giảm deadlock khi nhiều đơn chứa cùng tập sản phẩm. Nếu version đã đổi, đọc lại và retry có giới hạn khi còn stock; nếu hết stock thì trả 409. Stock/version phải được cập nhật cùng nhau.

Dòng cùng variant nhưng khác đường/đá được lưu riêng. Khi giữ/trừ tồn, tổng hợp quantity theo `product_variant_id` qua tất cả dòng để đáp ứng unique reservation `(order_id, product_variant_id)`.

## 6. Transaction hoàn tồn kho

Hàm release phải idempotent:

```text
UPDATE inventory_reservations
SET status = RELEASED
WHERE id = :id AND status = ACTIVE

nếu row_count = 1:
  UPDATE product_variants
  SET stock = stock + reservation.quantity, version = version + 1
```

Hai update nằm trong cùng transaction. Nếu reservation đã `RELEASED`, `EXPIRED` hoặc `CONSUMED`, không cộng stock lần nữa.

Job định kỳ tìm `ACTIVE AND expires_at < now()`, khóa bằng `FOR UPDATE SKIP LOCKED` (hoặc claim theo batch) rồi chuyển `EXPIRED` và hoàn tồn. Trong MVP có thể chạy cron của NestJS; nhiều instance vẫn an toàn nhờ điều kiện trạng thái.

Với PAID → CANCELLED trước nhận pha, cùng transaction khóa/compare-and-set order: chuyển inventory reservation từ CONSUMED sang RELEASED bằng điều kiện `WHERE status = CONSUMED`, rồi hoàn stock/tăng version chỉ khi transition reservation cập nhật được một dòng. Giữ payment SUCCEEDED, coupon CONSUMED và loyalty EARN; không hoàn tiền giả lập. Chỉ chủ đơn được gọi nhánh này, job hết hạn không hủy PAID.

Cùng transaction hủy/hết hạn order chưa thanh toán, nếu có `coupon_redemption` đang `RESERVED` thì chuyển sang `RELEASED` hoặc `EXPIRED`. Việc đổi trạng thái phải có điều kiện `WHERE status = RESERVED` để retry không giải phóng hai lần.

## 7. Transaction hoàn tất thanh toán

Không giữ transaction khi gọi mock gateway. Sau khi nhận kết quả:

```text
BEGIN
  đọc payment theo idempotency key và order hiện tại
  nếu payment đã kết thúc: trả kết quả cũ
  nếu thành công:
    payment -> SUCCEEDED
    order PENDING -> PAID
    reservation ACTIVE -> CONSUMED
    coupon_redemption RESERVED -> CONSUMED (nếu có)
    ghi status history
    ghi loyalty EARN nếu chưa tồn tại
    cập nhật users.loyalty_balance
  nếu thất bại:
    payment -> FAILED
    order PENDING -> PAYMENT_FAILED
    giữ coupon_redemption ở RESERVED trong thời hạn retry
    ghi status history
COMMIT
```

Unique constraints là lớp bảo vệ cuối cho một payment thành công và một lần cộng điểm trên mỗi order.

## 8. Idempotency-Key

- Key do client sinh UUID, gửi ở header `Idempotency-Key`.
- `request_hash = SHA-256(canonical JSON của orderId + method + amount)`.
- Insert payment dùng unique key. Nếu conflict, đọc payment đã tồn tại.
- Cùng key/cùng hash: trả lại cùng HTTP body/status nghiệp vụ.
- Cùng key/khác hash: `409 IDEMPOTENCY_KEY_REUSED`.
- Không xóa payment/idempotency record trong thời gian tồn tại order. Với hệ thống thật có thể đặt retention tối thiểu theo chính sách đối soát.

## 9. Sinh order number

PK vẫn là UUID. `order_number` chỉ dùng hiển thị, ví dụ `BL-20260923-AB12CD`. Backend sinh chuỗi khó đoán vừa đủ và dựa vào unique constraint để retry khi va chạm. Không dùng `COUNT(*) + 1` vì race condition.

## 10. Migration và seed

1. Mỗi thay đổi schema phải đi qua Prisma migration được commit.
2. Không sửa migration đã chạy trên môi trường chung; tạo migration bù.
3. Seed phải chạy lặp an toàn bằng upsert theo `username`, `sku`, `code`.
4. Seed tối thiểu: user demo, 4 sản phẩm, đủ size S/M/L, topping, một coupon còn hạn.
5. CI chạy database tạm, migrate từ rỗng, seed và integration test.
6. Trước thay đổi phá vỡ, có backup/rollback plan; migration expand-contract khi cần tương thích nhiều phiên bản.

Migration `20261009110000_customer_barista_roles` đồng bộ role tài khoản với SD-01: chỉ `CUSTOMER` và `BARISTA`. Migration cũ được giữ nguyên lịch sử; migration mới tái tạo PostgreSQL enum và giữ default CUSTOMER. Nếu database cũ có tài khoản thuộc role đã bỏ, migration dừng trước khi đổi enum để nhóm phân loại tài khoản, không tự gán quyền thay người dùng.

Migration `20261009090000_foundation_constraints` hiện thực các CHECK và partial unique index nêu ở mục 3, cùng cột `version` mặc định 0. Không sửa migration `20260925100913_init`. Nếu database hiện có dữ liệu vi phạm invariant, migration phải fail để nhóm xử lý dữ liệu trước; không tự xóa/sửa dữ liệu. `npm run test:migration` kiểm tra database test rỗng, migrate, replay và các invariant trên PostgreSQL thật. Seed Catalog là việc của Hoàng trong S1-03.

## 11. Phân trang và hiệu năng

- `GET /products`: offset pagination đủ cho dữ liệu mẫu; có `limit` tối đa.
- `GET /orders/me`: ưu tiên cursor `(created_at, id)` để ổn định khi có đơn mới.
- Chỉ select trường cần thiết; include item/topping theo trang, tránh N+1.
- Response danh sách không trả password hash, request hash, chi tiết gateway hoặc audit nội bộ.
- NFR `< 500ms` được đo ở p95 trên dữ liệu seed xác định; không chỉ dựa vào thời gian thủ công.

## 12. Rủi ro mô hình và hướng nâng cấp

- `users.loyalty_balance` là dữ liệu dẫn xuất có thể lệch ledger: thêm job đối soát tổng ledger định kỳ.
- Stock theo variant chưa phản ánh nguyên liệu dùng chung: khi mở rộng, thêm `ingredients`, `recipes`, `inventory_balances` và reservation theo ingredient.
- Một cửa hàng duy nhất: khi đa chi nhánh, mọi balance/reservation phải có `store_id` và unique key tương ứng.
- Mock payment không có webhook: cổng thật cần bảng event/webhook idempotent và trạng thái `PENDING/UNKNOWN` chi tiết hơn.

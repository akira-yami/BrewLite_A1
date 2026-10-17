# S1-10 — Hợp đồng tạo đơn và giữ tồn (SD-10)

Owner: Dev Khang. Reviewer thiết kế được phân công: Dev Hoàng. Ngày: 17/10/2026.

Trạng thái: đã chuẩn bị để review. Chưa có bằng chứng Hoàng approve. Đây là đầu ra thiết kế tuần 2; controller/service `POST /orders` sẽ triển khai ở S2-W3.

Nguồn phân công: [thẻ Khang S1-W2](https://trello.com/c/FsqrauPC), workbook `BrewLite_PhanCong_Scrum.xlsx`, `SprintBacklog!A15:O15` (S1-10) và `SoDo!A15:J15` (SD-10).

## 1. Phạm vi và tài liệu bàn giao

- [UC-06 — Tạo đơn hàng](../use-cases/UC-06-tao-don-hang.md).
- [Mã PlantUML SD-10](./diagrams/SD-10-create-order.puml). Sơ đồ nằm trong tệp riêng để render và sửa độc lập.
- [OpenAPI của POST /orders](../api/orders.openapi.yaml).
- DTO request: `apps/api/src/modules/orders/dto/create-order.dto.ts`.
- DTO response: `apps/api/src/modules/orders/dto/create-order-response.dto.ts` và `order-item-response.dto.ts`.
- Mapper snapshot hiện có: `apps/api/src/modules/orders/mappers/order-item.mapper.ts`.

Endpoint đích: `POST /api/v1/orders`, JSON, Bearer JWT, role `CUSTOMER`. `userId` lấy từ principal đã xác thực. Barista bị từ chối với 403. API tạo đơn chưa được đăng ký trong `AppModule` ở tuần 2.

## 2. Request và chuẩn hóa

| Trường | Hợp đồng |
|---|---|
| `items` | Mảng bắt buộc, 1..20 dòng đầu vào |
| `items[].productVariantId` | UUID bắt buộc; tìm đúng product/variant đang active |
| `items[].quantity` | Số nguyên 1..20, không ép chuỗi thành số |
| `items[].toppingIds` | Mảng UUID không lặp; thiếu/null dùng tập rỗng; chỉ topping active liên kết với product |
| `items[].sugarLevel`, `iceLevel` | Số nguyên 0..100 hoặc null; thiếu thành null, giữ nguyên 0 |
| `items[].note` | Chuỗi hoặc null; trim hai đầu, rỗng/thiếu thành null; tối đa 500 ký tự sau trim |
| `couponCode` | Chuỗi tùy chọn hoặc null; trim hai đầu, giữ nguyên hoa/thường; nếu có chuỗi thì dài 1..50 sau trim |

`ValidationPipe` dùng `transform`, `whitelist`, `forbidNonWhitelisted`. Không nhận `userId`, status, giá hoặc tổng tiền ở bất kỳ cấp request nào. DTO chỉ kiểm tra hình dạng; kiểm tra tồn tại, active, quan hệ topping và giới hạn sau gộp thuộc Service trong transaction.

Gộp dòng theo `(variantId, tập topping đã sắp xếp, sugarLevel, iceLevel, note đã chuẩn hóa)`. `null` khác `100`, ghi chú khác nhau giữ dòng riêng. ID được so sánh theo UUID chuẩn hóa; topping trùng UUID sau chuẩn hóa bị từ chối. Quantity sau gộp vẫn phải 1..20. Giữ thứ tự lần xuất hiện đầu tiên của dòng; thứ tự topping trong request không thay đổi kết quả gộp.

Giữ tồn theo tổng quantity của **mọi dòng cùng variant**, kể cả khác topping/đường/đá/ghi chú. Ví dụ 2 ly không đá và 1 ly công thức chuẩn cùng variant: hai `OrderItem`, một `InventoryReservation(quantity=3)`.

DTO hiện giữ được null ở các trường tùy chọn. Bước Service chuẩn hóa missing/null thành dữ liệu snapshot cuối cùng; không dùng `value || default` cho đường/đá.

## 3. Giá và snapshot

Backend đọc giá thật từ catalog, tính bằng `bigint` VND:

```text
lineTotal = (variant.price + SUM(topping.price)) * quantity
subtotal = SUM(lineTotal)
percentageDiscount = FLOOR(subtotal * discountValue / 100)
discountAmount = MIN(subtotal, fixedOrPercentageDiscount, maxDiscount nếu có)
total = subtotal - discountAmount
```

Mỗi topping được chọn có quantity 1 cho một ly; nhân quantity của dòng khi tính tiền. Không có phụ phí cho đường, đá, ghi chú. `maxDiscount` là trần áp dụng cho coupon phần trăm; coupon cố định lấy `MIN(subtotal, discountValue)`.

Snapshot lưu tên product, size, giá variant, tên/giá/quantity topping, đường/đá và ghi chú. `Order` lưu subtotal, discountAmount, total và couponCodeSnapshot. Sau khi tạo, thay đổi catalog không làm đổi đơn cũ. `lineTotal` được mapper tính từ snapshot; `currency = VND` là giá trị API, không thêm cột DB.

Response trả tiền dưới dạng JSON integer sau khi kiểm tra chuyển đổi nằm trong miền số nguyên an toàn của JavaScript. Không trả BigInt trực tiếp, password hash, request hash hay dữ liệu nội bộ của gateway.

## 4. Một transaction cho toàn bộ tạo đơn

OrdersService điều phối một Prisma interactive transaction, isolation `Serializable`. Các public Service/Repository tham gia phải dùng **cùng `tx: Prisma.TransactionClient`**, không tự mở transaction hoặc dùng client global thay thế.

1. Guard xác thực và kiểm tra role trước transaction; DTO validation/trim và kiểm tra quantity sau gộp trước khi ghi dữ liệu.
2. Bắt đầu transaction; chụp `now`, sinh UUID/orderNumber, đặt `reservationExpiresAt = now + 15 phút`.
3. `CatalogService` đọc product/variant/topping active và giá trong transaction; xác minh topping thuộc product. `UsersService` xác minh principal còn active.
4. Nếu có coupon: `PromotionsService` khóa hàng coupon trước khi đọc lượt dùng; kiểm tra active, `startsAt <= now < endsAt`, `subtotal >= minOrderValue`, giới hạn toàn cục và theo user. Tính cả `CONSUMED` và `RESERVED` chưa hết hạn. Mọi đường reserve/consume/release coupon phải tuân cùng quy ước khóa; lỗi serialization phải rollback/retry toàn transaction.
5. Tính giá và snapshot trên server, kiểm tra mọi giá/tổng tiền có thể chuyển thành JSON integer an toàn trước khi ghi; tạo `Order(PENDING)`, items và item toppings. **Phải tạo Order trước redemption/reservation/history** vì các bản ghi này có foreign key tới order.
6. Với coupon hợp lệ, tạo `CouponRedemption(RESERVED)` gắn order đã tồn tại, cùng expiresAt; snapshot mức giảm vào order. Lượt reserved giữ mức giảm đã chốt đến khi order hết hạn.
7. `InventoryService.reserve(tx, ...)` cộng số lượng theo variant rồi xử lý variant theo UUID tăng dần. Qua public `CatalogService`, cập nhật nguyên tử `WHERE id = id AND version = expectedVersion AND stock >= quantity AND is_active = true`, trừ stock và tăng version cùng lệnh. Tạo đúng một reservation `ACTIVE` cho mỗi `(orderId, variantId)`.
8. Ghi `OrderStatusHistory(fromStatus=null, toStatus=PENDING, changedByUserId=principal.id)`. Không gọi gateway, tạo Payment hoặc cộng loyalty trong transaction này.
9. Commit. Chỉ sau commit mới map snapshot và trả `201 { data, meta: { requestId } }` cùng `X-Request-Id`.

Bất kỳ lỗi nào sau bước 2 đều rollback **order, item/topping, redemption, reservation, history, stock và version**. Không dùng transaction con độc lập. Không gửi email/HTTP/gateway trong transaction.

Nếu stock update không khớp, rollback rồi đọc lại trong một transaction mới: thiếu stock trả `OUT_OF_STOCK`; version thay đổi nhưng vẫn đủ hàng thì retry. Serialization/deadlock (`40001`, `40P01` / Prisma `P2034`) cũng retry toàn transaction. Tối đa **3 lần thử tổng cộng**, backoff ngắn có jitter; hết lượt trả `409 INVENTORY_CONFLICT`. Không retry validation, unauthorized, invalid option hoặc coupon không hợp lệ. Va chạm orderNumber unique cũng rollback và sinh mã mới trong giới hạn này.

`stock` là lượng có thể bán sau khi trừ giữ chỗ. Thanh toán chuyển reservation `ACTIVE -> CONSUMED`, **không trừ stock lần hai**. Hủy/hết hạn giải phóng qua InventoryService đúng một lần theo [database-design](./database-design.md) và [SD-04](./order-state-machine.md).

## 5. Ranh giới module và các cổng cần ở S2

Các chữ ký dưới đây là thiết kế để owner triển khai, chưa phải Service runtime đã tồn tại:

| Public Service | Trách nhiệm trong cùng transaction |
|---|---|
| `OrdersService.createOrder(userId, dto)` | Sở hữu transaction/retry, gộp dòng, tổng tiền, snapshot, order/history và response |
| `UsersService.assertActive(tx, userId)` | Đọc trạng thái tài khoản; không tin userId trong body |
| `CatalogService.quoteItems(tx, normalizedItems)` | Kiểm tra product/variant/topping, trả tên/giá/version cho snapshot |
| `CatalogService.reserveVariants(tx, needs)` | Sở hữu cập nhật stock/version của bảng product_variants; chỉ gọi từ InventoryService |
| `InventoryService.reserve(tx, orderId, needs, expiresAt)` | Tổng quantity theo variant, gọi CatalogService, tạo reservation |
| `PromotionsService.quoteAndLock(tx, userId, code, subtotal, now)` | Khóa coupon, kiểm tra giới hạn, tính mức giảm |
| `PromotionsService.reserve(tx, quote, orderId, expiresAt)` | Tạo redemption sau Order; không mở transaction riêng |

Orders không import Repository của module khác. Inventory không gọi ngược Orders; Promotions không phụ thuộc Orders. Payments gọi Orders khi chuyển trạng thái ở S2; `POST /orders` không gọi Payments/Loyalty. Các cổng này giữ [dependency map](./dependency-map.md) hiện có.

## 6. Response và lỗi

Response `201` chứa `id`, `orderNumber`, `status=PENDING`, items snapshot, subtotal, discountAmount, total, currency, reservationExpiresAt, createdAt. Xem ví dụ/JSON schema đầy đủ tại [OpenAPI](../api/orders.openapi.yaml). Request ID là correlation ID, không phải idempotency key.

| HTTP | `error.code` | Điều kiện | Dữ liệu sau lỗi |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Sai kiểu/UUID/quantity/đường đá/note/coupon; field do server sở hữu; sau gộp >20 ly/dòng | Không ghi |
| 400 | `INVALID_OPTION` | Variant/product/topping thiếu, inactive hoặc topping không thuộc product | Rollback nếu đã mở tx |
| 401 | `UNAUTHORIZED` | JWT thiếu, sai, hết hạn hoặc principal không còn hợp lệ | Không ghi |
| 403 | `FORBIDDEN_RESOURCE` | Đăng nhập hợp lệ nhưng role khác CUSTOMER | Không ghi |
| 409 | `OUT_OF_STOCK` | Tổng quantity theo variant vượt stock | Rollback toàn bộ |
| 409 | `INVENTORY_CONFLICT` | Hết giới hạn retry do cạnh tranh dữ liệu | Rollback toàn bộ |
| 422 | `COUPON_NOT_APPLICABLE` | Coupon thiếu/không active/hết hạn/chưa đủ điều kiện/hết lượt | Rollback toàn bộ |
| 500 | `INTERNAL_ERROR` | Lỗi lưu trữ không dự kiến | Rollback, log theo requestId; không lộ SQL/credentials |

Error envelope: `{ error: { code, message, details?, requestId } }`. Với lỗi stock, details chỉ rõ `variantId` và `available`; không tiết lộ order/user khác. Common error filter và request-id middleware là yêu cầu khi wiring Orders ở S2; scaffold hiện chưa áp envelope này cho mọi API.

`POST /orders` **chưa có idempotency contract**. Không tự retry từ FE khi timeout hoặc mất kết nối sau commit; cần đối chiếu lịch sử đơn trước khi người dùng tạo lại. `Idempotency-Key` của Payments không bảo vệ endpoint tạo đơn.

## 7. Điều kiện review và kiểm chứng

Đã có test DTO cho giới hạn số dòng/số lượng, UUID, topping lặp, field giả mạo, note, đường/đá và coupon trắng. Test mapper kiểm tra snapshot, giá và JSON. Migration/integration S1 kiểm tra khóa ngoại, CHECK, unique payment/loyalty, rollback, seed chạy lặp.

Các ca sau phải được kiểm thử với Orders/Inventory thật ở S2, chưa được coi là đã pass bằng bản thiết kế:

- Tạo đơn có/không coupon; nhiều dòng cùng variant và khác tùy chọn; tổng tiền từ DB khớp response.
- Gây lỗi sau reserve variant đầu tiên hoặc sau redemption: không để lại order/stock/version/lượt coupon dở dang.
- Hai request cạnh tranh ly cuối; retry version có giới hạn; stock không âm.
- Hai request tranh lượt coupon cuối; chỉ một đơn giữ lượt thành công.
- Đổi giá/tên catalog sau tạo đơn; lịch sử vẫn trả snapshot cũ.
- JWT/role/ownership, response/error envelope, header request ID, checkout thật gọi API.

Hoàng cần review transaction, public Service của Inventory/Catalog, coupon locking và các nhánh SD-10. Approval/PR của reviewer khác owner được ghi bằng link thật sau khi có; bản này không tự xác nhận approval.

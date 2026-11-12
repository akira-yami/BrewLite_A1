# Tầng Order (Orders Module) — Tri thức & Luồng hoạt động

> Tài liệu tổng hợp để hiểu sâu tầng xử lý đơn hàng của BrewLite: kiến trúc, mô hình
> dữ liệu, máy trạng thái, luồng runtime end-to-end, các tích hợp liên module và
> **thứ tự file cần đọc theo ưu tiên**.
>
> Phạm vi code: `apps/api/src/modules/orders` (NestJS + Prisma + PostgreSQL).
> Tiền tệ lưu bằng `BigInt` (đơn vị VND). Prisma client sinh tại `apps/api/src/generated/prisma/client.js`.
>
> **Cập nhật: 12/11/2026.** Đối chiếu với mã nguồn hiện tại trong `apps/api/src/modules/orders`.

---

## 0. Đọc nhanh (TL;DR)

- Order là một **máy trạng thái hữu hạn** với 7 trạng thái; mọi lần ghi trạng thái đều
  phải đi qua một cổng duy nhất `assertTransition()` nên không có đường vòng.
- `createOrder` chạy trong **transaction Serializable + retry 3 lần**, định giá **từ DB**
  (không tin giá client), giữ tồn kho (reservation) và khóa coupon trong cùng transaction.
- Giá/tên món được lưu dưới dạng **snapshot bất biến** trên `OrderItem` — catalog đổi giá
  sau này không làm thay đổi đơn cũ.
- Thanh toán (PaymentsService), tồn kho (InventoryService), khuyến mãi/điểm thưởng
  (PromotionsService) đều được orchestrate từ `OrdersService` bằng cách gọi chéo service
  bên trong transaction.
- Đơn không thanh toán trước hạn `reservationExpiresAt` sẽ bị **cron expiry** (chạy mỗi phút)
  hủy tự động, giải phóng coupon (EXPIRED) và hoàn kho.

---

## 1. Thứ tự file cần đọc để hiểu sâu luồng (ưu tiên từ trên xuống)

| # | File | Vì sao đọc / Nội dung chính |
|---|------|------------------------------|
| 1 | `apps/api/src/modules/orders/state/order-state-machine.ts` | **Từ vựng & vòng đời.** Bảng chuyển trạng thái `ORDER_TRANSITIONS`, `assertTransition`, tập trạng thái barista/hàng đợi. Đọc đầu tiên để nắm "ngôn ngữ" của cả module. |
| 2 | `apps/api/prisma/schema.prisma` | **Mô hình dữ liệu.** Các model `Order`, `OrderItem`, `OrderItemTopping`, `OrderStatusHistory`, `Payment`, `InventoryReservation` + các enum (`OrderStatus`, `PaymentStatus`, `ReservationStatus`, `CouponRedemptionStatus`). |
| 3 | `apps/api/src/modules/orders/dto/create-order.dto.ts` | **Hợp đồng đầu vào.** Luật validate request tạo đơn (số lượng, UUID, sugar/ice, topping unique, couponCode). |
| 4 | `apps/api/src/modules/orders/dto/create-order-response.dto.ts`, `order-detail-response.dto.ts`, `order-item-response.dto.ts`, `order-history-query.dto.ts`, `staff-orders.dto.ts` | **Hợp đồng đầu ra.** Hình dạng dữ liệu trả về cho client & barista. |
| 5 | `apps/api/src/modules/orders/controllers/orders.controller.ts` | **Cửa vào của khách.** 4 endpoint `/orders` + guard JWT/Role. Bắt đầu luồng runtime. |
| 6 | `apps/api/src/modules/orders/controllers/staff-orders.controller.ts` | **Cửa vào của barista.** `/staff/orders` (hàng đợi + đổi trạng thái). |
| 7 | `apps/api/src/modules/orders/services/orders.service.ts` | **Trái tim module.** Đọc theo thứ tự: `createOrder` → `validateAndPriceItems` → nhóm method cổng thanh toán → `getStaffQueue`/`advanceOrderStatus` → `cancelOrder`. |
| 8 | `apps/api/src/modules/orders/repositories/orders.repository.ts` | **Truy cập DB & khóa dòng.** `lockById`/`...ForUpdate` (`SELECT … FOR UPDATE`), `updateStatusWithHistory` (CAS), `markAsPaid` (consume kho + tích điểm). |
| 9 | `apps/api/src/modules/orders/mappers/order-item.mapper.ts` | Map snapshot → DTO, tính `lineTotal`. |
| 10 | `apps/api/src/modules/orders/http/orders-http.ts` | Interceptor gắn `requestId` + ExceptionFilter chuẩn hóa envelope lỗi. |
| 11 | `apps/api/src/modules/orders/services/order-expiry.job.ts` | Cron hết hạn: hủy đơn quá hạn, giải phóng coupon/kho. |
| 12 | `apps/api/src/modules/orders/orders.module.ts` | Wiring: imports/providers/exports. |
| 13 | Liên module: `inventory/services/inventory.service.ts`, `promotions/services/promotions.service.ts`, `payments/services/payments.service.ts` | Hiểu phía bên kia của các lời gọi chéo. |
| 14 | Tests: `test/orders.integration-spec.ts`, `test/orders-inventory.integration-spec.ts`, `test/order-state-machine.integration-spec.ts`, và các `*.spec.ts` trong module | Tài liệu hóa hành vi kỳ vọng. |

---

## 2. Cấu trúc thư mục & vai trò

```
apps/api/src/modules/orders/
├── orders.module.ts                      # Wiring module NestJS
├── controllers/
│   ├── orders.controller.ts              # Endpoint CUSTOMER (/orders)
│   ├── orders.controller.spec.ts
│   ├── staff-orders.controller.ts        # Endpoint BARISTA (/staff/orders)
│   └── staff-orders.controller.spec.ts
├── services/
│   ├── orders.service.ts                 # Toàn bộ nghiệp vụ đơn hàng
│   ├── orders.service.spec.ts
│   ├── orders.service.staff.spec.ts      # Test hàng đợi/advance của barista
│   ├── order-retry.spec.ts               # Test retry khi xung đột Serializable
│   ├── order-expiry.job.ts               # Cron quét đơn hết hạn (@Cron mỗi phút)
│   └── order-expiry.job.spec.ts
├── repositories/
│   ├── orders.repository.ts              # Prisma read/write + khóa dòng
│   └── orders.repository.spec.ts
├── state/
│   ├── order-state-machine.ts            # Bảng chuyển + assertTransition()
│   └── order-state-machine.spec.ts
├── dto/
│   ├── create-order.dto.ts               # CreateOrderDto / CreateOrderItemDto
│   ├── create-order.dto.spec.ts
│   ├── create-order-response.dto.ts
│   ├── order-detail-response.dto.ts      # OrderDetail / PaymentSummary / StatusTimeline
│   ├── order-history-query.dto.ts        # Phân trang GET /orders/me
│   ├── order-item-response.dto.ts
│   └── staff-orders.dto.ts               # StaffOrdersQuery / UpdateOrderStatus / StaffOrderDto
├── mappers/
│   ├── order-item.mapper.ts              # toOrderItemResponse()
│   └── order-item.mapper.spec.ts
├── http/
│   ├── orders-http.ts                    # Interceptor + ExceptionFilter
│   └── orders-http.spec.ts
└── entities/.gitkeep                     # rỗng — model là Prisma schema, không có entity class
```

Lưu ý: `entities/` và các `.gitkeep` chỉ là placeholder — **không có entity class viết tay**,
nguồn sự thật của mô hình dữ liệu là Prisma schema.

---

## 3. Máy trạng thái đơn hàng (state machine)

File: `state/order-state-machine.ts`.

Enum `OrderStatus` (7 trạng thái): `PENDING`, `PAYMENT_FAILED`, `PAID`, `PREPARING`, `READY`,
`COMPLETED`, `CANCELLED`.

### Bảng chuyển hợp lệ (`ORDER_TRANSITIONS`) — đúng 9 mũi tên

```
PENDING        → PAID, PAYMENT_FAILED, CANCELLED
PAYMENT_FAILED → PENDING, CANCELLED
PAID           → PREPARING, CANCELLED
PREPARING      → READY
READY          → COMPLETED
COMPLETED      → (kết thúc)
CANCELLED      → (kết thúc)
```

### Sơ đồ vòng đời

```
start ──▶ PENDING ──thanh toán OK──▶ PAID ──barista nhận──▶ PREPARING ──pha xong──▶ READY ──giao khách──▶ COMPLETED
            │                          │
   thanh toán lỗi                      │
            ▼                          │
      PAYMENT_FAILED ──thử lại──▶ PENDING
            │                          │
            └──────── hủy ─────────────┴──────▶ CANCELLED   (từ PENDING / PAYMENT_FAILED / PAID)
```

- `COMPLETED` và `CANCELLED` là trạng thái **kết thúc** (không chuyển tiếp).
- `canTransition(from, to)`: tra cứu boolean.
- `assertTransition(from, to)`: nếu không hợp lệ ném `409 ConflictException` với
  `code: 'INVALID_ORDER_TRANSITION'`, `details: [{ from, to }]`.
- **Cổng duy nhất:** `assertTransition` được gọi trong `OrdersService.advanceOrderStatus`
  và bên trong `OrdersRepository.updateStatusWithHistory` / `markAsPaid`, nên **mọi** lần
  ghi trạng thái (thanh toán, thử lại, hết hạn, barista) đều phải đi qua — không có bypass.
- Hằng phụ trợ: `BARISTA_TARGET_STATUSES = [PREPARING, READY, COMPLETED]`,
  `STAFF_QUEUE_STATUSES = [PAID, PREPARING, READY]`, `BARISTA_TRANSITION_REASONS`
  (text lịch sử cho từng bước barista).

---

## 4. Mô hình dữ liệu (Prisma)

File: `apps/api/prisma/schema.prisma`.

- **`Order`** (`orders`): `id`, `orderNumber` (unique), `userId`, `status` (default `PENDING`),
  `subtotal`/`discountAmount`/`total` (BigInt), `couponCodeSnapshot?`, `reservationExpiresAt`,
  timestamps. Quan hệ: `user`, `items[]`, `payments[]`, `statusHistories[]`,
  `inventoryReservations[]`, `couponRedemption?` (1:1), `loyaltyTransactions[]`.
  Index: `(userId, createdAt desc)`, `(status, createdAt)`.
- **`OrderItem`** (`order_items`): snapshot `productNameSnapshot`, `variantNameSnapshot`,
  `unitPrice`, `quantity`, `sugarLevel?`, `iceLevel?`, `note?`; FK tới `Order` & `ProductVariant`;
  có `orderItemToppings[]`.
- **`OrderItemTopping`** (`order_item_toppings`): `toppingNameSnapshot`, `unitPrice`, `quantity`.
- **`OrderStatusHistory`** (`order_status_histories`): `fromStatus?`, `toStatus`,
  `changedByUserId?`, `reason?` — nhật ký kiểm toán mọi bước chuyển.
- **`Payment`** (`payments`): `idempotencyKey` (unique), `requestHash`, `method`
  (`E_WALLET`/`CARD`/`VNPAY`), `status` (default `PROCESSING`), `amount`,
  `gatewayTransactionId?`, `gatewayReference?`, `paymentUrl?`, `failureCode?`, `processedAt?`.
- **`InventoryReservation`** (`inventory_reservations`): `orderId`, `productVariantId`,
  `quantity`, `status` (default `ACTIVE`), `expiresAt`; unique `(orderId, productVariantId)`;
  sở hữu `InventoryReservationItem[]` (snapshot lượng nguyên liệu đã giữ).

Enum liên quan: `PaymentStatus {PROCESSING, SUCCEEDED, FAILED, MANUAL_REVIEW, REFUNDED}`,
`ReservationStatus {ACTIVE, CONSUMED, RELEASED, EXPIRED}`,
`CouponRedemptionStatus {RESERVED, CONSUMED, RELEASED, EXPIRED}`.

> Lưu ý: BrewLite **không** có khái niệm bàn/đặt bàn (restaurant table) gắn vào Order —
> đơn hàng không liên kết bàn ăn tại chỗ.

---

## 5. DTO (hợp đồng dữ liệu)

- **`CreateOrderItemDto`**: `productVariantId` (`@IsUUID`), `quantity` (`@IsInt @Min(1) @Max(20)`),
  `toppingIds?` (`@IsArray @ArrayUnique @IsUUID each`), `sugarLevel?`/`iceLevel?`
  (`@IsInt @Min(0) @Max(100)`, giữ nguyên null — `0` nghĩa là "không", không bị thay bằng default),
  `note?` (trim, `@MaxLength(500)`).
- **`CreateOrderDto`**: `items` (`@ArrayMinSize(1) @ArrayMaxSize(20)`, validate lồng),
  `couponCode?` (trim, `@MaxLength(50)`). **Giá và userId không bao giờ đến từ client.**
- **`StaffOrdersQueryDto`**: `status?` (`@IsIn(STAFF_QUEUE_STATUSES)`), `limit?` (1–200).
- **`UpdateOrderStatusDto`**: `status` (`@IsIn(BARISTA_TARGET_STATUSES)`).
- **`StaffOrderDto`**: dữ liệu đơn cho nhân viên, **không** chứa thông tin tài khoản khách.
- **`OrderItemResponseDto`**: `productName`, `size`, `unitPrice`, `quantity`, `sugarLevel`,
  `iceLevel`, `note`, `toppings[]`, `lineTotal`.
- **`OrderHistoryQueryDto`**: `limit` (1–100), `cursor` (uuid), `status` (`@IsEnum(OrderStatus)`).

---

## 6. Controllers & endpoint

### `OrdersController` — `@Controller('orders')`
Guard cấp class: `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(CUSTOMER)`,
`@UseFilters(OrdersExceptionFilter)`, `@UseInterceptors(OrdersResponseInterceptor)`.
Principal `{ id, role }` lấy qua `@CurrentUser()`.

| Method | Route | Service | Mô tả |
|--------|-------|---------|-------|
| POST | `/orders` (201) | `createOrder(user.id, dto)` | Tạo đơn. Trả `{ data }`. |
| GET | `/orders/me` (200) | `getMyOrdersPage(user.id, query)` | Lịch sử đơn, phân trang keyset. |
| GET | `/orders/:id` (200) | `getOrderDetail(orderId, user.id)` | Chi tiết đơn (ownership enforce ở service). |
| POST | `/orders/:id/cancel` (200) | `cancelOrder(orderId, user.id, 'Khách hàng yêu cầu hủy đơn hàng', false)` | Hủy đơn. **Lý do hard-code ở controller** để client không chèn text lịch sử. |

### `StaffOrdersController` — `@Controller('staff/orders')`
Giống trên nhưng `@Roles(BARISTA)` (khách nhận 403).

| Method | Route | Service | Mô tả |
|--------|-------|---------|-------|
| GET | `/staff/orders` (200) | `getStaffQueue(query, user.id)` | Hàng đợi PAID/PREPARING/READY. |
| PATCH | `/staff/orders/:id/status` (200) | `advanceOrderStatus(orderId, user.id, dto.status)` | Đẩy đơn sang PREPARING/READY/COMPLETED. |

---

## 7. OrdersService — nghiệp vụ cốt lõi

Dependency (constructor): `OrdersRepository`, `PrismaService`, `PromotionsService`,
`CatalogService`, `InventoryService`, `UsersService`, `APP_CONFIG`
(dùng `orderReservationTtlMinutes`).

### `createOrder(userId, dto)` — UC-06
1. `normalizeItems`: lowercase id, sort/validate topping unique, gộp các dòng cùng cấu hình
   (cộng dồn số lượng, cap 20 ly/cấu hình).
2. Mở transaction **Serializable** + **retry tối đa 3 lần** (retry khi `InventoryVersionConflict`,
   lỗi serialization Postgres `P2034`/`40001`/`40P01`, hoặc trùng unique `orderNumber` `P2002`;
   hết 3 lần → `409 INVENTORY_CONFLICT`). Trong transaction:
   - `users.assertActiveCustomer(tx, userId)`.
   - Tính `reservationExpiresAt = now + orderReservationTtlMinutes`.
   - Sinh `orderNumber = ORD-<24 hex>`.
   - `validateAndPriceItems()` → `items` đã định giá, `subtotal`, `needs` (nhu cầu nguyên liệu).
   - Nếu có `couponCode`: `promotions.quoteAndLock(tx, userId, code, subtotal, now)` → `discountAmount`.
   - `total = subtotal - discountAmount`; mọi giá trị tiền qua guard `orderMoney()` trước khi ghi.
   - `tx.order.create` với `items`/`orderItemToppings` lồng nhau — lưu **snapshot** (tên món, size,
     đơn giá, topping) — trạng thái khởi tạo `PENDING`.
   - `inventory.reserve(tx, order.id, reservationExpiresAt, needs)`.
   - Nếu có coupon: `promotions.reserve(tx, couponQuote, order.id, reservationExpiresAt)`.
   - `tx.orderStatusHistory.create`: `null → PENDING`, reason "Khách hàng tạo đơn hàng".

   > **Thứ tự bắt buộc** (quy ước nội bộ về khóa coupon): `quoteAndLock` (khóa coupon) →
   > `order.create` → `promotions.reserve`, để không vi phạm khóa ngoại
   > `coupon_redemptions.order_id`.

### `validateAndPriceItems(items, tx)`
Với mỗi item: `catalog.quoteVariant` (variant active, nếu không → `400 INVALID_OPTION`);
cộng dồn nhu cầu nguyên liệu từ công thức (BOM) của variant + từng topping; kiểm tra topping
thuộc sản phẩm & active; **định giá từ DB** `(variant.price + Σ topping.price) * quantity`.
Cuối cùng so tổng nhu cầu nguyên liệu với tồn kho thực: variant/topping không có công thức,
nguyên liệu inactive, hoặc thiếu kho → `409 OUT_OF_STOCK` kèm `details`. Trả `{ items, subtotal, needs }`.

### Cổng cho PaymentsService
- `getOrderForPayment` / `getOrderForPaymentForUpdate` (khóa dòng qua `findByIdAndUserIdForUpdate`).
- `transitionForPaymentRetry` (PAYMENT_FAILED → PENDING trước khi charge lại).
- `markOrderPaid` (PENDING → PAID; consume reservation; cộng điểm; rồi `promotions.consumeRedemption`).
- `markOrderPaymentFailed` (PENDING → PAYMENT_FAILED).

### Barista
- `getStaffQueue`: `assertActiveBarista` → `repository.findStaffQueue` (mặc định PAID/PREPARING/READY,
  đơn chờ lâu nhất đứng đầu theo `updatedAt asc`).
- `advanceOrderStatus`: transaction → `lockById` (`FOR UPDATE`) → `assertTransition` →
  `updateStatusWithHistory` (reason từ `BARISTA_TRANSITION_REASONS`) → trả `StaffOrderDto`.
  Hai barista bấm cùng lúc: người sau nhận 409 (CAS `updateMany` đếm dòng).

### `cancelOrder(orderId, userId, reason, isExpired, tx?)`
Dùng chung cho khách hủy & cron. Khóa đơn; chỉ cho hủy từ `PENDING`/`PAYMENT_FAILED`
(khác → `409 ORDER_INVALID_TRANSITION`); chặn nếu có payment `MANUAL_REVIEW`/`PROCESSING`
(→ `409 PAYMENT_IN_PROGRESS`; VNPay PROCESSING bị force-fail khi hủy chủ động); chuyển sang
`CANCELLED` + ghi lịch sử; `promotions.releaseRedemption` (RELEASED hoặc EXPIRED); release từng
reservation còn ACTIVE qua `inventory.releaseInTransaction`.

---

## 8. OrdersRepository — truy cập DB & đồng thời

- `lockById` / `findByIdAndUserIdForUpdate` / `findByIdForUpdate`: `SELECT … FOR UPDATE` để
  khóa dòng Order, đồng bộ giữa thanh toán ↔ hủy ↔ cron expiry.
- `findOrdersPage`: keyset pagination (`createdAt desc, id desc`), lấy `limit+1` để tính `nextCursor`.
- `findStaffQueue`: sắp theo `updatedAt asc` (chờ lâu nhất trước).
- `findOrderDetail`: include items/toppings + payments (mới nhất trước) + statusHistories (cũ → mới).
- **`updateStatusWithHistory`**: gọi `assertTransition` trước; cập nhật bằng
  `updateMany({ where: { id, status: currentStatus } })` (CAS). Nếu `count !== 1` → 409
  (ngăn hai tiến trình cùng chuyển). Chỉ ghi `OrderStatusHistory` sau khi cập nhật thành công.
- **`markAsPaid`**: PENDING → PAID; chuyển reservation `ACTIVE → CONSUMED`; cộng điểm thưởng
  `earnedPoints = total / 10`, tăng `user.loyaltyBalance`, ghi `LoyaltyTransaction` type `EARN`.
  (Quyết toán coupon do `OrdersService.markOrderPaid` gọi `promotions.consumeRedemption` để giữ
  ranh giới module — ADR-001.)

---

## 9. Luồng runtime tạo đơn (POST /orders) — end-to-end

1. Request → `OrdersController.create`. `JwtAuthGuard` xác thực; `RolesGuard` + `@Roles(CUSTOMER)`
   phân quyền; `OrdersResponseInterceptor` gắn/echo `X-Request-Id`.
2. `ValidationPipe` dựng `CreateOrderDto` (1–20 item, mỗi item qty 1–20, uuid variant,
   topping unique, sugar/ice 0–100, note ≤500, couponCode optional).
3. `createOrder`: `normalizeItems` → mở transaction **Serializable** (retry ≤3):
   assert active customer → TTL + orderNumber → `validateAndPriceItems` (lookup catalog, BOM→needs,
   định giá DB, pre-check kho) → `quoteAndLock` coupon (nếu có) → `total` + money guard →
   `order.create` snapshot ở `PENDING` → `inventory.reserve` → `promotions.reserve` (nếu có) →
   `orderStatusHistory` null→PENDING.
4. Xung đột serialization/version/unique → retry với backoff jitter; hết retry → `409 INVENTORY_CONFLICT`.
5. Trả `{ data: CreateOrderResponseDto }` (status PENDING, items snapshot, subtotal/discount/total,
   `reservationExpiresAt`), kèm `meta.requestId`. Lỗi nghiệp vụ được `OrdersExceptionFilter` chuẩn
   hóa thành `{ error: { code, message, details, requestId } }`.
6. **Side effect ở request khác:**
   - Thanh toán OK → `markOrderPaid` (PENDING→PAID, reservation→CONSUMED, cộng điểm, consume coupon).
   - Thanh toán lỗi → PAYMENT_FAILED (có thể retry → PENDING).
   - Không thanh toán trước hạn → `OrderExpiryJob` (mỗi phút) khóa đơn → CANCELLED, coupon EXPIRED,
     hoàn kho; bỏ qua đơn còn payment PROCESSING/MANUAL_REVIEW.

---

## 10. Cron hết hạn — `OrderExpiryJob`

File: `services/order-expiry.job.ts`. `@Cron(EVERY_MINUTE)`, có cờ `isRunning` chống chạy chồng.

1. Quét đơn `PENDING`/`PAYMENT_FAILED` có `reservationExpiresAt <= now` và **không** còn payment
   `PROCESSING`/`MANUAL_REVIEW`.
2. Với mỗi đơn, mở transaction riêng: `findByIdForUpdate` (khóa + đọc lại trạng thái mới nhất);
   kiểm tra lại điều kiện (trạng thái hợp lệ, đã quá hạn, không có payment đang xử lý) — nếu lệch
   thì bỏ qua (return false).
3. `updateStatusWithHistory` → `CANCELLED` (reason "Hủy tự động do đơn hàng hết thời hạn thanh toán").
4. `promotions.releaseRedemption(tx, orderId, true)` → coupon EXPIRED.
5. Với reservation ACTIVE: nếu `expiresAt` của reservation trễ hơn Order TTL thì đồng bộ về Order TTL
   (để InventoryService không từ chối hoàn kho), rồi `inventory.releaseInTransaction(tx, id, true)`.
6. Lỗi `ConflictException` → log warn & bỏ qua đơn đó; lỗi khác → log error. Order TTL là **mốc hết
   hạn có thẩm quyền**.

---

## 11. Tích hợp liên module

- **Catalog** (`CatalogService.quoteVariant`): nguồn sự thật về tồn tại/active của variant, giá,
  quan hệ product→topping, công thức BOM. Orders **không** tin giá client.
- **Inventory** (`InventoryService`): `reserve` khi tạo; `markAsPaid` chuyển ACTIVE→CONSUMED;
  `releaseInTransaction` khi hủy/hết hạn (RELEASED vs EXPIRED). Optimistic concurrency theo
  `version` nguyên liệu, lỗi surface thành `InventoryVersionConflict` → đẩy retry loop khi tạo.
- **Promotions/Loyalty** (`PromotionsService`): `quoteAndLock` + `reserve` lúc tạo (đúng thứ tự FK);
  `consumeRedemption` khi PAID; `releaseRedemption(..., expired)` khi hủy/hết hạn. Điểm thưởng được
  cộng trực tiếp trong `OrdersRepository.markAsPaid`.
- **Payments / VNPay** (`PaymentsService`, ngoài module): điều khiển chuyển
  PENDING↔PAYMENT_FAILED↔PAID qua các method cổng ở §7. Khóa dòng đơn qua
  `getOrderForPaymentForUpdate` trước khi tạo payment PROCESSING; charge gateway ngoài khóa; rồi
  mở transaction mới để quyết toán. Hợp đồng được pin trong `payments.service.spec.ts`.
- **Users** (`UsersService`): `assertActiveCustomer` / `assertActiveBarista` gate create & staff ops.

---

## 12. Module wiring — `orders.module.ts`

- `imports`: `AppConfigModule`, `PrismaModule`, `PromotionsModule`, `CatalogModule`, `InventoryModule`.
- `controllers`: `OrdersController`, `StaffOrdersController`.
- `providers`: `OrdersRepository`, `OrdersService`, `UsersService`, `OrderExpiryJob`.
- `exports`: `OrdersService` (được payments module dùng).

---

## 13. Bất biến & nguyên tắc thiết kế cần nhớ

1. **Một cổng trạng thái duy nhất** — mọi ghi status qua `assertTransition`.
2. **Snapshot bất biến** — OrderItem lưu tên/size/giá tại thời điểm đặt; catalog đổi sau không ảnh hưởng.
3. **Không tin client về tiền** — giá, discount, total tính từ DB; `orderMoney()` guard mọi giá trị.
4. **Khóa dòng + CAS** — `FOR UPDATE` và `updateMany` đếm dòng chống race giữa barista, thanh toán, cron.
5. **Transaction Serializable + retry** cho tạo đơn, bảo toàn tính nhất quán tồn kho/coupon.
6. **Ranh giới module** — orders orchestrate inventory/promotions/payments bằng gọi chéo service,
   không tự "chọc" bảng của module khác ngoài phạm vi đã thống nhất (ADR-001).
7. **404 thay vì 403 cho đơn không sở hữu** — `getOrderDetail` chống dò ID.
8. **Order TTL là mốc hết hạn có thẩm quyền** — cron đồng bộ reservation theo Order trước khi release.

---

## 14. Test tham chiếu (tài liệu hóa hành vi)

- `state/order-state-machine.spec.ts` — bảng chuyển đúng 9 mũi tên, ma trận 7×7, shape 409, trạng thái kết thúc.
- `controllers/*.spec.ts` — routing, guard/role, delegate service, lý do hủy cố định.
- `services/orders.service.spec.ts` — định giá, coupon, lỗi validate, luật hủy.
- `services/orders.service.staff.spec.ts` — thứ tự hàng đợi, advance, đồng thời.
- `services/order-retry.spec.ts` — retry/backoff khi xung đột Serializable.
- `services/order-expiry.job.spec.ts` — quét hết hạn, khóa, bỏ qua đơn có payment, release coupon/kho.
- `repositories/orders.repository.spec.ts` — CAS guard, ghi history, `markAsPaid` (điểm/kho).
- `dto/create-order.dto.spec.ts`, `mappers/order-item.mapper.spec.ts`, `http/orders-http.spec.ts`.
- `apps/api/test/orders.integration-spec.ts` — luồng tạo đơn qua HTTP (gồm coupon & payment).
- `apps/api/test/orders-inventory.integration-spec.ts` — reservation/deduction/restore end-to-end.
- `apps/api/test/order-state-machine.integration-spec.ts` — vòng đời qua HTTP.

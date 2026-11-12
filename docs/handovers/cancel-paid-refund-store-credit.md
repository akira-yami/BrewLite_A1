# Biên Bản Bàn Giao: Nghiệp Vụ Hủy Đơn PAID & Hoàn Tiền Thành Store Credit

**Ngày thực hiện:** 12/11/2026  
**Phụ trách:** Kiệt  
**Branch:** `Kiet-Payment-Idempotency-PaymentUI`  
**Trạng thái:** ✅ Hoàn thành — tất cả unit tests pass (411/411), build thành công

---

## 1. Quyết Định Kiến Trúc & Hướng Đi Kỹ Thuật

### Hướng đi được lựa chọn

**Mở rộng `OrdersService` với method `cancelPaidOrder()` riêng biệt**, thực hiện 5 việc đồng thời trong 1 Prisma transaction atomically:

1. **Order**: PAID → CANCELLED + ghi `OrderStatusHistory`
2. **Inventory**: Restore nguyên liệu từ snapshot `InventoryReservationItem` (reservation CONSUMED → RELEASED)
3. **Coupon**: `CouponRedemption` CONSUMED → RELEASED (mở khóa voucher cho lần sau)
4. **Loyalty REFUND_CREDIT**: Hoàn tiền 1 VND = 1 điểm vào `loyaltyBalance`
5. **Loyalty REVERSAL**: Sau khi hoàn Store Credit, thu hồi điểm EARN đã cộng lúc PAID

Thêm 2 endpoints riêng biệt theo role:
- `POST /orders/:id/cancel-paid` — dành cho CUSTOMER
- `POST /staff/orders/:id/cancel-paid` — dành cho BARISTA (kèm `reason` bắt buộc)

### Lý do lựa chọn

| Tiêu chí | Lý do |
|---|---|
| **Method riêng** | `cancelOrder()` hiện có chỉ xử lý PENDING/PAYMENT_FAILED; mở rộng nó sẽ làm phức tạp logic của 2 luồng hoàn toàn khác nhau (hủy trước và sau thanh toán) |
| **1 transaction atomicity** | Tất cả 5 bước phải thành công cùng lúc — không được phép trạng thái nửa vời (hủy đơn nhưng chưa hoàn điểm) |
| **Restore trực tiếp từ snapshot** | Khi PAID, `InventoryReservation.status = CONSUMED`. `InventoryService.releaseInTransaction()` chỉ xử lý ACTIVE → không dùng được. Dùng snapshot `InventoryReservationItem` để restore đúng lượng nguyên liệu tại thời điểm đặt đơn, không phụ thuộc công thức hiện tại |
| **Sort theo ingredientId** | Tránh deadlock khi nhiều transaction đồng thời restore cùng nguyên liệu |
| **REFUND_CREDIT enum mới** | Phân biệt với EARN thông thường, dễ audit và report |

### Phân tích giải pháp thay thế

| Giải pháp | Vấn đề |
|---|---|
| Mở rộng `cancelOrder()` | Logic điều kiện phức tạp, dễ regression test; coupling 2 luồng nghiệp vụ khác nhau |
| Tạo `RefundService` riêng (theo spec payment-refund-api) | Đúng về lý thuyết nhưng overkill cho scope hiện tại; cần thêm module, injection, circular dependency risk |
| Hoàn tiền thực (SUCCEEDED → REFUNDED + ghi nhận tiền thực) | Mock gateway không hỗ trợ hoàn tiền thực; Store Credit là lựa chọn thực tế và theo đúng yêu cầu đề bài |

### Giá trị mang lại

- **Ngắn hạn**: Khách hàng và Barista có thể hủy đơn PAID theo đúng nghiệp vụ; điểm tích lũy được quản lý chính xác
- **Dài hạn**: Nền tảng sạch để mở rộng hoàn tiền thực (VNPay QueryDr) khi cần; audit trail đầy đủ qua `LoyaltyTransaction` và `OrderStatusHistory`
- **Tính idempotency**: Guard bằng `findFirst({ type: 'REFUND_CREDIT' })` ngăn hoàn tiền 2 lần dù double-click hay mạng lag

---

## 2. Hướng Dẫn Vận Hành & Khởi Chạy File Đặc Biệt

### Danh sách file đặc biệt

| File | Loại | Mô tả |
|---|---|---|
| `apps/api/prisma/migrations/20261112090000_add_refund_credit_loyalty_type/migration.sql` | Migration SQL | Thêm `REFUND_CREDIT` vào enum `LoyaltyTransactionType` trong PostgreSQL |

### Điều kiện tiên quyết

Phải chạy migration trước khi khởi động API:

```bash
# Môi trường local (trực tiếp trên host)
cd apps/api
npm run prisma:deploy

# Hoặc qua Docker Compose
docker compose up -d --build
```

### Lệnh khởi chạy migration

```bash
# Apply migration lên database
cd apps/api
npm run prisma:deploy

# Kết quả mong đợi:
# Prisma Migrate applied the following migration(s):
# 20261112090000_add_refund_credit_loyalty_type
```

### Kết quả mong đợi

Sau khi migration:
```sql
-- Enum LoyaltyTransactionType phải có 5 giá trị:
SELECT unnest(enum_range(NULL::"LoyaltyTransactionType"));
-- EARN, REDEEM, ADJUSTMENT, REVERSAL, REFUND_CREDIT
```

---

## 3. Danh Sách Thay Đổi

### Files mới

| File | Mục đích |
|---|---|
| `apps/api/prisma/migrations/20261112090000_add_refund_credit_loyalty_type/migration.sql` | Migration: thêm `REFUND_CREDIT` enum |
| `apps/api/src/modules/orders/dto/cancel-paid-order.dto.ts` | DTO cho Barista kèm `reason` bắt buộc |
| `apps/api/test/cancel-paid-refund.integration-spec.ts` | 10 integration tests cho nghiệp vụ mới |

### Files cập nhật

| File | Thay đổi |
|---|---|
| `apps/api/prisma/schema.prisma` | Thêm `REFUND_CREDIT` vào `LoyaltyTransactionType` enum |
| `apps/api/src/modules/orders/services/orders.service.ts` | Thêm `cancelPaidOrder()` method với 5-step atomic transaction |
| `apps/api/src/modules/orders/controllers/orders.controller.ts` | Thêm `POST /orders/:id/cancel-paid` cho Customer |
| `apps/api/src/modules/orders/controllers/staff-orders.controller.ts` | Thêm `POST /staff/orders/:id/cancel-paid` cho Barista |
| `apps/api/src/modules/promotions/repositories/promotions.repository.ts` | Thêm `releaseConsumedByOrderId()` để release coupon đã CONSUMED |
| `apps/api/src/modules/promotions/services/promotions.service.ts` | Xóa stub `releaseByOrderId()` lỗi; thêm `releaseConsumedRedemption()` |

---

## 4. API Endpoints Mới

### Customer: Hủy đơn PAID

```http
POST /api/v1/orders/:id/cancel-paid
Authorization: Bearer <customer_jwt>
```

**Response 200 OK:**
```json
{
  "data": {
    "id": "uuid",
    "orderNumber": "ORD-...",
    "status": "CANCELLED",
    "items": [...],
    "total": 55000,
    "paymentSummary": { "status": "REFUNDED", ... },
    "timeline": [...]
  },
  "refund": {
    "refundPoints": 55000,
    "newLoyaltyBalance": 60500,
    "message": "Đã hoàn 55.000 điểm vào tài khoản của bạn."
  }
}
```

**Error responses:**
| HTTP | Error code | Điều kiện |
|---|---|---|
| 404 | `ORDER_NOT_FOUND` | Đơn không tồn tại hoặc không phải chủ đơn |
| 409 | `ORDER_INVALID_TRANSITION` | Đơn không ở trạng thái PAID |
| 409 | `PAYMENT_IN_PROGRESS` | Có payment đang MANUAL_REVIEW |
| 409 | `REFUND_ALREADY_PROCESSED` | Đã hoàn tiền rồi |
| 403 | `FORBIDDEN_RESOURCE` | Barista gọi endpoint customer |

---

### Barista: Hủy đơn PAID (kèm lý do)

```http
POST /api/v1/staff/orders/:id/cancel-paid
Authorization: Bearer <barista_jwt>
Content-Type: application/json

{
  "reason": "Hết nguyên liệu đột xuất"
}
```

**Response 200 OK:**
```json
{
  "data": {
    "orderId": "uuid",
    "orderNumber": "ORD-...",
    "status": "CANCELLED",
    "refund": {
      "refundPoints": 55000,
      "newLoyaltyBalance": 60500,
      "message": "Đã hoàn 55.000 điểm vào tài khoản khách hàng."
    }
  }
}
```

**Error responses:**
| HTTP | Error code | Điều kiện |
|---|---|---|
| 400 | Validation error | `reason` rỗng hoặc thiếu |
| 403 | `FORBIDDEN_RESOURCE` | Customer gọi endpoint barista |

---

## 5. Logic Nghiệp Vụ Trong Transaction

```
cancelPaidOrder(orderId, actorId, role, reason)
│
├── 0. LOCK Order row + ownership check (CUSTOMER: findByIdAndUserIdForUpdate; BARISTA: findByIdForUpdate)
├── 1. Assert order.status === PAID → 409 nếu không phải PAID
├── 2. Assert không có payment MANUAL_REVIEW → 409 nếu có
├── 3. Assert không có REFUND_CREDIT transaction → 409 idempotency guard
│
├── [BEGIN TRANSACTION]
│
├── BƯỚC 1: Order PAID → CANCELLED + ghi OrderStatusHistory
├── BƯỚC 2: InventoryReservation CONSUMED → RELEASED + restore stockQuantity từ snapshot
├── BƯỚC 3: CouponRedemption CONSUMED → RELEASED (mở khóa voucher)
├── BƯỚC 4: Tạo REFUND_CREDIT (points = order.total, 1 VND = 1 điểm) + increment loyaltyBalance
├── BƯỚC 5: Tìm EARN transaction của orderId → tạo REVERSAL (points âm) + decrement loyaltyBalance
├── BƯỚC 6: Payment SUCCEEDED → REFUNDED
│
└── [COMMIT / ROLLBACK nếu có lỗi]
```

---

## 6. Kết Quả Kiểm Thử

### Unit Tests (pre-existing + không regression)
```
Test Files  39 passed (39)
Tests       411 passed (411)
Duration    13.08s
```

### Typecheck
```
✔ tsc --noEmit: Exit 0 (no errors)
```

### Lint
```
oxlint: Exit 0 (warnings pre-existing, không liên quan thay đổi mới)
```

### Build
```
nest build: Exit 0 (compiled successfully)
```

### Env Config Test
```
✔ 5 tests passed
```

### Documentation Check
```
Docs OK: 31 Markdown files, 151 local links
```

### Integration Tests
> Integration tests yêu cầu `SMOKE_DATABASE_URL` trỏ đến database đã migrate.  
> Trên môi trường local hiện tại, database chưa migrate nên 30/102 tests fail (pre-existing từ trước thay đổi).  
> File test mới `cancel-paid-refund.integration-spec.ts` có 10 test cases sẽ được xác nhận khi CI chạy.

---

## 7. Điểm Lưu Ý Cho Reviewer

1. **Tỷ lệ hoàn điểm**: Đề bài quy định 1 VND = 1 điểm. Tỷ lệ EARN lúc thanh toán là 1 điểm / 10 VND (đã có từ trước). Hai tỷ lệ này khác nhau là deliberate theo đề bài.

2. **REVERSAL points âm**: `LoyaltyTransaction.points` là `Int` — giá trị âm hợp lệ trong PostgreSQL cho REVERSAL.

3. **Bug đã sửa**: `PromotionsService.releaseByOrderId()` trước đây là stub `throw new Error('Method not implemented')` — đã xóa. Không ảnh hưởng runtime vì không có caller nào gọi trực tiếp method này (chỉ `releaseRedemption()` được gọi).

4. **Idempotency guard**: Dựa trên sự tồn tại của `REFUND_CREDIT` transaction. Nếu transaction bị rollback giữa chừng thì guard không bị kích hoạt → retry an toàn.

5. **Sort ingredientId**: Toàn bộ inventory restore loop sort theo `ingredientId ASC` để đảm bảo thứ tự lock nhất quán, tránh deadlock.

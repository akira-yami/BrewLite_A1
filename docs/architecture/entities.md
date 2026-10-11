# Đặc tả entity BrewLite

## 1. Quy ước kiểu dữ liệu

- `uuid`: UUID v4 hoặc UUID v7; sinh tại backend/database.
- `money`: `BIGINT`, đơn vị VND; ví dụ `35000` là 35.000đ.
- `timestamp`: PostgreSQL `timestamptz`, lưu UTC.
- Chuỗi có giới hạn độ dài ở DTO và database.
- Trường `createdAt`, `updatedAt` có ở aggregate root và entity có vòng đời độc lập.

## 2. Enum dùng chung

```text
UserRole = CUSTOMER | BARISTA
ProductSize = S | M | L
OrderStatus = PENDING | PAYMENT_FAILED | PAID | PREPARING | READY | COMPLETED | CANCELLED
PaymentMethod = E_WALLET | CARD
PaymentStatus = PROCESSING | SUCCEEDED | FAILED
ReservationStatus = ACTIVE | CONSUMED | RELEASED | EXPIRED
DiscountType = PERCENTAGE | FIXED_AMOUNT
CouponRedemptionStatus = RESERVED | CONSUMED | RELEASED | EXPIRED
LoyaltyTransactionType = EARN | REDEEM | ADJUSTMENT | REVERSAL
```

## 3. Nhóm tài khoản

`CUSTOMER` là user/khách hàng; `BARISTA` là nhân viên quầy. Mock Payment Gateway là tác nhân tích hợp trong SD-01, không phải role tài khoản.

### User

| Thuộc tính | Kiểu | Bắt buộc | Quy tắc |
|---|---|---:|---|
| `id` | uuid | Có | PK |
| `username` | varchar(100) | Có | Unique |
| `passwordHash` | string | Có | Không bao giờ trả ra API |
| `role` | UserRole | Có | Mặc định `CUSTOMER` |
| `loyaltyBalance` | int | Có | Cache số dư, `>= 0`; nguồn sự thật là ledger |
| `isActive` | boolean | Có | Mặc định `true` |
| `createdAt`, `updatedAt` | timestamp | Có | Audit |

Invariant: username là định danh đăng nhập duy nhất; password chỉ tồn tại ở dạng hash; user bị khóa không được đăng nhập/tạo đơn mới.

## 4. Nhóm catalog

### Product

| Thuộc tính | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK |
| `sku` | varchar(50) | Unique, ổn định |
| `name` | varchar(150) | Không rỗng |
| `description` | text | Nullable |
| `imageUrl` | varchar(500) | URL HTTPS hoặc đường dẫn asset hợp lệ |
| `isActive` | boolean | Ẩn mềm khỏi menu |
| `createdAt`, `updatedAt` | timestamp | Audit |

### ProductVariant

| Thuộc tính | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK |
| `productId` | uuid | FK Product |
| `size` | ProductSize | Unique cùng product |
| `price` | money | Giá bán của variant, `>= 0` |
| `stock` | int | `>= 0` |
| `version` | int | Mặc định 0, `>= 0`; tăng cùng update stock để optimistic locking |
| `isActive` | boolean | Không cho thêm vào đơn mới nếu false |

Invariant: giá và stock không âm; variant inactive vẫn được giữ để lịch sử order tham chiếu.

### Topping

| Thuộc tính | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK |
| `code` | varchar(50) | Unique |
| `name` | varchar(100) | Không rỗng |
| `price` | money | `>= 0` |
| `isActive` | boolean | Mặc định true |

### ProductTopping

Bảng nối gồm `productId`, `toppingId`; composite PK. Chỉ topping có trong bảng nối và đang active mới được chọn cho sản phẩm.

## 5. Aggregate Order

### Order

Order là aggregate root quản lý item, tổng tiền, trạng thái và transition.

| Thuộc tính | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK |
| `orderNumber` | varchar(30) | Unique, mã hiển thị cho khách; không dùng làm PK |
| `userId` | uuid | FK User, không đổi |
| `status` | OrderStatus | Mọi thay đổi qua state machine |
| `subtotal` | money | Tổng item trước giảm giá |
| `discountAmount` | money | `0..subtotal` |
| `total` | money | `subtotal - discountAmount` |
| `couponCodeSnapshot` | varchar(50) | Nullable |
| `reservationExpiresAt` | timestamp | Thời điểm tự hoàn tồn nếu chưa trả tiền |
| `createdAt`, `updatedAt` | timestamp | Audit |

Không lưu `loyaltyPointsEarned` như nguồn sự thật trên order; số điểm tra từ ledger để tránh cộng lặp.

### OrderItem

| Thuộc tính | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK |
| `orderId` | uuid | FK Order |
| `productVariantId` | uuid | FK ProductVariant |
| `productNameSnapshot` | varchar(150) | Tên lúc đặt |
| `variantNameSnapshot` | varchar(50) | Ví dụ `M` |
| `unitPrice` | money | Giá variant trước topping |
| `quantity` | int | `> 0`, giới hạn ở DTO |
| `sugarLevel` | int? | Cột `sugar_level`; phần trăm nguyên `0..100`, nullable |
| `iceLevel` | int? | Cột `ice_level`; phần trăm nguyên `0..100`, nullable |
| `note` | varchar(500)? | Ghi chú cho toàn bộ dòng món; trim đầu/cuối, rỗng/thiếu thành null |

Tổng một dòng được tính từ `unitPrice`, topping và `quantity`; ERD hiện tại không lưu `lineTotal` thành cột riêng.

`null` hoặc không gửi là theo công thức chuẩn; `0` là không đường/không đá, `100` là 100% lượng theo công thức. Hai trường độc lập, áp dụng cho mọi đơn vị trong dòng và không làm thay đổi giá. Giỏ UI cung cấp chuẩn/0/25/50/75/100%, API chấp nhận mọi số nguyên 0..100. Giá trị được lưu cùng snapshot lúc tạo đơn, trả lại cho khách và barista; không chỉnh sửa sau khi tạo đơn. Các dòng chỉ gộp khi cùng variant, tập topping, cả hai mức đường/đá và note đã chuẩn hóa; null khác lựa chọn 100% tường minh.

`OrderItem.note` được snapshot cùng lựa chọn khi tạo đơn, trả cho khách và barista, không ảnh hưởng giá. Chỉ gộp các dòng khi cả note sau chuẩn hóa cũng giống nhau; ghi chú khác giữ dòng riêng. Ghi chú là văn bản thuần, giữ xuống dòng và không render như HTML. Đơn/giỏ cũ thiếu note được đọc thành null.

### OrderItemTopping

| Thuộc tính | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK |
| `orderItemId` | uuid | FK OrderItem |
| `toppingId` | uuid | FK Topping |
| `toppingNameSnapshot` | varchar(100) | Tên lúc đặt |
| `unitPrice` | money | Giá lúc đặt |
| `quantity` | int | Số topping trên một đơn vị món, `> 0` |

Tổng topping được tính từ `unitPrice`, `quantity` và số lượng món; ERD hiện tại không lưu `lineTotal` thành cột riêng.

### OrderStatusHistory

| Thuộc tính | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK |
| `orderId` | uuid | FK Order |
| `fromStatus` | OrderStatus? | Null ở bản ghi khởi tạo |
| `toStatus` | OrderStatus | Trạng thái mới |
| `changedByUserId` | uuid? | Null nếu hệ thống/payment đổi trạng thái |
| `reason` | varchar(255)? | Bắt buộc khi hủy/thất bại thủ công |
| `createdAt` | timestamp | Thời điểm transition |

## 6. Thanh toán và tồn kho

### Payment

Mỗi bản ghi là một lần thử thanh toán; một order có thể có nhiều lần thử.

| Thuộc tính | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK |
| `orderId` | uuid | FK Order |
| `idempotencyKey` | varchar(100) | Unique, bắt buộc |
| `requestHash` | char(64) | SHA-256 của payload chuẩn hóa |
| `method` | PaymentMethod | Ví hoặc thẻ |
| `status` | PaymentStatus | PROCESSING/SUCCEEDED/FAILED |
| `amount` | money | Phải bằng `order.total` |
| `gatewayTransactionId` | varchar(100)? | Unique khi có |
| `failureCode` | varchar(100)? | Mã lỗi ổn định, không chứa dữ liệu nhạy cảm |
| `processedAt` | timestamp? | Có khi kết thúc |
| `createdAt`, `updatedAt` | timestamp | Audit |

Invariant: tối đa một payment `SUCCEEDED` cho mỗi order; key cũ cùng hash trả kết quả cũ; key cũ khác hash bị từ chối.

### InventoryReservation

| Thuộc tính | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK |
| `orderId` | uuid | FK Order |
| `productVariantId` | uuid | FK ProductVariant |
| `quantity` | int | `> 0` |
| `status` | ReservationStatus | Chỉ transition hợp lệ |
| `expiresAt` | timestamp | Thời điểm hết giữ tồn |
| `createdAt`, `updatedAt` | timestamp | Audit |

Transition: `ACTIVE -> CONSUMED` khi paid; `ACTIVE -> RELEASED` khi hủy chưa paid; `ACTIVE -> EXPIRED` khi timeout. Với PAID → CANCELLED trước pha chế, `CONSUMED -> RELEASED` hoàn stock và tăng version đúng một lần. Mỗi transition hoàn/trừ tồn tối đa một lần, commit cùng order/history.

## 7. Khuyến mãi và loyalty

### Coupon

| Thuộc tính | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK |
| `code` | varchar(50) | Unique, uppercase |
| `discountType` | DiscountType | Phần trăm hoặc số tiền cố định |
| `discountValue` | bigint | `> 0`; percentage `<= 100` |
| `maxDiscount` | money? | Trần giảm cho phần trăm |
| `minOrderValue` | money | Mặc định 0 |
| `usageLimit` | int? | Tổng lượt đang giữ + đã dùng; null là không giới hạn |
| `perUserLimit` | int | Mặc định 1 |
| `startsAt`, `endsAt` | timestamp | `startsAt < endsAt` |
| `isActive` | boolean | Công tắc vận hành |
| `createdAt`, `updatedAt` | timestamp | Audit |

### CouponRedemption

| Thuộc tính | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK |
| `couponId` | uuid | FK Coupon |
| `userId` | uuid | FK User |
| `orderId` | uuid | FK Order, unique để mỗi order chỉ dùng tối đa một coupon |
| `discountAmount` | money | Discount đã snapshot khi tạo order |
| `status` | CouponRedemptionStatus | `RESERVED` khi tạo order |
| `expiresAt` | timestamp | Đồng bộ với thời hạn reservation của order |
| `consumedAt` | timestamp? | Ghi khi payment thành công |
| `releasedAt` | timestamp? | Ghi khi order hủy hoặc reservation được hoàn |
| `createdAt`, `updatedAt` | timestamp | Audit |

Transition: `RESERVED -> CONSUMED` khi order `PAID`; `RESERVED -> RELEASED` khi hủy; `RESERVED -> EXPIRED` khi order hết thời gian giữ. Khi kiểm tra `usageLimit`/`perUserLimit`, chỉ tính các redemption `RESERVED` hoặc `CONSUMED`, nhờ đó đơn thanh toán thất bại/hủy không chiếm lượt coupon vĩnh viễn.

PAID → CANCELLED giữ Payment SUCCEEDED, coupon CONSUMED và loyalty EARN theo chính sách hủy đơn giữ giao dịch thành công; không hoàn tiền giả lập hoặc tự ghi REVERSAL điểm.

### LoyaltyTransaction

| Thuộc tính | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK |
| `userId` | uuid | FK User |
| `orderId` | uuid? | FK Order khi phát sinh từ đơn |
| `type` | LoyaltyTransactionType | EARN/REDEEM/ADJUSTMENT/REVERSAL |
| `points` | int | Có dấu: cộng dương, trừ âm |
| `balanceAfter` | int | `>= 0` |
| `reason` | varchar(255) | Mô tả ngắn |
| `createdAt` | timestamp | Bất biến |

Ledger không sửa/xóa. Sai sót được bù bằng một `REVERSAL` hoặc `ADJUSTMENT` mới. Partial unique `(orderId, type)` chỉ áp dụng khi `type = EARN` và `orderId` không null, để mỗi đơn cộng điểm một lần. Các loại giao dịch khác không bị index này giới hạn; service phải áp dụng quy tắc chống lặp phù hợp cho từng nghiệp vụ.

## 8. Aggregate và ownership

- `Order` sở hữu OrderItem, OrderItemTopping và OrderStatusHistory; không sửa trực tiếp child ngoài aggregate service.
- `Payment` là aggregate riêng vì có vòng đời và idempotency độc lập.
- `Product` quản lý variant/topping khả dụng; Order chỉ giữ FK và snapshot.
- `User` không nhúng danh sách order/payment; truy vấn dùng repository theo ID và phân trang.
- `InventoryReservation` và `CouponRedemption` là bản ghi reservation có state machine riêng; `LoyaltyTransaction` là ledger bất biến. Tất cả được cập nhật qua Service trong transaction.

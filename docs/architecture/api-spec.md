# Đặc tả REST API BrewLite

## 1. Quy ước chung

- Base URL: `/api/v1`.
- Content type: `application/json; charset=utf-8`.
- Auth: `Authorization: Bearer <access-token>`.
- ID là UUID; thời gian ISO 8601 UTC; tiền là số nguyên VND.
- Tất cả request có/được gán `X-Request-Id`; response trả lại header này.
- API danh sách có `limit` tối đa 100 và metadata phân trang.
- Không nhận `userId`, `unitPrice`, `lineTotal`, `total` từ client cho nghiệp vụ tạo đơn.

Response thành công trả tài nguyên trực tiếp trong `data`:

```json
{
  "data": {},
  "meta": {
    "requestId": "01K..."
  }
}
```

Response lỗi thống nhất:

```json
{
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Một số sản phẩm không còn đủ số lượng.",
    "details": [
      { "field": "items[0].quantity", "variantId": "uuid", "available": 1 }
    ],
    "requestId": "01K..."
  }
}
```

## 2. Authentication

### `POST /auth/register`

Public. Tạo tài khoản customer.

```json
{
  "username": "customer01",
  "password": "MatKhauManh123!"
}
```

Kết quả `201 Created`:

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "username": "customer01",
      "role": "USER",
      "loyaltyBalance": 0
    },
    "accessToken": "jwt",
    "expiresIn": 900
  }
}
```

Lỗi chính: `400 VALIDATION_ERROR`, `409 USERNAME_ALREADY_EXISTS`, `429 RATE_LIMITED`.

### `POST /auth/login`

Public. Xác thực username/password.

```json
{
  "username": "customer01",
  "password": "MatKhauManh123!"
}
```

Kết quả `200 OK` giống phần auth của register. Sai thông tin luôn trả `401 INVALID_CREDENTIALS`, không tiết lộ username có tồn tại hay không.

### `POST /auth/refresh` (khuyến nghị)

Phát access token mới từ refresh token lưu trong cookie HttpOnly. Endpoint này không bắt buộc theo đề bài nhưng nên có nếu access token ngắn hạn.

## 3. Catalog

### `GET /products`

Public. Trả menu đang hoạt động.

Query:

| Tên | Kiểu | Mặc định | Ý nghĩa |
|---|---|---:|---|
| `search` | string | - | Tìm theo tên |
| `cursor` | string | - | Cursor trang kế |
| `limit` | int | 20 | 1..100 |

Kết quả `200 OK`:

```json
{
  "data": [
    {
      "id": "uuid",
      "sku": "CAPPUCCINO",
      "name": "Cappuccino",
      "imageUrl": "https://...",
      "minPrice": 45000,
      "available": true
    }
  ],
  "meta": {
    "nextCursor": null,
    "requestId": "01K..."
  }
}
```

### `GET /products/:id`

Public. Trả chi tiết và chỉ các tùy chọn đang hoạt động.

```json
{
  "data": {
    "id": "uuid",
    "sku": "CAPPUCCINO",
    "name": "Cappuccino",
    "description": "...",
    "imageUrl": "https://...",
    "variants": [
      { "id": "uuid", "size": "M", "price": 50000, "available": true }
    ],
    "toppings": [
      { "id": "uuid", "name": "Kem", "price": 7000 }
    ]
  }
}
```

Lỗi: `404 PRODUCT_NOT_FOUND`.

`minPrice` được suy ra từ giá các variant đang hoạt động; bảng `products` không có cột giá cơ sở.

## 4. Order

### `POST /orders`

Yêu cầu role `CUSTOMER`. Tạo đơn `PENDING`, tính lại giá và giữ tồn kho.

```json
{
  "items": [
    {
      "productVariantId": "uuid",
      "quantity": 2,
      "toppingIds": ["uuid"]
    }
  ],
  "couponCode": "WELCOME10"
}
```

Validation:

- `items` có 1..20 phần tử.
- `quantity` mỗi item là số nguyên 1..20.
- Variant/topping phải active và topping phải hợp lệ cho product.
- Không chấp nhận giá/tổng/userId từ client.
- Các dòng cùng variant và cùng tập topping được chuẩn hóa hoặc bị từ chối theo một quy ước duy nhất.

Kết quả `201 Created`:

```json
{
  "data": {
    "id": "uuid",
    "orderNumber": "BL-20260923-AB12CD",
    "status": "PENDING",
    "items": [
      {
        "id": "uuid",
        "productName": "Cappuccino",
        "size": "M",
        "unitPrice": 50000,
        "quantity": 2,
        "toppings": [
          { "name": "Kem", "unitPrice": 7000, "quantity": 1 }
        ],
        "lineTotal": 114000
      }
    ],
    "subtotal": 114000,
    "discountAmount": 10000,
    "total": 104000,
    "currency": "VND",
    "reservationExpiresAt": "2026-09-23T10:15:00Z",
    "createdAt": "2026-09-23T10:00:00Z"
  }
}
```

Lỗi chính: `401 UNAUTHORIZED`, `400 INVALID_OPTION`, `409 OUT_OF_STOCK`, `409 INVENTORY_CONFLICT`, `422 COUPON_NOT_APPLICABLE`.

`lineTotal` và `currency` trong response là giá trị tính ở lớp API (`currency` cố định là `VND` trong MVP), không phải cột của các bảng `orders` hay `order_items`.

### `GET /orders/me`

Yêu cầu đăng nhập. Chỉ trả order của user trong JWT.

Query: `status?`, `cursor?`, `limit=20`. Kết quả `200 OK`, sắp xếp `createdAt DESC, id DESC`. Danh sách trả summary; client có thể gọi endpoint chi tiết.

### `GET /orders/:id`

Yêu cầu chủ đơn (`CUSTOMER`) hoặc `BARISTA` trong luồng vận hành UC-10. Trả item, payment summary và timeline trạng thái. Nếu khách không sở hữu order, trả `404 ORDER_NOT_FOUND` để tránh dò ID.

### `POST /orders/:id/cancel`

Yêu cầu `CUSTOMER` là chủ đơn. Payload:

```json
{ "reason": "Khách đổi ý" }
```

Cho phép chủ đơn hủy từ `PENDING`, `PAYMENT_FAILED` hoặc `PAID` theo state machine. Kết quả `200 OK` với status `CANCELLED`. Hủy từ PAID chỉ được thực hiện trước khi Barista nhận pha; hoàn tồn đúng một lần, giữ Payment SUCCEEDED, coupon CONSUMED và loyalty EARN, không hoàn tiền giả lập. Từ PREPARING/READY/COMPLETED/CANCELLED trả `409 ORDER_INVALID_TRANSITION`. Hủy và nhận pha phải kiểm tra trạng thái dưới cùng cơ chế lock/compare-and-set để chỉ một transition thành công.

### `PATCH /orders/:id/status`

API vận hành chỉ cho `BARISTA`, hỗ trợ UC-10/Task 10; barista đăng nhập bằng UC-02. Chỉ cho phép `PAID -> PREPARING -> READY -> COMPLETED`.

```json
{
  "status": "PREPARING",
  "reason": "Barista nhận pha"
}
```

Backend tự lấy `fromStatus`, gọi `assertTransition`, ghi history cùng transaction. Client không được gửi `fromStatus` để làm nguồn sự thật.

## 5. Payment

### `POST /payments`

Yêu cầu role `CUSTOMER` và header bắt buộc:

```http
Idempotency-Key: 7f0a1f29-1b9f-44bb-a7c7-5e3f4f9e8d54
```

Payload:

```json
{
  "orderId": "uuid",
  "method": "E_WALLET"
}
```

Không nhận `amount`; backend lấy `order.total`. Điều kiện:

- Order thuộc user hiện tại.
- Order đang `PENDING` hoặc theo luồng retry từ `PAYMENT_FAILED` về `PENDING`.
- Reservation còn hiệu lực.
- Chưa có payment thành công.

Kết quả thành công `200 OK`:

```json
{
  "data": {
    "paymentId": "uuid",
    "orderId": "uuid",
    "orderNumber": "BL-20260923-AB12CD",
    "paymentStatus": "SUCCEEDED",
    "orderStatus": "PAID",
    "method": "E_WALLET",
    "amount": 104000,
    "processedAt": "2026-09-23T10:02:00Z"
  }
}
```

Kết quả gateway từ chối vẫn là request được xử lý hợp lệ, có thể trả `200 OK` với `paymentStatus=FAILED` và `orderStatus=PAYMENT_FAILED`; lỗi hạ tầng không xác định trả `503 PAYMENT_GATEWAY_UNAVAILABLE` và không tự đánh dấu thành công.

Quy tắc retry:

- Cùng key, cùng payload và attempt đã hoàn tất: trả đúng kết quả payment đã lưu, không gọi gateway lần hai. Attempt còn `PROCESSING`: trả `409 PAYMENT_IN_PROGRESS`, client chờ rồi gửi lại cùng key. Key cũ **không** được dùng để thử thanh toán lại.
- Cùng key, khác payload: `409 IDEMPOTENCY_KEY_REUSED`.
- Sau một payment `FAILED`, client tạo **Idempotency-Key mới**. Trước attempt mới, `PaymentService` khóa order và transition `PAYMENT_FAILED -> PENDING`, đồng thời ghi `OrderStatusHistory`; sau đó mới tạo payment attempt mới.
- Nếu reservation đã hết hạn hoặc order đã bị hủy thì không cho retry; trả lỗi nghiệp vụ phù hợp.
- Key mới cho order đã `PAID`: `409 ORDER_ALREADY_PAID`.

## 6. Promotion và loyalty (hỗ trợ Task 10)

### `POST /coupons/validate`

Khuyến nghị để UI preview, nhưng kết quả không được dùng làm quyết định cuối. Payload gồm `code` và các `items`; response trả discount ước tính. `POST /orders` luôn kiểm tra lại trong transaction.

### `GET /loyalty/me`

Yêu cầu đăng nhập. Trả `balance` và lịch sử giao dịch phân trang. Điểm chỉ được cộng sau khi order chuyển sang `PAID`, đúng một lần.

## 7. Mã lỗi nghiệp vụ chuẩn

| HTTP | Code | Khi dùng |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | DTO sai kiểu/thiếu trường |
| 401 | `UNAUTHORIZED` | Thiếu/token không hợp lệ |
| 403 | `FORBIDDEN` | Đã đăng nhập nhưng thiếu role |
| 404 | `PRODUCT_NOT_FOUND`, `ORDER_NOT_FOUND` | Tài nguyên không tồn tại/không thuộc user |
| 409 | `OUT_OF_STOCK` | Không đủ tồn |
| 409 | `INVENTORY_CONFLICT` | Transaction tồn kho bị serialization/deadlock sau khi hết retry |
| 409 | `ORDER_INVALID_TRANSITION` | Chuyển trạng thái sai |
| 409 | `ORDER_ALREADY_PAID` | Thanh toán đơn đã trả |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Key cũ khác payload |
| 422 | `COUPON_NOT_APPLICABLE` | Coupon hết hạn/không đủ điều kiện |
| 429 | `RATE_LIMITED` | Quá giới hạn request |
| 503 | `PAYMENT_GATEWAY_UNAVAILABLE` | Không xác định được kết quả gateway |

## 8. Versioning và tương thích

- Thay đổi phá vỡ hợp đồng tạo `/api/v2`; không âm thầm đổi nghĩa enum/field.
- Có thể thêm field optional trong v1.
- OpenAPI sinh từ NestJS DTO là hợp đồng máy đọc; file này mô tả quy tắc nghiệp vụ mà schema khó biểu diễn.
- CI nên kiểm tra OpenAPI diff và chạy consumer/e2e test cho luồng chính.

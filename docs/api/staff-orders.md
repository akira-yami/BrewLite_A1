# API đơn hàng cho Barista (EXT-UC10)

Phần mở rộng ngoài MVP: nhân viên xem hàng đợi đơn đã thanh toán, nhận đơn, báo pha xong và giao khách.
Tiền tố chung: `/api/v1`. Mọi route cần header `Authorization: Bearer <JWT>`.

## Phân quyền (RBAC)

| Người gọi | `/staff/orders/*` | `/orders/*` (khách) |
|---|---|---|
| Không có / sai token | 401 `UNAUTHORIZED` | 401 |
| `CUSTOMER` | 403 `FORBIDDEN_RESOURCE` | cho phép |
| `BARISTA` | cho phép | 403 `FORBIDDEN_RESOURCE` |

- `StaffOrdersController` dùng `JwtAuthGuard` + `RolesGuard` + `@Roles(BARISTA)` ở cấp class, nên route thêm sau cũng mặc định chỉ barista.
- Trước khi đọc hàng đợi hoặc đổi trạng thái, `OrdersService` kiểm tra lại trong DB rằng tài khoản còn `isActive` và là `BARISTA` (JWT chỉ mang role lúc đăng nhập). Không đạt: 401.
- Phản hồi cho nhân viên không chứa `userId`, username hay dữ liệu tài khoản khách.

## Luồng trạng thái

Sơ đồ đề bài mục 9.1 (9 mũi tên):

```
PENDING --thanh toán OK--> PAID --barista nhận--> PREPARING --pha xong--> READY --giao khách--> COMPLETED
PENDING --thanh toán lỗi--> PAYMENT_FAILED --thử lại--> PENDING
PENDING / PAYMENT_FAILED / PAID --hủy--> CANCELLED
```

`COMPLETED` và `CANCELLED` là trạng thái kết thúc.

Luật nằm ở `modules/orders/state/order-state-machine.ts` (`ORDER_TRANSITIONS`, `assertTransition`). `assertTransition(from, to)` ném 409 `INVALID_ORDER_TRANSITION` cho mọi cặp không có mũi tên, và được gọi ở hai nơi:

- `OrdersService.advanceOrderStatus` (barista), để trả lỗi sớm.
- `OrdersRepository.updateStatusWithHistory` và `markAsPaid`. Mọi lần ghi trạng thái (thanh toán, thử lại, hết hạn đơn, barista) đều đi qua hai hàm này nên không có đường vòng.

Barista chỉ được đặt `PREPARING` (từ `PAID`), `READY` (từ `PREPARING`), `COMPLETED` (từ `READY`). Hủy từ `PAID` hợp lệ theo sơ đồ nhưng chưa có API công khai cho việc này.

## Endpoint

### `GET /staff/orders`

Hàng đợi đơn `PAID`, `PREPARING`, `READY`, đơn chờ lâu nhất đứng đầu (theo thời điểm vào trạng thái hiện tại).

| Query | Mô tả |
|---|---|
| `status` | Tùy chọn: `PAID`, `PREPARING` hoặc `READY` |
| `limit` | Tùy chọn: 1..200, mặc định 100 |

```json
{
  "data": [
    {
      "id": "uuid",
      "orderNumber": "ORD-…",
      "status": "PAID",
      "items": [{ "productName": "Bạc xỉu", "size": "M", "quantity": 1, "sugarLevel": 50, "iceLevel": 100, "note": null, "toppings": [], "unitPrice": 35000, "lineTotal": 35000, "id": "uuid" }],
      "total": 35000,
      "currency": "VND",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "meta": { "requestId": "…" }
}
```

### `PATCH /staff/orders/:id/status`

Body: `{ "status": "PREPARING" | "READY" | "COMPLETED" }`. Trả `{ "data": <đơn đã cập nhật> }`.

Đơn bị khóa dòng (`FOR UPDATE`), kiểm tra luật, cập nhật có điều kiện theo trạng thái hiện tại và ghi `OrderStatusHistory` (`changedByUserId` = barista) trong một transaction. Hai barista bấm cùng lúc: người đến sau nhận 409.

| Mã | `error.code` | Khi nào |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `id` không phải UUID, `status` ngoài 3 giá trị trên, có trường thừa |
| 401 | `UNAUTHORIZED` | thiếu/sai token, hoặc tài khoản không còn là barista hoạt động |
| 403 | `FORBIDDEN_RESOURCE` | `CUSTOMER` |
| 404 | `ORDER_NOT_FOUND` | không có đơn |
| 409 | `INVALID_ORDER_TRANSITION` | chuyển tiếp không hợp lệ, `details: [{ from, to }]` |

## Giao diện

Trang `/barista` (Next.js, client component):

- Chưa đăng nhập: nút đăng nhập. Đã đăng nhập là `CUSTOMER`: thông báo không có quyền, không gọi API nhân viên.
- Barista: 3 cột `Đơn mới (PAID)` → `Đang pha chế` → `Chờ giao khách`, nút `Nhận đơn` / `Pha xong` / `Đã giao khách`. Tự làm mới mỗi 10 giây; lỗi 409 hiển thị rồi nạp lại hàng đợi.
- Đăng nhập bằng tài khoản `BARISTA` chuyển thẳng tới `/barista`.

## Tài khoản demo

Seed tạo sẵn hai tài khoản, không đọc username/password demo từ `.env`:

| Vai trò | Username | Password |
|---|---|---|
| CUSTOMER | `customer01` | `Customer@123` |
| BARISTA | `barista01` | `Barista@123` |

Chạy `npm run db:seed` trong `apps/api`, hoặc `node --import=tsx prisma/seed-demo.ts`. Tài khoản được upsert theo username, mật khẩu bcrypt, isActive=true và role đúng; seed lặp không nhân bản tài khoản. Đăng ký công khai vẫn chỉ tạo CUSTOMER.

## Kiểm thử

- `src/modules/orders/state/order-state-machine.spec.ts`: bảng luật khớp đúng 9 mũi tên của sơ đồ, toàn bộ ma trận trạng thái, `assertTransition`.
- `src/modules/orders/repositories/orders.repository.spec.ts`: repository chặn chuyển tiếp sai trước khi ghi DB.
- `test/order-state-machine.integration-spec.ts` (Postgres thật, cần `SMOKE_DATABASE_URL`): luồng đầy đủ kèm lịch sử, chuyển tiếp sai (409, DB không đổi), nhánh lỗi/thử lại, nhánh hủy, hai barista cùng nhận một đơn, RBAC, hàng đợi.
- `src/modules/orders/services/orders.service.staff.spec.ts`: hàng đợi, chuyển hợp lệ/không hợp lệ, 404, barista bị vô hiệu, tranh chấp.
- `src/modules/orders/controllers/staff-orders.controller.spec.ts`: metadata RBAC và DTO.
- `test/staff-orders.e2e-spec.ts`: HTTP thật qua guard/filter/ValidationPipe (401/403/400/409).
- `apps/web/tests/staff-api.test.mjs`: client API (401 hủy phiên, 403/409 giữ phiên).

## Nhánh hủy đơn của khách

`POST /orders/:id/cancel` dành cho CUSTOMER và chủ đơn, cho phép PENDING/PAYMENT_FAILED/PAID → CANCELLED trước khi pha chế. Khóa cùng dòng order với payment admission; nếu còn payment PROCESSING trả 409 `PAYMENT_IN_PROGRESS`. Chuyển tiếp sai trả 409 `INVALID_ORDER_TRANSITION`, đơn không thuộc khách trả 404.

Hủy đơn chưa thanh toán hoàn đúng snapshot nguyên liệu ACTIVE và nhả coupon RESERVED trong cùng transaction. Hủy PAID không mô phỏng hoàn tiền, không hoàn lại nguyên liệu đã CONSUMED hoặc coupon/điểm đã ghi nhận; UI thông báo trước khi xác nhận. Đơn PREPARING/READY/COMPLETED không được khách hủy.

Xem thêm [API quản lý kho](staff-inventory.md) và [hướng dẫn nghiệm thu](../testing/staff-acceptance.md).

# SD-02 — Kiến trúc hệ thống BrewLite

Owner: Dev Khang. Reviewer: Dev Kiệt. Trạng thái: chờ xác nhận review độc lập. Foundation triển khai tại `apps/api/src/database`, [contract bổ sung tuần 1](./foundation-contract.md).

Đây là kiến trúc đích. Snapshot 22/10/2026: Auth/Catalog có runtime; Orders mới có pricing/DTO/mapper, Payments mới có gateway mock; inventory/promotions/loyalty chưa có service nghiệp vụ. Xem [truy vết](../traceability-matrix.md), [Class Diagram domain và lớp hiện có](./class-diagram.md), [Deployment Diagram](./deployment-diagram.md). Luồng checkout dưới đây chưa chạy xuyên suốt.

Đối chiếu bổ sung 24/10/2026, code `2bb2011`: Orders đã có create/history/detail, Payments có orchestration, Promotions có preview/quote/lock/reserve và Inventory có service/job. [CD-02](./class-diagram.md) ghi đúng các lớp/method, hai InventoryService khác đường dẫn và các điểm Prisma/loyalty chưa theo boundary đích. Không dùng snapshot lịch sử trên để kết luận code hiện tại còn stub; cũng chưa suy ra customer checkout E2E đã đạt. [AD-06](./sequence-diagram-create-order.md) là luồng đích end-to-end thống nhất SRS/UC-08.

## 1. Quyết định tổng thể

BrewLite dùng **modular monolith** cho backend và ứng dụng Next.js độc lập cho frontend. Trong từng module NestJS áp dụng kiến trúc phân lớp đơn giản **Controller -> Service -> Repository**. Cách này phù hợp quy mô bài tập, dễ phân công và dễ kiểm thử hơn một kiến trúc nhiều lớp trừu tượng.

- Frontend: Next.js App Router, TanStack Query cho server state; giỏ hiện dùng custom external store với `useSyncExternalStore` và localStorage.
- Backend: NestJS chia module theo nghiệp vụ; mỗi module có `controllers`, `services`, `repositories`, `mappers`, `dto`, `entities`.
- Database: PostgreSQL, truy cập qua Prisma.
- Payment: `PaymentService` gọi `PaymentGateway` interface; `MockPaymentGateway` là implementation mặc định.
- Giao tiếp: REST/JSON qua HTTPS; không truy cập trực tiếp database từ frontend.

```mermaid
flowchart LR
    U[Trình duyệt khách hàng] -->|HTTPS| FE[Next.js Web]
    FE -->|REST/JSON + JWT| API[NestJS API]
    API -->|Prisma / Transaction| DB[(PostgreSQL)]
    API -->|PaymentGateway port| PAY[Mock Payment Adapter]
    API -->|Log có cấu trúc| LOG[Console / log collector]
```

## 2. Cấu trúc monorepo đề xuất

```text
brewlite/
├─ apps/
│  ├─ web/                       # Next.js
│  │  └─ src/
│  │     ├─ app/                 # route, layout, page
│  │     ├─ features/            # catalog, cart, auth, checkout, orders
│  │     ├─ components/          # UI dùng chung
│  │     ├─ lib/                 # API client, auth, query client
│  │     └─ stores/              # Custom cart store
│  └─ api/                       # NestJS
│     ├─ src/
│     │  ├─ modules/             # module theo nghiệp vụ
│     │  │  └─ <module>/
│     │  │     ├─ controllers/   # HTTP, DTO, status code
│     │  │     ├─ services/      # nghiệp vụ và transaction
│     │  │     ├─ repositories/  # truy cập Prisma/PostgreSQL
│     │  │     ├─ mappers/       # Prisma record <-> Entity <-> Response DTO
│     │  │     ├─ dto/           # request/response DTO
│     │  │     └─ entities/      # model/enum nghiệp vụ
│     │  ├─ common/              # guard, filter, interceptor, pipe
│     │  ├─ config/              # validate biến môi trường
│     │  └─ main.ts
│     └─ prisma/                 # schema, migrations, seed
├─ packages/
│  ├─ contracts/                 # schema/type API công khai, không chứa nghiệp vụ backend
│  ├─ eslint-config/
│  └─ tsconfig/
├─ docs/
├─ compose.yaml
└─ .env.example
```

Không dùng chung trực tiếp Prisma model cho frontend. `packages/contracts` chỉ chứa enum/schema DTO công khai để tránh làm lộ cấu trúc persistence.

## 3. Kiến trúc backend theo module

### 3.1 Module nghiệp vụ

| Module | Trách nhiệm | Không được làm |
|---|---|---|
| `auth` | Đăng ký, đăng nhập, phát/xác minh token | Chứa logic đơn hàng |
| `users` | Hồ sơ, vai trò, số dư điểm đọc tối ưu | Tự tính điểm thưởng |
| `catalog` | Product, variant, topping, giá niêm yết | Tin giá do client gửi |
| `orders` | Tạo đơn, snapshot giá, state machine, lịch sử | Gọi repository của payment trực tiếp |
| `inventory` | Giữ/trừ/hoàn tồn kho bằng cập nhật có điều kiện | Quyết định trạng thái thanh toán |
| `payments` | Idempotency, payment attempt, gateway adapter | Sửa order không qua `OrderService` |
| `promotions` | Kiểm tra coupon, tính discount, redemption | Sửa bảng loyalty |
| `loyalty` | Ledger điểm, cộng/trừ điểm idempotent | Tính giá sản phẩm |

### 3.2 Controller -> Service -> Repository

```mermaid
flowchart TD
    HTTP[HTTP Request] --> C[Controller]
    C -->|DTO đã validate| S[Service]
    S -->|Query/Command dữ liệu| R[Repository]
    R -->|Prisma| DB[(PostgreSQL)]
    R -.->|record <-> entity| M[Mapper]
    S -.->|entity -> response DTO| M
    S -->|khi cần thanh toán| G[Mock Payment Gateway]
    DB --> R --> S --> C --> HTTPRES[HTTP Response]
```

Trách nhiệm từng lớp:

| Lớp | Trách nhiệm | Không được chứa |
|---|---|---|
| Controller | Route, auth/guard, đọc params/body, gọi service, map HTTP response | Business rule, Prisma query, transaction |
| Service | Điều phối nghiệp vụ, state machine, tính giá, transaction, gọi service module khác | Chi tiết HTTP hoặc serialize response thủ công |
| Repository | Đọc/ghi PostgreSQL qua Prisma, cập nhật tồn có điều kiện; gọi Mapper khi cần chuyển record | Quyết định nghiệp vụ hoặc trả HTTP exception |
| Mapper | Chuyển Prisma record sang Entity và Entity sang Response DTO | Truy vấn database, transaction hoặc business rule |
| DTO | Validate và mô tả contract request/response | Truy cập database |
| Entity/Enum | Cấu trúc và trạng thái nghiệp vụ dùng trong module | NestJS controller hoặc Prisma client |

Quy tắc phụ thuộc:

1. Luồng chuẩn là `Controller -> Service -> Repository -> Prisma`.
2. Controller không được inject Prisma hoặc repository trực tiếp.
3. Repository không gọi ngược Service và không ném `HttpException`; nó trả dữ liệu hoặc lỗi hạ tầng đã chuẩn hóa.
4. Module khác chỉ gọi public Service, không gọi Repository nội bộ.
5. Business rule phức tạp vẫn đặt trong Service hoặc pure helper/policy dưới `services`, không đặt trong Controller.
6. Transaction nhiều repository được mở và điều phối tại Service; repository nhận transaction client khi cần.
7. Mapper là helper thuần, không inject Repository/Service và không làm I/O.

Ví dụ luồng tạo đơn:

```text
OrdersController.create(dto, currentUser)
  -> OrdersService.createOrder(dto, currentUser.id)
     -> CatalogService.findActiveOptions(...)
     -> PromotionsService.quoteAndLock(..., tx)
     -> OrdersRepository.createOrderAndItems(..., tx)
     -> PromotionsService.reserve(..., orderId, tx)  # nếu có coupon
     -> InventoryService.reserve(..., orderId, tx)
  -> OrderResponseDto
```

Tên method trong ví dụ là contract đích; các thao tác dùng chung transaction. Order được insert trước redemption/reservation có FK orderId.

## 4. Kiến trúc frontend

| Loại state | Công cụ | Ví dụ |
|---|---|---|
| Server state | TanStack Query | menu, chi tiết, lịch sử đơn |
| Client state lâu hơn một page | Custom external store + localStorage | giỏ hàng; `stores/cart-store.ts` |
| Form state | React state và validation hiện có | đăng nhập/đăng ký; checkout chưa triển khai |
| Auth | Session store + localStorage; xác minh lại qua /auth/me | access token, tự hết phiên/401/logout; chưa có refresh token |

Cookie HttpOnly/refresh token là phương án cải thiện sau, chưa phải cơ chế đang chạy. Zustand và React Hook Form không có trong dependencies hiện tại; không dùng tên thư viện dự kiến để mô tả implementation.

Mỗi `feature` chứa component, hook, query key, API function và test của chính nghiệp vụ đó. Route trong `app/` chỉ compose feature, tránh đặt business rule trong page component.

Luồng request:

```mermaid
sequenceDiagram
    actor C as Khách hàng
    participant W as Next.js
    participant A as NestJS
    participant D as PostgreSQL
    C->>W: Chọn món/size/topping/đường/đá
    W->>A: POST /orders (JWT)
    A->>D: Transaction: giá + coupon + giữ tồn + tạo order
    D-->>A: Order PENDING
    A-->>W: Mã đơn và tổng tiền chuẩn
    W->>A: POST /payments + Idempotency-Key
    A->>D: Tạo/đọc payment attempt theo key
    A->>A: Gọi MockPaymentGateway
    A->>D: Transaction: payment + order + loyalty + reservation
    A-->>W: Kết quả thanh toán
    W-->>C: Trang xác nhận
```

## 5. Luồng tạo đơn và giữ tồn kho

`POST /orders` chạy trong một transaction ngắn:

1. Xác thực user và kiểm tra giỏ không rỗng.
2. Đọc variant/topping đang hoạt động và tính giá server-side.
3. Kiểm tra/khóa coupon nếu có, tính `subtotal`, `discountAmount`, `total`; chưa insert redemption trước khi có Order.
4. Insert `Order(PENDING)`, `OrderItem` (snapshot cả `sugarLevel`/`iceLevel`) và `OrderItemTopping` trước các bản ghi có FK orderId; sau đó mới tạo coupon redemption RESERVED. Kiểm tra coupon ở bước 3 mới là quote/lock, chưa insert redemption.
5. Với từng variant theo thứ tự ID ổn định, trừ tồn bằng cập nhật nguyên tử với điều kiện `version = expectedVersion AND stock >= quantity`, tăng `version` và tạo `InventoryReservation`; ghi `OrderStatusHistory` trước commit. Khi xung đột còn hàng thì retry toàn transaction có giới hạn; hết hàng không retry. Đường/đá là phần trăm nguyên 0..100 hoặc null (công thức chuẩn), không đổi giá. Tách dòng khi khác tùy chọn, tổng hợp quantity theo variant khi giữ tồn.
   `OrderItem.note` là ghi chú nullable tối đa 500 ký tự sau trim, snapshot và trả cho khách/barista. Giỏ persist note, khác note giữ dòng riêng; không phụ thu và reservation vẫn tổng hợp theo variant.
6. Commit rồi trả order `PENDING`.

Không giữ transaction trong khi gọi payment gateway. Nếu gateway chậm, kết nối database không bị chiếm giữ.

## 6. Luồng thanh toán idempotent

1. Chuẩn hóa payload và tính `requestHash`.
2. Tìm `Payment` theo `idempotencyKey`.
3. Nếu đã tồn tại:
   - cùng hash: trả nguyên kết quả đã lưu;
   - khác hash: trả `409 IDEMPOTENCY_KEY_REUSED`.
4. Nếu chưa tồn tại, tạo payment `PROCESSING` với unique key. Race do hai request đồng thời được unique constraint chặn; request thua đọc lại bản ghi đã thắng.
5. Gọi mock gateway ngoài transaction.
6. Trong transaction mới, khóa/kiểm tra order, cập nhật payment và transition order đúng một lần.
7. Khi thành công: payment `SUCCEEDED`, order `PENDING -> PAID`, consume inventory reservation, chuyển coupon redemption `RESERVED -> CONSUMED` (nếu có), ghi lịch sử và cộng loyalty với partial unique `(order_id, type)` chỉ cho `EARN` có order.
8. Khi thất bại: chuyển `PAYMENT_FAILED`; inventory/coupon reservation được giữ trong thời gian retry và được release/expire nếu order hủy hoặc quá hạn.

## 7. Nhất quán và lỗi

- Các thay đổi bắt buộc đồng bộ trong cùng PostgreSQL được gói trong transaction.
- Tác vụ có thể lặp lại đều có khóa idempotency hoặc unique business key.
- Cập nhật tồn so sánh `version` và kiểm tra `stock >= quantity`, đồng thời tăng version; chỉ transaction trừ tồn thành công mới tạo reservation. Hoàn tồn cũng tăng version và gắn với transition reservation đúng một lần.
- HTTP status chỉ là lớp vận chuyển; response luôn có `error.code`, `message`, `details`, `requestId`.
- Không trả stack trace/Prisma error cho client.
- Với MVP, xử lý nội bộ chạy đồng bộ trong Service. Nếu tích hợp dịch vụ thật, bổ sung transactional outbox thay vì phát message trước khi commit.

## 8. Chiến lược kiểm thử

| Cấp | Phạm vi bắt buộc |
|---|---|
| Unit | `assertTransition`, pricing, coupon policy, loyalty calculation |
| Integration | Prisma repository, transaction giữ/hoàn tồn, idempotency concurrent |
| API/e2e | register -> login -> order -> payment -> history |
| Frontend component | menu states, cart calculation, payment error/success |

Ba test chấm điểm Task 10 phải có: transition sai bị chặn; hai request cùng idempotency key chỉ có một payment thành công; nhiều request concurrent không làm stock âm.

## 9. Khả năng mở rộng

- Payment thật: thêm implementation mới cho `PaymentGateway`, giữ nguyên cách gọi trong `PaymentService`.
- Nhiều chi nhánh: thêm `Store`, `InventoryBalance` theo `storeId`.
- Tồn kho nguyên liệu: thay stock trên variant bằng `Ingredient`, `Recipe`, `InventoryBalance` mà không đổi hợp đồng order.
- Real-time: phát `OrderStatusChanged` qua outbox và WebSocket/SSE.
- Tách service chỉ khi có nhu cầu scale/ownership độc lập; ranh giới module hiện tại là ứng viên tách tự nhiên.

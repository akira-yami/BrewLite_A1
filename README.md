# BrewLite

BrewLite là ứng dụng web đặt đồ uống và thanh toán không tiền mặt, được xây dựng cho bài tập lớn môn Công nghệ Phần mềm. Sản phẩm hướng tới luồng đặt món nhanh tại quầy: xem menu, chọn size/topping, quản lý giỏ hàng, đăng nhập, tạo đơn, thanh toán và theo dõi trạng thái.

> Trạng thái hiện tại: có scaffold Next.js/NestJS, schema Prisma tổng thể, migration, PrismaService và readiness kiểm tra PostgreSQL. Module nghiệp vụ sẽ được triển khai theo Sprint Backlog. [Contract foundation](./docs/architecture/foundation-contract.md).

## Công nghệ dự kiến

| Thành phần | Công nghệ |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Quản lý state | TanStack Query, Zustand |
| Backend | NestJS, TypeScript, REST API |
| Database | PostgreSQL |
| ORM | Prisma |
| Xác thực | JWT, Passport, bcrypt |
| Validation | `class-validator` |
| Thanh toán | Mock Payment Gateway |
| DevOps | Docker Compose |

## Kiến trúc

Backend sử dụng modular monolith. Mỗi module tuân theo luồng:

```text
Controller -> Service -> Repository -> Prisma -> PostgreSQL
```

- **Controller**: nhận HTTP request, guard, DTO và HTTP response.
- **Service**: xử lý nghiệp vụ, state machine và điều phối transaction.
- **Repository**: truy cập PostgreSQL qua Prisma.
- **Mapper**: chuyển Prisma record sang Entity và Entity sang Response DTO.
- **DTO**: validate hợp đồng request/response.
- **Entity**: biểu diễn dữ liệu và enum nghiệp vụ trong module.

Mapper là helper thuần, không phải một tầng riêng; mapper không truy vấn database và không chứa business rule.

## Cây thư mục

```text
BrewLite/
├─ apps/
│  ├─ web/                         # Ứng dụng Next.js
│  │  ├─ public/
│  │  ├─ src/
│  │  │  ├─ app/                   # Route, layout, page
│  │  │  ├─ components/            # UI dùng chung
│  │  │  ├─ features/              # auth, cart, catalog, checkout, orders
│  │  │  ├─ lib/                   # API client, auth, query client
│  │  │  └─ stores/                # Zustand stores
│  │  └─ tests/
│  └─ api/                         # Ứng dụng NestJS
│     ├─ prisma/
│     │  └─ migrations/
│     ├─ src/
│     │  ├─ common/                # Guard, filter, interceptor, pipe, error
│     │  ├─ config/
│     │  ├─ database/              # PrismaModule/PrismaService, transaction utility
│     │  └─ modules/
│     │     └─ <module>/
│     │        ├─ controllers/
│     │        ├─ services/
│     │        ├─ repositories/
│     │        ├─ mappers/
│     │        ├─ dto/
│     │        └─ entities/
│     │
│     │     # Riêng payments có gateways/, inventory có jobs/ khi triển khai
│     └─ test/
├─ packages/
│  ├─ contracts/                   # Contract/type dùng chung
│  ├─ eslint-config/
│  └─ tsconfig/
├─ tests/e2e/
├─ scripts/
└─ docs/
```

## Module backend

| Module | Trách nhiệm |
|---|---|
| `auth` | Đăng ký, đăng nhập và JWT |
| `users` | Tài khoản, vai trò và thông tin khách hàng |
| `catalog` | Sản phẩm, size, topping và giá niêm yết |
| `orders` | Tạo đơn, snapshot giá và state machine |
| `inventory` | Giữ, trừ, hoàn tồn kho và optimistic locking |
| `payments` | Payment attempt, idempotency và mock gateway |
| `promotions` | Coupon, điều kiện áp dụng và redemption |
| `loyalty` | Sổ giao dịch và số dư điểm thưởng |

## Chức năng MVP

- Hiển thị menu và chi tiết sản phẩm.
- Chọn size, topping, mức đường và đá.
- Thêm, sửa số lượng và xóa sản phẩm trong giỏ.
- Đăng ký, đăng nhập bằng JWT.
- Tạo đơn với giá được tính lại ở backend.
- Thanh toán Ví/Thẻ qua mock gateway.
- Chống xử lý thanh toán lặp bằng `Idempotency-Key`.
- Kiểm soát tồn kho khi nhiều khách đặt đồng thời.
- Áp dụng coupon và cộng điểm thưởng đúng một lần.
- Hiển thị xác nhận và lịch sử đơn hàng.

## Trạng thái đơn hàng

```text
PENDING -> PAID -> PREPARING -> READY -> COMPLETED
PENDING -> PAYMENT_FAILED -> PENDING (retry)
PENDING -> CANCELLED
PAYMENT_FAILED -> CANCELLED
PAID -> CANCELLED (trước khi nhận pha)
```

Mọi chuyển trạng thái phải đi qua `OrderService` và được ghi vào lịch sử trạng thái. `COMPLETED` và `CANCELLED` là trạng thái kết thúc. Chủ đơn được hủy từ PENDING/PAYMENT_FAILED/PAID khi hợp lệ; hủy từ PAID giữ giao dịch thành công và không hoàn tiền giả lập. Barista thực hiện các bước pha chế. Role tài khoản chỉ có `CUSTOMER` (user/khách hàng) và `BARISTA`; Mock Payment Gateway là tác nhân tích hợp.

## Tài liệu

- [Mục lục tài liệu](./docs/README.md)
- [Phân tích đề bài](./docs/phan-tich-de-bai.md)
- [Kiến trúc hệ thống](./docs/architecture/system-architecture.md)
- [ERD](./docs/architecture/erd.md)
- [Đặc tả entity](./docs/architecture/entities.md)
- [Thiết kế cơ sở dữ liệu](./docs/architecture/database-design.md)
- [Đặc tả REST API](./docs/architecture/api-spec.md)
- [Thiết kế bảo mật](./docs/architecture/security.md)
- [Các quyết định kiến trúc](./docs/decisions/ADR-001-project-architecture.md)
- [Product Backlog](./docs/scrum/product-backlog.md)
- [Kế hoạch 3 Sprint](./docs/scrum/sprint-01.md)
- [Chiến lược kiểm thử](./docs/testing/test-strategy.md)

## Khởi chạy dự án

Chạy toàn bộ stack bằng:

```bash
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
# Điền secret vừa tạo vào JWT_SECRET trong .env trước khi chạy Compose.
docker compose up --build
```

Compose chạy service `migrate` trước backend. Kiểm tra trạng thái bằng `docker compose ps -a`; `migrate` phải exit 0, các service còn lại healthy. Frontend chạy tại `http://localhost:3000`, backend tại `http://localhost:3001/api/v1` và health endpoint là `http://localhost:3001/api/v1/health`.

`JWT_SECRET` bắt buộc và không có giá trị mặc định. Compose dừng ngay nếu biến thiếu hoặc rỗng; mỗi môi trường cần secret riêng. Không commit file `.env` thật.

Khi chạy trực tiếp trên host, tạo database PostgreSQL rồi làm theo [README API](./apps/api/README.md): dùng `apps/api/.env.example` với hostname `localhost`, chạy migrate trước start. Root `.env.example` dùng hostname `postgres` cho Compose.

## CI trên GitHub Actions

Workflow `.github/workflows/ci.yml` chạy khi push, mở/cập nhật pull request hoặc chạy thủ công từ tab **Actions**. Các job dùng Node.js 24, cài dependencies bằng `npm ci` và cache npm theo lockfile của từng app:

- **Frontend:** lint, typecheck, test giỏ hàng và build Next.js.
- **Backend:** generate Prisma client, lint, typecheck, unit test, API E2E test và build NestJS. Bộ API E2E hiện kiểm tra health endpoint bằng Prisma mock.
- **Database migrations and integration:** PostgreSQL 18 riêng cho mỗi lần chạy; validate/generate Prisma, apply migration hai lần để kiểm tra chạy lặp, kiểm tra migration status và chạy integration test với database thật.

CI dùng database tạm `brewlite_foundation_smoke_ci` với thông tin kết nối riêng, không cần cấu hình repository secrets. Sau khi đưa workflow lên GitHub, có thể chọn ba job trên làm required checks trong ruleset/branch protection.

## Quy ước phát triển

`OrderItem.note` là ghi chú món tùy chọn, tối đa 500 ký tự sau trim; thiếu/rỗng thành null. UI nhập và hiển thị ghi chú, giỏ persist và tách dòng khác ghi chú; DTO/mapper giữ cùng snapshot, không thay đổi giá. Migration bổ sung riêng giữ đơn cũ với note null.

`OrderItem` có `sugarLevel` và `iceLevel` nullable (cột `sugar_level`, `ice_level`): số nguyên 0..100, null/không gửi dùng công thức chuẩn, 0 là không đường/đá. UI cung cấp chuẩn/0/25/50/75/100%; lựa chọn không đổi giá và dòng khác tùy chọn được giữ riêng. Giỏ cũ thiếu trường vẫn được đọc với null. Schema, migration, DTO/mapper và giỏ đã hỗ trợ; API tạo đơn/checkout/barista tiếp tục triển khai theo [hợp đồng API](./docs/architecture/api-spec.md).

- Backend không tin giá, tổng tiền, user ID hoặc trạng thái do frontend gửi.
- Tiền lưu bằng số nguyên theo đơn vị VND; không dùng số thực.
- Thời gian lưu UTC bằng PostgreSQL `timestamptz`.
- Controller không gọi Prisma/Repository trực tiếp và không chứa business rule.
- Module khác chỉ gọi public Service, không truy cập Repository nội bộ.
- Transaction nhiều Repository được điều phối tại Service.
- Mapper không thực hiện I/O và không gọi Service/Repository.
- API thay đổi phải cập nhật DTO, OpenAPI và tài liệu liên quan.
- Migration được lưu trong source control; không sửa migration đã chạy trên môi trường chung.

## Kiểm thử bắt buộc cho nghiệp vụ nâng cao

- Chặn chuyển trạng thái đơn không hợp lệ.
- Hai request cùng `Idempotency-Key` chỉ tạo một kết quả thanh toán.
- Nhiều request tạo đơn đồng thời không làm tồn kho âm.
- Coupon không vượt giới hạn và điểm thưởng chỉ được cộng một lần trên mỗi đơn.

## Lộ trình triển khai

1. Scaffold monorepo, Next.js, NestJS và cấu hình dùng chung.
2. Tạo Prisma schema, migration và dữ liệu seed.
3. Xây dựng catalog API và giao diện menu.
4. Hoàn thiện giỏ hàng, auth và tạo đơn.
5. Thêm payment idempotency, state machine, inventory, coupon và loyalty.
6. Viết unit/integration/e2e test.
7. Hoàn thiện Docker Compose, README chạy thật và demo bàn giao.

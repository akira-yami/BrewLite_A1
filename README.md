# BrewLite

BrewLite là ứng dụng web đặt đồ uống và thanh toán không tiền mặt, được xây dựng cho bài tập lớn môn Công nghệ Phần mềm. Sản phẩm hướng tới luồng đặt món nhanh tại quầy: xem menu, chọn size/topping, quản lý giỏ hàng, đăng nhập, tạo đơn, thanh toán và theo dõi trạng thái.

## Báo cáo Nhóm 7

- [Đọc báo cáo PDF](BrewLite-Report/report/build/main.pdf).
- [Mã nguồn LaTeX và hướng dẫn biên dịch](BrewLite-Report/report/README.md).
- [Phân công và hồ sơ kiểm chứng](docs/scrum/team-assignment-analysis-2026-11-03.md); [audit ngày 03/11/2026](docs/scrum/trello-audit-2026-11-03.md).

Báo cáo được đối chiếu với dự án ngày 03/11/2026; các yêu cầu và số liệu kiểm thử trong đó cần đọc cùng hiện trạng và giới hạn được nêu trong báo cáo.

## Gói bàn giao tài liệu Assignment 2

Tài liệu và sơ đồ A2 đã được chuyển vào các thư mục ở gốc theo sheet `Assignment 2` và `SO_DO` của bảng phân công. Mỗi gói có README ghi task, file gốc, tài liệu phối hợp và phần còn thiếu:

- [Khang-A2](Khang-A2/README.md): yêu cầu chung, kiến trúc/ERD, Orders, Class/Activity, deployment và truy vết.
- [Huy-A2](Huy-A2/README.md): Auth/JWT/RBAC và bảo mật.
- [Hoang-A2](Hoang-A2/README.md): phân công Catalog/Inventory, tham chiếu dùng chung và các sơ đồ chưa có tệp độc lập.
- [Kiet-A2](Kiet-A2/README.md): Payment/Retry/Idempotency và Coupon.
- [Khai-A2](Khai-A2/README.md): wireflow giao diện khách hàng và phân công frontend/E2E.

[Danh sách chuyển file và hash](Khang-A2/handover-manifest.json) ghi nguồn trước khi chuyển. `docs/` giữ tài liệu API thực thi, Scrum, review và bằng chứng A1; các liên kết thiết kế dùng chung trỏ tới gói người phụ trách. Đây là gói tham khảo đang được bàn giao, không xác nhận hoàn thành A2.

> Cập nhật Orders tuần 3 ngày 23/10/2026: đã có `POST /orders`, `GET /orders/me`, `GET /orders/:id`, snapshot đường/đá/ghi chú, transaction giữ tồn và kiểm tra quyền sở hữu. Xem [API và cách kiểm chứng Orders](docs/api/orders-week3.md). [Bản bàn giao có commit, ngày giờ và log kiểm thử](docs/scrum/khang-week3-handoff.md). Nút đặt/thanh toán trên giao diện giỏ hàng chưa được nối vào toàn bộ luồng checkout.

## Công nghệ và hiện trạng

| Thành phần | Công nghệ |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Quản lý state | TanStack Query; giỏ hàng dùng custom store với `useSyncExternalStore` và localStorage |
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
│  │  │  └─ stores/                # Custom cart store
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
├─ Khang-A2/
├─ Huy-A2/
├─ Hoang-A2/
├─ Kiet-A2/
├─ Khai-A2/
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

Đây là phạm vi cần nghiệm thu. Trạng thái từng yêu cầu nằm trong [ma trận truy vết](Khang-A2/docs/traceability-matrix.md); danh sách này không có nghĩa mọi chức năng đã hoàn thành.

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

- [Mục lục tài liệu](docs/README.md)
- [Phân tích đề bài](Khang-A2/docs/phan-tich-de-bai.md)
- [Truy vết yêu cầu A1/A2, code, test và review](Khang-A2/docs/traceability-matrix.md)
- [Tiến độ thực tế ngày 22/10/2026](docs/scrum/progress-report.md)
- [Kiến trúc hệ thống](Khang-A2/docs/architecture/system-architecture.md)
- [Class Diagram](Khang-A2/docs/architecture/class-diagram.md)
- [Deployment Diagram và khoảng trống production](Khang-A2/docs/architecture/deployment-diagram.md)
- [ERD](docs/architecture/erd.md)
- [Đặc tả entity](Khang-A2/docs/architecture/entities.md)
- [Thiết kế cơ sở dữ liệu](Khang-A2/docs/architecture/database-design.md)
- [Đặc tả REST API](Khang-A2/docs/architecture/api-spec.md)
- [Thiết kế bảo mật](Huy-A2/docs/architecture/security.md)
- [Các quyết định kiến trúc](Khang-A2/docs/decisions/ADR-001-project-architecture.md)
- [Product Backlog](docs/scrum/product-backlog.md)
- [Kế hoạch 3 Sprint](docs/scrum/sprint-01.md)
- [Chiến lược kiểm thử](Khang-A2/docs/testing/test-strategy.md)

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

Khi chạy trực tiếp trên host, tạo database PostgreSQL rồi làm theo [README API](apps/api/README.md): dùng `apps/api/.env.example` với hostname `localhost`, chạy migrate trước start. Root `.env.example` dùng hostname `postgres` cho Compose.

## CI trên GitHub Actions

Workflow `.github/workflows/ci.yml` chạy khi push, mở/cập nhật pull request hoặc chạy thủ công từ tab **Actions**. Các job dùng Node.js 24, cài dependencies bằng `npm ci` và cache npm theo lockfile của từng app:

- **Frontend:** lint, typecheck, test giỏ hàng và build Next.js.
- **Backend:** generate Prisma client, lint, typecheck, unit test, API E2E test và build NestJS. Bộ API E2E hiện kiểm tra readiness và JWT/RBAC/ownership trên route Auth bằng provider mock; không phải E2E đặt hàng/thanh toán.
- **Database migrations and integration:** PostgreSQL 18 riêng cho mỗi lần chạy; validate/generate Prisma, apply migration hai lần để kiểm tra chạy lặp, kiểm tra migration status và chạy integration test với database thật.
- **Documentation:** kiểm tra liên kết tài liệu, nguồn/SVG/PNG qua manifest, enum Prisma và danh mục tạo phẩm A2 Task 1–3; chạy bằng `node scripts/check-docs.mjs`.

CI dùng database tạm `brewlite_foundation_smoke_ci` với thông tin kết nối riêng, không cần cấu hình repository secrets. Ruleset `BrewLite CI quality gate` bắt buộc cả bốn job đạt trên main, strict và không có bypass actor; xem [snapshot GitHub và run pass/fail](Khang-A2/docs/deployment/ci-quality-gates.md). Cấu hình YAML không tự thiết lập rule trên GitHub. Repo hiện có CI, chưa có workflow CD. Xem [kế hoạch bàn giao](Khang-A2/docs/deployment/release-checklist.md) và [quy trình version tài liệu](Khang-A2/docs/document-control.md).

## Quy ước phát triển

`OrderItem.note` là ghi chú món tùy chọn, tối đa 500 ký tự sau trim; thiếu/rỗng thành null. UI nhập và hiển thị ghi chú, giỏ persist và tách dòng khác ghi chú; DTO/mapper giữ cùng snapshot, không thay đổi giá. Migration bổ sung riêng giữ đơn cũ với note null.

`OrderItem` có `sugarLevel` và `iceLevel` nullable (cột `sugar_level`, `ice_level`): số nguyên 0..100, null/không gửi dùng công thức chuẩn, 0 là không đường/đá. UI cung cấp chuẩn/0/25/50/75/100%; lựa chọn không đổi giá và dòng khác tùy chọn được giữ riêng. Giỏ cũ thiếu trường vẫn được đọc với null. Schema, migration, DTO/mapper và giỏ đã hỗ trợ; API tạo đơn/checkout/barista tiếp tục triển khai theo [hợp đồng API](Khang-A2/docs/architecture/api-spec.md).

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

# BrewLite

**Ứng dụng đặt đồ uống và thanh toán không tiền mặt — Bài tập lớn môn Công nghệ Phần mềm, Nhóm 7, Trường Đại học Sài Gòn.**

BrewLite hỗ trợ khách chọn đồ uống, tùy chỉnh món, đặt hàng, thanh toán qua VNPay và theo dõi đơn. Barista sử dụng quầy nhân viên để nhận đơn, cập nhật tiến độ pha chế, tra cứu tồn nguyên liệu và công thức. Máy chủ chịu trách nhiệm tính giá, giữ nguyên liệu, quản lý coupon và ghi nhận điểm thưởng.

Giảng viên hướng dẫn: **Từ Lãng Phiêu**. Phạm vi báo cáo Assignment 01 gồm 15 User Story, 17 yêu cầu chức năng và 8 yêu cầu phi chức năng.

[Hướng dẫn khởi chạy](#khởi-chạy-bằng-docker-compose) · [Tài khoản demo](#tài-khoản-demo) · [Kiểm thử](#kiểm-thử) · [Minh chứng NFR](#minh-chứng-yêu-cầu-phi-chức-năng) · [Tài liệu bàn giao](#tài-liệu-bàn-giao)

## Thành viên và phân công

| Thành viên | MSSV | Phụ trách chính |
| --- | --- | --- |
| Phan Anh Khang | 3124410145 | Nhóm trưởng; nền tảng, Orders, tích hợp, giao diện Barista và kho |
| Đoàn Quang Khải | 3124410138 | Chi tiết sản phẩm, giỏ hàng, checkout và lịch sử đơn |
| Nguyễn Huy Hoàng | 3124410105 | Catalog, dữ liệu mẫu và nghiệp vụ tồn kho |
| Huỳnh Thái Kiệt | 3124410172 | Thanh toán phía máy chủ, idempotency, coupon và hoàn tiền |
| Đỗ Mạnh Huy | 3124410113 | Xác thực, phân quyền và điểm thưởng |

Phân công theo thẻ công việc và các sprint nằm trong [Sprint Backlog](docs/scrum/phan-cong.md) và [hồ sơ Scrum](docs/scrum/README.md).

## Chức năng

| Nhóm chức năng | Nội dung | Yêu cầu Assignment 01 |
| --- | --- | --- |
| Thực đơn và tùy chỉnh | Menu từ API; chọn size, topping, đường, đá và ghi chú; hiển thị khả năng phục vụ theo nguyên liệu | FR-01, FR-02 |
| Giỏ hàng | Thêm, sửa, xóa món; tính tạm tính; tách dòng khác tùy chọn và khôi phục giỏ sau khi tải lại | FR-03 |
| Tài khoản | Đăng ký, đăng nhập bằng JWT, đăng xuất trên trình duyệt và xử lý phiên hết hạn | FR-04 |
| Đặt hàng | Tính giá tại máy chủ, lưu snapshot, giữ nguyên liệu/coupon trong cùng giao dịch và chống bán vượt tồn | FR-05, FR-06 |
| Thanh toán và theo dõi | Tạo liên kết VNPay, tra cứu kết quả, tiếp tục hoặc thử lại đơn còn hạn; xem xác nhận và đơn của mình | FR-07, FR-08 |
| Coupon và điểm thưởng | Kiểm tra điều kiện coupon, quản lý lượt sử dụng; cộng điểm một lần khi đơn PAID | FR-09, FR-10 |
| Vòng đời đơn | Hủy đơn chưa thanh toán khi hợp lệ, tự xử lý hết hạn, kiểm soát chuyển trạng thái và ghi lịch sử | FR-11, FR-12, FR-13 |
| Quầy Barista | Hàng đợi đơn, cập nhật pha chế/giao món; tra cứu kho và công thức ở chế độ chỉ đọc | FR-14, FR-15, FR-16 |
| Đổi điểm | Xem số dư, sổ điểm, voucher cá nhân; đổi điểm lấy voucher dùng một lần | FR-17 |

Mã nguồn còn có luồng khách gửi yêu cầu hoàn đơn đã thanh toán và Barista xét duyệt trước khi nhận pha. Khoản hoàn được ghi thành điểm Loyalty/store credit theo nghiệp vụ của ứng dụng. Đây là phần mở rộng, không phải hoàn tiền về tài khoản ngân hàng qua VNPay.

## Công nghệ và kiến trúc

| Thành phần | Công nghệ |
| --- | --- |
| Web | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Dữ liệu phía trình duyệt | TanStack Query; giỏ hàng dùng custom store, `useSyncExternalStore` và localStorage |
| API | NestJS, TypeScript, REST với tiền tố `/api/v1` |
| Cơ sở dữ liệu | PostgreSQL 18, Prisma ORM và migrations |
| Xác thực và kiểm tra đầu vào | JWT, Passport, bcrypt, `class-validator` |
| Thanh toán | VNPay; gateway mô phỏng phục vụ các bộ kiểm thử |
| Kiểm thử | Vitest, Supertest, Node Test Runner, Playwright, Postman/Newman |
| Đóng gói và CI | Docker Compose, GitHub Actions |

Backend là **modular monolith**, chia theo nghiệp vụ:

```text
Web Next.js -> REST API NestJS
                 Controller -> Service -> Repository -> Prisma -> PostgreSQL
```

Controller tiếp nhận request, kiểm tra quyền và DTO. Service điều phối nghiệp vụ, transaction và chuyển trạng thái. Repository truy cập dữ liệu; mapper chuyển dữ liệu sang response mà không thực hiện I/O. Các module chính gồm `auth`, `users`, `catalog`, `orders`, `inventory`, `payments`, `promotions` và `loyalty`.

```text
BrewLite/
├── apps/
│   ├── api/
│   │   ├── prisma/             # Schema, migrations và seed
│   │   ├── src/modules/        # Các module nghiệp vụ NestJS
│   │   └── test/               # Unit, HTTP E2E và integration
│   └── web/
│       ├── src/app/            # Các trang Next.js
│       ├── src/features/       # Chức năng phía web
│       └── tests/              # Unit và Playwright E2E
├── database/                   # ERD và bản xuất sơ đồ
├── docs/                       # Kiến trúc, Scrum, kiểm thử và minh chứng
├── postman/                    # Collection và environment mẫu
├── scripts/                    # Kiểm tra tài liệu, seed tải và benchmark
├── .github/workflows/          # CI và cloud smoke
├── compose.yaml
└── .env.example
```

## Khởi chạy bằng Docker Compose

### 1. Chuẩn bị môi trường

Cài Git và Docker Desktop có Docker Compose, khởi động Docker Desktop, rồi mở PowerShell tại thư mục gốc dự án. Node.js **24.x** và npm cần thiết khi chạy trực tiếp hoặc chạy kiểm thử trên máy.

Với lần thiết lập đầu tiên:

```powershell
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Điền chuỗi vừa tạo vào `JWT_SECRET` trong `.env`. Kiểm tra `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` và `DATABASE_URL_DOCKER` khớp nhau. URL dành cho Compose sử dụng hostname `postgres`; các ứng dụng chạy trên máy sử dụng `localhost` và cổng PostgreSQL được công bố.

Nếu máy đã dùng cổng 5432, đổi `POSTGRES_PORT` trong `.env`, ví dụ thành `55432`. PostgreSQL bên trong mạng Compose vẫn dùng cổng 5432. Giữ file `.env` hiện có nếu đã cấu hình; không ghi đè khi chạy lại hướng dẫn.

### 2. Dựng stack và seed dữ liệu

```powershell
docker compose up -d --build
docker compose --profile demo run --rm seed
docker compose ps -a
```

Compose đợi PostgreSQL sẵn sàng, chạy service `migrate`, rồi mới khởi động backend và frontend. Trạng thái mong đợi: `migrate` thoát mã `0`; `postgres`, `backend`, `frontend` báo `healthy`. Service seed bổ sung catalog, nguyên liệu, công thức và tài khoản demo; không tạo đơn hàng giả.

| Địa chỉ mặc định | Nội dung |
| --- | --- |
| `http://localhost:3000` | Web BrewLite |
| `http://localhost:3000/menu` | Thực đơn |
| `http://localhost:3000/barista` | Quầy nhân viên, yêu cầu tài khoản Barista |
| `http://localhost:3001/api/v1` | API |
| `http://localhost:3001/api/v1/health` | Kiểm tra API và kết nối cơ sở dữ liệu |

Nếu thay cổng web/API, cập nhật đồng thời các biến URL và origin trong `.env`. Xem log bằng `docker compose logs -f backend frontend`; dừng stack bằng `docker compose down`. Lệnh dừng thông thường giữ volume dữ liệu PostgreSQL.

### 3. Cấu hình thanh toán VNPay

VNPay tắt mặc định trong cấu hình mẫu. Stack có thể khởi động để xem menu và đăng nhập; thanh toán cần thông tin merchant hợp lệ và cấu hình callback.

| Biến | Mục đích |
| --- | --- |
| `VNPAY_ENABLED` | Đặt `true` để bật VNPay |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` | Mã merchant và khóa ký do VNPay cấp |
| `VNPAY_PAYMENT_URL` | Địa chỉ trang thanh toán Sandbox hoặc production tương ứng |
| `VNPAY_RETURN_URL` | Đường dẫn API `/api/v1/payments/vnpay/return` |
| `VNPAY_IPN_URL` | Đường dẫn API `/api/v1/payments/vnpay/ipn`, có thể được VNPay truy cập |
| `VNPAY_QUERY_URL`, `VNPAY_QUERY_SERVER_IP` | Cấu hình đối soát QueryDr khi hạ tầng hỗ trợ |

Callback IPN được kiểm tra chữ ký và số tiền trước khi ghi nhận thanh toán. Trang Return phục vụ điều hướng/truy vấn kết quả, không tự xác nhận đơn đã thanh toán. Sau khi sửa biến runtime, chạy lại `docker compose up -d`. Chi tiết nằm trong [README API](apps/api/README.md).

## Chạy trực tiếp để phát triển

Chuẩn bị PostgreSQL và tạo database trước. Có thể dùng PostgreSQL cài trên máy hoặc chạy riêng service `postgres` của Compose. Không chạy đồng thời hai PostgreSQL trên cùng cổng.

```powershell
npm.cmd ci --prefix apps/api
npm.cmd ci --prefix apps/web
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Chỉ sao chép cấu hình khi chưa có file môi trường. Sửa `apps/api/.env`: `DATABASE_URL` trỏ đúng database/cổng đang chạy, `JWT_SECRET` là secret riêng và `WEB_ORIGIN=http://localhost:3000`. Web dùng `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1` trong `apps/web/.env.local`.

```powershell
npm.cmd --prefix apps/api run prisma:generate
npm.cmd --prefix apps/api run prisma:deploy
Push-Location apps/api
try { node --import=tsx prisma/seed-demo.ts } finally { Pop-Location }
```

Mở hai cửa sổ PowerShell tại thư mục gốc:

```powershell
# Cửa sổ 1: giữ API chạy
npm.cmd run dev:api
```

```powershell
# Cửa sổ 2: giữ web chạy
npm.cmd run dev:web
```

Lỗi Prisma `P1001` là không kết nối được PostgreSQL tại URL đã chọn; cần kiểm tra service và cổng trước khi migrate hoặc seed. Lỗi benchmark `ECONNREFUSED` tới API thường xảy ra khi API chưa chạy hoặc `API_BASE_URL` sai cổng.

## Tài khoản demo

| Vai trò | Tên đăng nhập | Mật khẩu demo |
| --- | --- | --- |
| Khách hàng | `customer01` | `Customer@123` |
| Barista | `barista01` | `Barista@123` |

Seed còn tạo `operator01` / `Operator@123` cho vai trò kỹ thuật `PAYMENT_OPERATOR`, phục vụ API đối soát thanh toán. Hai vai trò chính trong luồng khách hàng và quầy nhân viên của báo cáo là Customer và Barista. Các tài khoản trên dành cho môi trường trình diễn; mật khẩu lưu trong DB dưới dạng bcrypt.

Luồng demo: đăng nhập Customer → chọn món và tùy chọn → giỏ hàng → nhập coupon nếu có → tạo đơn/thanh toán → xem xác nhận, đơn và điểm thưởng. Đăng nhập Barista ở phiên trình duyệt khác để xem đơn PAID, nhận pha, đánh dấu sẵn sàng và hoàn tất giao món. Khi demo thanh toán, chuẩn bị cấu hình VNPay trước.

## Quy tắc nghiệp vụ chính

- Giá, tổng tiền và chủ đơn được xác định tại máy chủ. Snapshot lưu tên món, giá, size, topping, đường/đá và ghi chú tại thời điểm đặt.
- Tồn kho được quản lý ở **nguyên liệu**, theo công thức món và topping. Khả dụng trên menu phản ánh lúc đọc; việc giữ hàng được quyết định trong transaction tạo đơn.
- Đơn, snapshot, lượt coupon và reservation cùng được hoàn tác khi giao dịch lỗi. Cập nhật tồn có điều kiện đủ số lượng để ngăn tồn âm khi đặt đồng thời.
- `Idempotency-Key` dùng cho thanh toán và đổi điểm: cùng khóa/cùng nội dung được xử lý một lần; dùng lại khóa với nội dung khác bị từ chối.
- Khi đơn chuyển PAID, điểm tích lũy bằng phần nguyên của tổng tiền sau giảm giá chia 10, ghi EARN một lần. Đổi điểm trừ số dư và cấp voucher cá nhân trong cùng giao dịch.
- Tiền lưu dạng số nguyên VND; thời gian trong PostgreSQL dùng `timestamptz`. Mỗi lần đổi trạng thái hợp lệ đều có lịch sử.

```text
PENDING -> PAID -> PREPARING -> READY -> COMPLETED
PENDING -> PAYMENT_FAILED -> PENDING (thử lại khi còn hạn)
PENDING / PAYMENT_FAILED -> CANCELLED (hủy hợp lệ hoặc hết hạn)
PAID -> CANCELLED (qua nghiệp vụ hoàn đơn được phép trước khi nhận pha)
```

Barista chỉ thực hiện các bước `PAID -> PREPARING -> READY -> COMPLETED`. `COMPLETED` và `CANCELLED` là trạng thái kết thúc. API từ chối bỏ bước hoặc thao tác không đúng quyền.

## Kiểm thử

Cài dependencies của hai app và generate Prisma Client trước khi chạy. Từ thư mục gốc:

| Phạm vi | Lệnh PowerShell | Điều kiện |
| --- | --- | --- |
| Unit API và web | `npm.cmd test` | Không cần khởi động server hoặc DB |
| Unit API | `npm.cmd run test:api` | Vitest |
| Unit web | `npm.cmd run test:web` | Node Test Runner |
| Integration PostgreSQL | `npm.cmd run test:integration` | DB test riêng, cấu hình `SMOKE_DATABASE_URL` |
| HTTP E2E API | `npm.cmd --prefix apps/api run test:e2e` | Chuẩn bị DB test cho các ca checkout |
| Browser E2E | `npm.cmd --prefix apps/web run test:e2e` | DB E2E đã migrate/seed và Chromium của Playwright |
| Postman/Newman | `npm.cmd --prefix apps/api run test:api` | API đang chạy, environment Postman đúng URL |
| Tài liệu | `node scripts/check-docs.mjs` | Kiểm tra liên kết và sơ đồ |

Chú ý hai lệnh cùng tên `test:api`: lệnh ở **gốc** chạy unit API, còn lệnh trong **apps/api** chạy Postman/Newman.

Database integration phải có tên bắt đầu bằng `brewlite_foundation_smoke`; dữ liệu fixture chỉ dùng trong DB kiểm thử. Hướng dẫn tạo PostgreSQL test, migration smoke, biến môi trường và Playwright nằm trong [hướng dẫn kiểm thử](docs/testing/README.md). Không trỏ các bộ kiểm thử ghi dữ liệu vào DB đang dùng để demo hoặc vận hành.

Các lượt xác minh đã lưu đạt **437 test unit API, 96 test web, 51 ca PostgreSQL và 6 ca Chromium/Firefox**. Đây là kết quả của các lượt chạy có log, không phải cam kết bao phủ mọi tình huống. Bộ 6 ca trình duyệt là lượt xác minh riêng; lệnh E2E mặc định trong repo chạy project Chromium. [Log và phạm vi từng NFR](docs/testing/evidence/README.md).

## Minh chứng yêu cầu phi chức năng

| Mã | Nội dung | Minh chứng |
| --- | --- | --- |
| NFR-01 | Hiệu năng API trên dữ liệu mẫu | [Benchmark, JSON và phương pháp đo](docs/testing/evidence/nfr-01/README.md) |
| NFR-02 | Bcrypt, JWT, kiểm tra đầu vào và chữ ký VNPay | [Ảnh DB/Postman và kiểm thử bảo mật](docs/testing/evidence/nfr-02/README.md) |
| NFR-03 | Cô lập đơn/điểm của khách; quyền Barista | [Phản hồi 403/404/200 và log phân quyền](docs/testing/evidence/nfr-03/README.md) |
| NFR-04 | Transaction, rollback, coupon và chống tồn âm | [Kiểm thử PostgreSQL và đặt đồng thời](docs/testing/evidence/nfr-04/README.md) |
| NFR-05 | Idempotency thanh toán và đổi điểm | [Ca gửi lặp và từ chối đổi nội dung](docs/testing/evidence/nfr-05/README.md) |
| NFR-06 | Desktop/mobile và trạng thái giao diện | [Ảnh thực tế và kiểm thử trình duyệt](docs/testing/evidence/nfr-06/README.md) |
| NFR-07 | Mô-đun, kiểm thử, migrations và Docker Compose | [Log kiểm thử và nghiệm thu triển khai](docs/testing/evidence/nfr-07/README.md) |
| NFR-08 | Snapshot, lịch sử trạng thái và tiền nguyên VND | [Đơn xác nhận và kiểm thử truy vết](docs/testing/evidence/nfr-08/README.md) |

[Bảng tổng hợp minh chứng](docs/testing/evidence/README.md) giải thích phạm vi từng kết quả. Ảnh là ảnh chụp thực tế; các tệp `raw/` giữ log kiểm thử. Những lượt benchmark cũ chưa đạt được giữ riêng trong thư mục chẩn đoán.

### Kết quả hiệu năng NFR-01

Lượt đo dùng bộ dữ liệu mẫu ban đầu **100 sản phẩm, 300 biến thể, 30 topping và 1.000 đơn**. Bốn API đầu chạy 20 client đồng thời, làm nóng 30 giây và đo 60 giây mỗi API. Tạo liên kết VNPay được đo riêng với 100 mẫu tuần tự.

| API | Mẫu thành công / Tổng mẫu | p95 |
| --- | ---: | ---: |
| `GET /products` | 59.201 / 59.201 | 34,46 ms |
| `GET /products/:id` | 61.919 / 61.919 | 34,04 ms |
| `GET /orders/me` | 39.281 / 39.281 | 65,51 ms |
| `POST /orders` | 6.953 / 6.953 | 302,01 ms |
| `POST /payments` — tạo liên kết VNPay | 100 / 100 | 10,41 ms |

[JSON gốc](docs/testing/evidence/nfr-01/nfr-01-results-submission.json) ghi `allPassed: true`. Benchmark dùng tiêu chí **p95 dưới 500 ms** cho bốn API đo tải, kiểm tra lỗi và yêu cầu mọi mẫu đo thành công; một số request riêng lẻ vượt 500 ms. Bước VNPay chỉ đo thời gian tạo liên kết tại BrewLite, không gồm thời gian người dùng thanh toán trên cổng ngân hàng.

Để đo lại, dùng DB mẫu riêng, đặt cùng `DATABASE_URL` cho seed/API/benchmark, giữ API chạy rồi thực hiện:

```powershell
npm.cmd run perf:seed
$env:API_BASE_URL = 'http://127.0.0.1:3102/api/v1'
$env:PERF_RESULTS_FILE = 'nfr-01-results-sample-retest.json'
npm.cmd run perf:test
```

Cổng `3102` trong ví dụ phải trùng `PORT` của API phục vụ benchmark. Script tạo thêm đơn và cập nhật tồn kho, nên mỗi lượt so sánh cần bắt đầu từ bản sao dữ liệu mẫu ban đầu. Xem [cách chuẩn bị và tái hiện](docs/testing/evidence/nfr-01/bao-cao-hieu-nang.md).

Các ca tự động về gateway/callback dùng mô phỏng theo cấu hình test. Minh chứng hiện có chưa xác nhận giao dịch ngân hàng VNPay Sandbox hoặc kiểm tra Safari; cần chạy riêng nếu tiêu chí nghiệm thu yêu cầu.

## Tích hợp liên tục

[Workflow CI](.github/workflows/ci.yml) chạy khi push, pull request hoặc chạy thủ công. Các job được cấu hình gồm:

- **Frontend:** lint, typecheck, unit test và build Next.js.
- **Backend:** Prisma generate/migrate, lint, typecheck, unit test, cấu hình môi trường, HTTP E2E và build NestJS.
- **Database migrations and integration:** kiểm tra cấu hình Compose, áp migrations trên PostgreSQL riêng và chạy integration.
- **Checkout E2E gate:** dựng API/web production và chạy Playwright trên DB riêng.
- **Web Railway Docker build:** build Dockerfile dành cho web Railway.
- **Documentation:** kiểm tra liên kết tài liệu và tính đồng bộ của sơ đồ.

[Railway Cloud Smoke](.github/workflows/cloud-smoke.yml) là workflow riêng để kiểm tra bản đã triển khai. Cấu hình workflow và log chạy cục bộ không thay thế kết quả CI của commit trên GitHub; xem tab Actions để biết trạng thái lần push tương ứng.

## Tài liệu bàn giao

| Tài liệu | Nội dung |
| --- | --- |
| [Mục lục tài liệu](docs/README.md) | Điều hướng bộ hồ sơ dự án |
| [Scrum và Sprint Backlog](docs/scrum/README.md) | Quy trình, review/retro và Definition of Done |
| [Phân công chi tiết](docs/scrum/phan-cong.md) | Thành viên, thẻ công việc và các sprint |
| [ERD](docs/architecture/erd.md) | Mô hình dữ liệu và tồn kho nguyên liệu |
| [Sơ đồ PlantUML](database/BrewLite.puml) · [Ảnh ERD](database/BrewLite.png) | Nguồn và bản xuất sơ đồ |
| [Nghiệp vụ Orders](docs/knowledge/orders-module-knowledge.md) | Tạo đơn, state machine và transaction |
| [README API](apps/api/README.md) · [README web](apps/web/README.md) | Cấu hình và hướng dẫn cho từng app |
| [Hướng dẫn kiểm thử](docs/testing/README.md) | Các bộ test và cách chuẩn bị DB riêng |
| [Test case nghiệp vụ](docs/testing/business-test-cases.md) | Ca kiểm tra và log theo nghiệp vụ |
| [Nghiệm thu Barista, kho và Compose](docs/testing/staff-acceptance.md) | Hướng dẫn nghiệm thu các phần bàn giao |
| [Reservation và seed demo](docs/testing/reservation-and-demo-seed.md) | Giữ chỗ, hết hạn và dữ liệu trình diễn |
| [Minh chứng NFR-01 đến NFR-08](docs/testing/evidence/README.md) | Ảnh, log và kết quả đo theo báo cáo |
| [Postman collection](postman/BrewLite_API.postman_collection.json) · [Environment](postman/BrewLite_Environment.postman_environment.json) | Bộ yêu cầu API mẫu |

Bộ báo cáo PDF/LaTeX trong `BrewLite-Report/` được giữ cục bộ và không theo dõi bằng Git. Tài liệu bàn giao và minh chứng được quản lý trong `docs/`. Không đưa secret môi trường thật vào Git; cấu hình tham khảo nằm trong các file `.env.example`.

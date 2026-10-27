# Hướng dẫn Docker cho BrewLite

> Có cấu hình frontend/backend/PostgreSQL và migration one-shot; readiness kiểm tra PostgreSQL. Cấu hình này chưa chứng minh demo đặt hàng/thanh toán hoàn chỉnh. Topology theo source và phương án production nằm tại [Deployment Diagram](../architecture/deployment-diagram.md); minh chứng còn thiếu tại [release checklist](./release-checklist.md).

## 1. Topology

```mermaid
flowchart LR
    Browser -->|localhost:3000| Frontend[frontend / Next.js]
    Frontend -->|server-side: http://backend:3001| Backend[backend / NestJS]
    Browser -->|client-side: localhost:3001/api/v1| Backend
    Backend -->|postgresql://postgres:5432/brewlite| DB[(postgres / PostgreSQL)]
```

| Service | Port host | Healthcheck | Phụ thuộc |
|---|---:|---|---|
| `frontend` | 3000 | HTTP `/` | `backend` healthy |
| `backend` | 3001 | HTTP `/api/v1/health` | `postgres` healthy, `migrate` exit 0 |
| `migrate` | Không mở port | Exit 0 | `postgres` healthy; backend chờ migration hoàn tất |
| `postgres` | 5432 mặc định, cấu hình được qua POSTGRES_PORT | `pg_isready` | volume dữ liệu |

Compose hiện publish PostgreSQL ra host; cần bỏ hoặc giới hạn binding khi chuyển môi trường production. Local dùng HTTP, chưa có reverse proxy/TLS. Hồ sơ A2 theo trao đổi có mục HTTPS/CD; phương án đích chưa phải cấu hình đang hoạt động.

## 2. Biến môi trường tối thiểu

`.env.example` chỉ chứa tên biến và giá trị local không nhạy cảm:

```dotenv
NODE_ENV=development
WEB_PORT=3000
API_PORT=3001
POSTGRES_PORT=5432
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
WEB_ORIGIN=http://localhost:3000
POSTGRES_DB=brewlite
POSTGRES_USER=brewlite
POSTGRES_PASSWORD=change_me_local_only
DATABASE_URL=postgresql://brewlite:change_me_local_only@postgres:5432/brewlite?schema=public
JWT_ISSUER=brewlite-api
JWT_AUDIENCE=brewlite-web
JWT_SECRET=
JWT_EXPIRES_IN=15m
MOCK_PAYMENT_MODE=deterministic
ORDER_RESERVATION_TTL_MINUTES=15
```

`JWT_SECRET` bắt buộc và không có fallback. Tạo secret riêng cho từng môi trường bằng `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`, rồi điền vào `.env` hoặc cấp qua môi trường/secret store. Compose dừng nếu biến thiếu hoặc rỗng. Không commit file `.env` thật.

## 3. Quy trình khởi động

Khởi động stack hiện tại:

```bash
cp .env.example .env
# Điền JWT_SECRET riêng trước khi chạy.
docker compose up --build
```

Service `migrate` dùng target `migration` trong Dockerfile API và chạy `npm run prisma:deploy`. Backend chờ cả PostgreSQL healthy lẫn migration exit 0, rồi connect Prisma trước khi lắng nghe. Kiểm tra `docker compose ps -a` và `docker compose logs migrate`.

## 4. Yêu cầu cho Dockerfile

- Multi-stage build; image runtime không chứa dev dependency nếu không cần.
- Chạy bằng user không phải root.
- Pin major/minor base image phù hợp, không dùng tag `latest`.
- Copy lockfile và dùng install frozen/locked.
- Không bake `.env`, secret hoặc credential vào image.
- Có `.dockerignore` loại `node_modules`, `.git`, log, coverage và file môi trường.
- Healthcheck phản ánh readiness: backend chạy `SELECT 1` qua Prisma; DB lỗi trả 503.

## 5. Dữ liệu và migration

- PostgreSQL dùng named volume trong local để giữ dữ liệu qua lần restart.
- `docker compose down` không xóa volume; chỉ `down -v` khi chủ động reset dữ liệu local.
- Migration nằm trong source control và chạy từ database rỗng trong CI.
- Seed có kiểm thử chạy lặp không ghi đè stock/giá/ID đã có. Compose migrate chỉ chạy migration, không tự seed. Image backend runtime hiện không copy thư mục prisma/seed.ts; cần chạy `npm run db:seed` từ checkout trên host tại `apps/api`, sau khi cài dependencies/generate Prisma theo [README API](../../apps/api/README.md), với DATABASE_URL dùng localhost và POSTGRES_PORT của DB local. Không dùng hostname `postgres` của mạng container cho lệnh chạy trên host. Cần đóng gói bước seed phù hợp trước khi ghi “một lệnh chạy đủ demo”.

## 6. Kiểm tra bàn giao Task 9

1. Clone repository mới, copy `.env.example` thành `.env` và điền `JWT_SECRET` riêng.
2. Chạy một lệnh `docker compose up --build` hoặc theo đúng README.
3. Healthcheck của ba service đạt trạng thái healthy.
4. Migration/seed thành công từ volume rỗng.
5. Demo end-to-end: menu -> register/login -> order -> payment -> history.
6. Restart stack; order đã tạo vẫn tồn tại.
7. Log không chứa password, JWT, connection string hay payment token.

## 7. Xử lý sự cố cơ bản

- Backend không kết nối DB: kiểm tra hostname trong container phải là `postgres`, không phải `localhost`.
- Frontend SSR không gọi được API: dùng URL nội bộ `http://backend:3001`; code chạy trong browser dùng URL public.
- Sau khi tích hợp Prisma, nếu schema thiếu: kiểm tra migration container/command đã hoàn tất trước backend readiness.
- Port bận: đổi port phía host, giữ nguyên port mạng nội bộ Compose.

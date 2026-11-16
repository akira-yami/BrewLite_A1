# Hướng dẫn chạy kiểm thử BrewLite

Chạy các lệnh PowerShell dưới đây từ thư mục gốc của repo. Dùng Node.js 24 và Docker Desktop cho các nhóm cần PostgreSQL hoặc Docker Compose. Cài dependencies và tạo Prisma Client một lần sau khi clone hoặc khi dependencies thay đổi.

```powershell
npm.cmd ci --prefix apps/api
npm.cmd ci --prefix apps/web
npm.cmd --prefix apps/api run prisma:generate
```

## Unit test và coverage

| Muốn chạy | Lệnh |
|---|---|
| Unit của cả API và web | `npm.cmd test` |
| Unit API bằng Vitest | `npm.cmd run test:api` |
| Unit web bằng Node Test Runner | `npm.cmd run test:web` |
| Coverage của unit API | `npm.cmd --prefix apps/api run test:cov` |

Các lệnh này chạy trực tiếp, không cần bật web, API hoặc PostgreSQL. Coverage API được in ra terminal và lưu tại `apps/api/coverage/coverage-summary.json`. Để chạy một file cụ thể, dùng các lệnh sau.

```powershell
npm.cmd --prefix apps/api test -- payments.service.spec.ts
node --test apps/web/tests/unit/cart-store.test.mjs
```

## PostgreSQL dành cho kiểm thử

Mở Docker Desktop. Ví dụ dưới đây tạo một container tạm trên cổng `55432`, với mật khẩu chỉ dùng cho test local. Nếu cổng đã được dùng, đổi cổng trong lệnh Docker và các URL PostgreSQL bên dưới.

```powershell
docker run --rm -d --name brewlite-docs-tests -p 127.0.0.1:55432:5432 `
  -e POSTGRES_USER=brewlite -e POSTGRES_PASSWORD=local_test_only `
  -e POSTGRES_DB=brewlite_foundation_smoke_local postgres:18.4-alpine3.23

docker exec brewlite-docs-tests pg_isready -h 127.0.0.1 -U brewlite
```

Chạy tiếp khi `pg_isready` báo `accepting connections`. Dùng một cửa sổ PowerShell riêng để các biến test chỉ áp dụng trong cửa sổ đó.

## API integration và API E2E

Hai bộ này dùng Vitest. Integration kiểm tra PostgreSQL, transaction và các luồng HTTP như đặt đơn, hoàn điểm và quản lý kho. API E2E khởi động NestJS bên trong test để gọi HTTP, gồm cả checkout với PostgreSQL thật. Tên database dùng cho nhóm này phải bắt đầu bằng `brewlite_foundation_smoke`.

```powershell
$env:SMOKE_DATABASE_URL = 'postgresql://brewlite:local_test_only@127.0.0.1:55432/brewlite_foundation_smoke_local?schema=public'
$env:DATABASE_URL = $env:SMOKE_DATABASE_URL
$env:JWT_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('hex'))"
$env:NODE_ENV = 'test'
$env:MOCK_PAYMENT_MODE = 'deterministic'

npm.cmd --prefix apps/api run prisma:deploy
npm.cmd run test:integration
npm.cmd --prefix apps/api run test:e2e
```

Ví dụ chạy riêng một file integration hoặc một file E2E API với cùng cấu hình database.

```powershell
npm.cmd run test:integration -- staff-recipes.integration-spec.ts
npm.cmd --prefix apps/api run test:e2e -- checkout.e2e-spec.ts
```

### Migration smoke

Dùng database mới và rỗng cho mỗi lần chạy. Script tự áp migration hai lần, kiểm tra trạng thái và chạy cả bộ integration. Giữ cấu hình JWT/test ở trên, rồi chạy:

```powershell
$smokeDb = 'brewlite_foundation_smoke_migration_' + (Get-Date -Format yyyyMMddHHmmss)
docker exec brewlite-docs-tests createdb -U brewlite $smokeDb
$env:SMOKE_DATABASE_URL = "postgresql://brewlite:local_test_only@127.0.0.1:55432/${smokeDb}?schema=public"
npm.cmd --prefix apps/api run test:migration
```

Để chạy lại API integration/E2E sau đó, đặt lại cả hai URL theo phần trước.

## Web E2E và VNPay bằng Playwright

Playwright tự mở web ở cổng `3100` và API ở `3101`. Chuẩn bị một database riêng có tên kết thúc bằng `_e2e`. Seed tạo danh mục, nguyên liệu, công thức và tài khoản demo mà các ca browser sử dụng. Giữ `JWT_SECRET` đã tạo ở trên.

```powershell
docker exec brewlite-docs-tests createdb -U brewlite brewlite_browser_e2e
Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
$env:DATABASE_URL = 'postgresql://brewlite:local_test_only@127.0.0.1:55432/brewlite_browser_e2e?schema=public'
npm.cmd --prefix apps/api run prisma:deploy

Push-Location apps/api
try { node --import=tsx prisma/seed-e2e.ts } finally { Pop-Location }

npm.cmd exec --prefix apps/web -- playwright install chromium
npm.cmd --prefix apps/web run test:e2e
npm.cmd --prefix apps/web run test:e2e:vnpay
```

`test:e2e` chạy project Chromium, gồm checkout, công thức barista và Loyalty. `test:e2e:vnpay` chạy bộ riêng cho VNPay. Cấu hình local cung cấp thông tin VNPay dùng cho mô phỏng. Khi đổi cổng, đặt `E2E_WEB_PORT`, `E2E_API_PORT` và cập nhật `E2E_API_URL` theo cổng API mới.

```powershell
npm.cmd --prefix apps/web run test:e2e -- loyalty-checkout.spec.ts
npm.cmd --prefix apps/web run test:e2e:vnpay -- --list

Push-Location apps/web
try { npm.cmd exec -- playwright show-report } finally { Pop-Location }
```

Playwright lưu báo cáo HTML trong `apps/web/playwright-report/` và trace của ca lỗi trong `apps/web/test-results/`. Để chạy trên bản build như CI, hãy chuẩn bị API build và Next.js standalone kèm tài nguyên tĩnh theo job `checkout-e2e`, rồi đặt `$env:E2E_USE_BUILT_SERVERS = 'true'`. Nếu Next báo đã có dev server ở cùng thư mục app, chạy theo chế độ build hoặc dừng dev server của workspace trước khi chạy. [Cấu hình checkout CI](../../.github/workflows/ci.yml)

Khi đã chạy xong các nhóm dùng PostgreSQL, dừng container tạm bằng `docker stop brewlite-docs-tests`. Docker sẽ xóa container và dữ liệu test của nó.

## Cloud smoke trên Railway

Sau khi deploy, vào **GitHub Actions → Railway Cloud Smoke → Run workflow**. Để chạy cùng bộ kiểm tra từ máy local, dùng URL web và API đã deploy:

```powershell
$env:SMOKE_WEB_URL = 'https://web-production-b910e.up.railway.app/'
$env:SMOKE_API_URL = 'https://api-production-1be6.up.railway.app/api/v1/'
npm.cmd run test:smoke:cloud
```

Bộ này gửi các yêu cầu đọc tới web health, trang menu, API readiness và danh mục sản phẩm. [Workflow Railway Cloud Smoke](../../.github/workflows/cloud-smoke.yml)

## Các bộ kiểm tra bổ trợ

| Bộ kiểm tra | Cách chạy |
|---|---|
| Cấu hình môi trường và Compose | `node --test scripts/env-config.test.mjs scripts/compose-config.test.mjs`. Cần Docker Compose trong PATH. |
| Demo ba tiêu chí Task 10 | Chuẩn bị database integration như trên rồi chạy `npm.cmd run test:integration -- order-state-machine.integration-spec.ts inventory-concurrency.integration-spec.ts orders.integration-spec.ts --reporter=verbose`. |
| Postman/Newman | Chuẩn bị API local có dữ liệu mẫu ở `http://localhost:3001`, kiểm tra URL trong [Postman environment](../../postman/BrewLite_Environment.postman_environment.json), rồi chạy `npm.cmd --prefix apps/api run test:api`. Báo cáo nằm trong `logs/newman-report.json`. |
| Đo tải NFR-01 | Dùng API và PostgreSQL local riêng cho benchmark. Chạy `npm.cmd run perf:seed`, khởi động API và chạy `npm.cmd run perf:test`. Xem [hướng dẫn tái hiện benchmark](evidence/perf/bao-cao-hieu-nang.md#6-hướng-dẫn-tái-hiện-kiểm-thử-reproduction-steps). |

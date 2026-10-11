# BrewLite API

Backend BrewLite sử dụng NestJS, TypeScript và REST API với global prefix `/api/v1`.

## Chạy local

```bash
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
# Điền giá trị vừa tạo vào JWT_SECRET trong .env trước khi khởi động.
npm run prisma:generate
npm run prisma:deploy
npm run start:dev
```

Tạo database `brewlite` và user tương ứng trong PostgreSQL trước khi migrate. API chạy tại `http://localhost:3001`; readiness endpoint `GET /api/v1/health` kiểm tra kết nối DB bằng `SELECT 1` và trả 503 khi DB lỗi. Trên PowerShell dùng `Copy-Item .env.example .env`.

Các biến môi trường chính:

```dotenv
PORT=3001
WEB_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://brewlite:change_me_local_only@localhost:5432/brewlite?schema=public
JWT_SECRET=<secret ngẫu nhiên vừa tạo>
JWT_ISSUER=brewlite-api
JWT_AUDIENCE=brewlite-web
```

`WEB_ORIGIN` chấp nhận nhiều origin phân tách bằng dấu phẩy.

`JWT_SECRET` bắt buộc để ký và xác thực JWT. API dừng khi thiếu biến này. File `.env` dùng cho local được Git bỏ qua; không ghi secret thật vào `.env.example`.

## Seed Catalog

Sau khi migrate, chạy `npm run db:seed` để bổ sung catalog mẫu. Seed chỉ thêm sản phẩm, size, topping và liên kết còn thiếu theo SKU/code/khóa liên kết; có thể chạy nhiều lần mà không tạo bản ghi trùng.

Seed giữ nguyên ID, giá, tồn kho, version, trạng thái và nội dung đã chỉnh sửa của bản ghi hiện có. Không xóa đơn hàng, chi tiết đơn, topping của đơn hoặc giữ chỗ tồn kho. Toàn bộ seed chạy trong một transaction: nếu gặp lỗi, dữ liệu vừa thêm được rollback và lệnh trả mã lỗi.

## Kiểm tra

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Build/typecheck tự generate client; `src/generated/prisma` được bỏ qua trong Git. Docker dùng migration one-shot trước backend. Không sửa migration đã chạy trên database chia sẻ.

## Mức đường/đá của OrderItem

`sugarLevel Int? @map("sugar_level")` và `iceLevel Int? @map("ice_level")` nhận phần trăm nguyên 0..100. Null hoặc không gửi dùng công thức chuẩn; 0 là không đường/đá. Migration `20261010090000_order_item_sugar_ice_levels` thêm hai cột nullable và CHECK, giữ đơn cũ với null. Cập nhật DB đang dùng bằng `npm run prisma:deploy`, rồi `npm run prisma:generate` (hoặc build/typecheck).

`CreateOrderDto` validate các trường mới; `toOrderItemResponse` trả nguyên lựa chọn từ snapshot, không phụ thu. Đây là contract cho orders controller/service chưa triển khai; khi tích hợp, lưu bằng `value ?? null` để giữ 0 và tổng hợp tồn kho theo variant qua các dòng khác tùy chọn. Xem [API spec](../../docs/architecture/api-spec.md).

## Ghi chú của OrderItem

`OrderItem.note String? @db.VarChar(500)` lưu ghi chú cho từng dòng. Migration `20261010100000_order_item_note` thêm cột nullable, giữ đơn cũ với null. DTO trim đầu/cuối, rỗng thành null, validate chuỗi tối đa 500 ký tự; mapper trả nguyên note đã lưu. Chỉ gộp dòng khi cùng ghi chú đã chuẩn hóa; không đổi giá. Áp dụng bằng `npm run prisma:deploy` rồi generate/build như trên.

## Migration smoke từ database sạch

Tạo **database test mới, rỗng** có tên bắt đầu bằng `brewlite_foundation_smoke`, rồi chạy:

```powershell
$env:SMOKE_DATABASE_URL = 'postgresql://brewlite:change_me_local_only@localhost:5432/brewlite_foundation_smoke?schema=public'
npm run test:migration
```

Script không đọc `.env`, không reset/drop database và từ chối DB không rỗng. Nó validate/generate, migrate deploy hai lần, kiểm tra migration status và chạy integration tests với Prisma thật. Dữ liệu fixture chỉ nằm trong DB test này. Lần chạy mới cần DB test rỗng khác.

Integration kiểm tra CHECK, FK, partial unique payment/loyalty và rollback; chưa chứng minh implementation Task 10 (state machine, payment idempotency service, inventory concurrency), vốn thuộc các Sprint sau.


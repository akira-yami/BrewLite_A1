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
JWT_EXPIRES_IN=15m
ORDER_RESERVATION_TTL_MINUTES=15
```

`WEB_ORIGIN` chấp nhận nhiều origin phân tách bằng dấu phẩy.

`JWT_SECRET` bắt buộc để ký và xác thực JWT. API dừng khi thiếu biến này. File `.env` dùng cho local được Git bỏ qua; không ghi secret thật vào `.env.example`.
`JWT_EXPIRES_IN` nhận duration dương dạng `s`, `m`, `h` hoặc `d` (ví dụ `900s`, `15m`, `1h`) và tối đa 7 ngày; `ORDER_RESERVATION_TTL_MINUTES` phải là số nguyên từ 1 đến 10080 (7 ngày). API dừng lúc khởi động nếu một trong hai giá trị không hợp lệ.

## Seed Catalog

Sau khi migrate, chạy `npm run db:seed` để bổ sung catalog mẫu. Seed chỉ thêm sản phẩm, size, topping và liên kết còn thiếu theo SKU/code/khóa liên kết; có thể chạy nhiều lần mà không tạo bản ghi trùng.

Seed cũng bổ sung nguyên liệu (`ingredients`) và công thức (`recipe_items`) cho từng size còn thiếu. Seed giữ nguyên ID, giá, tồn kho nguyên liệu, version, trạng thái và nội dung đã chỉnh sửa của bản ghi hiện có (kể cả công thức đã sửa). Không xóa đơn hàng, chi tiết đơn, topping của đơn hoặc giữ chỗ tồn kho. Toàn bộ seed chạy trong một transaction: nếu gặp lỗi, dữ liệu vừa thêm được rollback và lệnh trả mã lỗi.

## Tồn kho theo nguyên liệu và công thức (BOM)

Thành phẩm (ly cà phê, trà sữa...) **không có số lượng trong CSDL**: `products` và `product_variants` không có cột `stock`, `quantity` hay `version`. Tồn kho chỉ nằm ở nguyên liệu thô.

| Bảng | Vai trò |
|---|---|
| `ingredients` | Nguyên liệu thô. `stock_quantity` tính theo đơn vị cơ sở của `unit` (`G`, `ML`, `PCS`); `version` dùng cho compare-and-set khi trừ kho. |
| `recipe_items` | Công thức (BOM): khóa chính `(product_variant_id, ingredient_id)`, `quantity` là lượng nguyên liệu cho 1 ly. |
| `inventory_reservation_items` | Lượng nguyên liệu thực tế đã giữ cho từng reservation, dùng để hoàn đúng số lượng khi hủy hoặc hết hạn, kể cả khi công thức đổi sau đó. |

Topping theo cùng nguyên tắc, bảng `topping_recipe_items` (công thức 1 phần topping) và cột `toppings.type`:

- `PREPACKAGED` (nhập sẵn: thạch hộp, trân châu 3Q, flan đóng hộp): đúng 1 dòng công thức, 1 phần = 1 định lượng nguyên liệu thô, ví dụ 30g trân châu 3Q.
- `PREPARED` (chế biến: trân châu đen đường đen, kem cheese tự đánh): bán thành phẩm, 1 phần gồm nhiều nguyên liệu thô (bột năng, đường đen, sữa tươi...). Không có tồn kho riêng cho bán thành phẩm; tồn kho chỉ nằm ở nguyên liệu thô.

Mỗi ly kèm một phần topping, nguyên liệu của topping được trừ cùng lúc với nguyên liệu của ly và ghi vào reservation. `toppings[].available` trong API là `true` khi topping đang hoạt động và mọi nguyên liệu đủ cho ít nhất 1 phần. Topping chưa có công thức bị coi là hết hàng (tạo đơn trả `OUT_OF_STOCK` kèm `toppingId`). Số lượng công thức là số nguyên theo đơn vị cơ sở nên chọn đơn vị (g, ml) đủ nhỏ để không cần phần thập phân. Migration `20261101100000_topping_recipe`.

Số ly tối đa của một size được tính khi đọc, không lưu: `min(floor(stock_quantity / recipe_items.quantity))` trên mọi dòng công thức. Ví dụ kho 100g cà phê và công thức 10g/ly cho tối đa 10 ly. Size chưa có công thức hoặc có nguyên liệu `is_active = false` được coi là 0 ly. API menu/detail trả giá trị này ở `variants[].availableServings` (thay cho `stock`).

Khi tạo đơn, hệ thống quy đổi số ly thành nhu cầu nguyên liệu theo công thức, cộng dồn các nguyên liệu dùng chung giữa các dòng, rồi trừ kho nguyên liệu bằng `UPDATE ... WHERE version = ? AND stock_quantity >= ?` theo thứ tự ID trong transaction `Serializable`. Migration `20261101090000_ingredient_recipe_inventory` tạo ba bảng trên và xóa `product_variants.stock`/`version`. Số lượng thành phẩm cũ không được chuyển đổi; sau khi `npm run prisma:deploy`, chạy `npm run db:seed` để có nguyên liệu và công thức mẫu.

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

`CreateOrderDto` validate các trường mới; `toOrderItemResponse` trả nguyên lựa chọn từ snapshot, không phụ thu. Đây là contract cho orders controller/service chưa triển khai; khi tích hợp, lưu bằng `value ?? null` để giữ 0 và tổng hợp tồn kho theo variant qua các dòng khác tùy chọn. Xem [API spec](../../Khang-A2/docs/architecture/api-spec.md).

## Ghi chú của OrderItem

`OrderItem.note String? @db.VarChar(500)` lưu ghi chú cho từng dòng. Migration `20261010100000_order_item_note` thêm cột nullable, giữ đơn cũ với null. DTO trim đầu/cuối, rỗng thành null, validate chuỗi tối đa 500 ký tự; mapper trả nguyên note đã lưu. Chỉ gộp dòng khi cùng ghi chú đã chuẩn hóa; không đổi giá. Áp dụng bằng `npm run prisma:deploy` rồi generate/build như trên.

## Migration smoke từ database sạch

Tạo **database test mới, rỗng** có tên bắt đầu bằng `brewlite_foundation_smoke_test`, rồi chạy:

```powershell
$env:SMOKE_DATABASE_URL = 'postgresql://brewlite:change_me_local_only@localhost:5432/brewlite_foundation_smoke_test?schema=public'
npm run test:migration
```

Script không đọc `.env`, không reset/drop database và từ chối DB không rỗng. Nó validate/generate, migrate deploy hai lần, kiểm tra migration status và chạy integration tests với Prisma thật. Dữ liệu fixture chỉ nằm trong DB test này. Lần chạy mới cần DB test rỗng khác.

Integration kiểm tra CHECK, FK, partial unique payment/loyalty và rollback; chưa chứng minh implementation Task 10 (state machine, payment idempotency service, inventory concurrency), vốn thuộc các Sprint sau.

`test/s1.integration-spec.ts` bổ sung kiểm tra HTTP qua AppModule với PostgreSQL thật: Register → Login → JWT/profile, hash/response an toàn, whitelist, credential lỗi và Menu đọc giá từ DB. Bộ này chạy cùng `test:migration`/`test:integration` và chỉ ghi fixture vào `SMOKE_DATABASE_URL` đã được kiểm tra tên.

## Hợp đồng Orders tuần 2

S1-10/SD-10 được bàn giao tại [Orders contract](../../Khang-A2/docs/architecture/orders-contract.md), [UC-06](../../Khang-A2/docs/use-cases/UC-06-tao-don-hang.md), [OpenAPI](../../docs/api/orders.openapi.yaml) và [mã PlantUML riêng](../../Khang-A2/docs/architecture/diagrams/SD-10-create-order.puml). DTO request/response chuẩn bị cho S2-W3; `POST /orders` chưa được đăng ký. `couponCode` được trim, giữ nguyên hoa/thường và từ chối chuỗi trắng.


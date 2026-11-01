# Kiểm tra BrewLite — 01/11/2026

## Kết luận

**Chưa đạt E2E và chưa sẵn sàng nghiệm thu luồng đặt hàng/thanh toán.** Backend hiện không build được; môi trường PostgreSQL/Docker chưa hoạt động; có hai lỗi thanh toán tái hiện độc lập từ mã nguồn hiện tại. Không có kết quả chạy browser → API → PostgreSQL → thanh toán thành công trong đợt kiểm tra này.

Đánh giá trên working tree hiện tại, bao gồm các thay đổi staged/unstaged và 6 file unmerged, không chỉ trên HEAD. Không sửa mã nghiệp vụ, giải quyết conflict, thay `.env`, chạy migration lên DB ứng dụng hoặc reset dữ liệu. Chỉ bổ sung báo cáo, script tái hiện và log trong thư mục này; build/typecheck có sinh lại artifact được Git bỏ qua.

## Kết quả đã chạy

| Kiểm tra | Kết quả | Diễn giải |
|---|---|---|
| Node/npm | Đạt yêu cầu version | Node 24.21.0, npm 11.19.0; package yêu cầu Node >=24 <25 |
| Frontend `npm test` | PASS | 63/63, không skip |
| Frontend `npm run lint` | PASS | Không có diagnostic |
| Frontend `npm run typecheck` | PASS | Không có diagnostic |
| Frontend `npm run build` trong sandbox | FAIL môi trường mạng | Không tải được Playfair Display và Plus Jakarta Sans từ Google Fonts |
| Frontend build mặc định ngoài sandbox | FAIL | Turbopack panic khi xử lý globals.css/PostCSS, child Node process thoát trước khi kết nối |
| Frontend `npm run build -- --webpack` ngoài sandbox | PASS | Compile, TypeScript, prerender và build traces hoàn tất, exit 0; không thay script mặc định |
| Backend `npm test -- --maxWorkers=2 --no-file-parallelism` | FAIL | 144 test pass, 1 test fail; 7 suite không nạp được; tổng 19 file pass, 8 file fail |
| Backend `npm run lint` | FAIL | Parser gặp conflict marker ở 6 file |
| Backend `npm run typecheck` | FAIL | TS1185 merge conflict marker |
| Backend `npm run build` | FAIL | Nest báo 43 lỗi, gồm conflict, duplicate import, kiểu/hàm tồn kho không tương thích |
| Backend `npm run test:e2e -- --maxWorkers=1 --no-file-parallelism` | BLOCKED/FAIL | 2 suite không nạp được; chưa chạy test case vì import InventoryService có conflict |
| Backend `npm run test:integration -- --maxWorkers=1` | BLOCKED/FAIL | 7 suite không nạp được do conflict và thiếu smoke DB; chưa chạy test case |
| `npm run test:migration` | BLOCKED | Thiếu SMOKE_DATABASE_URL tới database test mới, rỗng |
| Prisma validate | PASS | Schema hợp lệ; không chứng minh migration đã apply hoặc DB đúng schema |
| `node --test scripts/compose-config.test.mjs` | PASS | 4/4; test chủ động gán DATABASE_URL_DOCKER giả nên không phát hiện thiếu biến này trong `.env.example` |
| `docker compose config --quiet` | FAIL | Thiếu DATABASE_URL_DOCKER |
| Docker Engine | Không kết nối được | Ngoài sandbox vẫn thiếu pipe dockerDesktopLinuxEngine |
| DB cấu hình trong apps/api/.env | Không kết nối được | localhost:5433 trả ECONNREFUSED khi kiểm tra ngoài sandbox bằng SELECT 1 |
| `node scripts/check-docs.mjs` | FAIL | ENOENT: thiếu thư mục Khang-A2 |
| Tái hiện checkout/retry | Xác nhận 2 lỗi | Script chạy thành công vì assert đúng hành vi lỗi; không phải kết quả E2E pass |

Lần đầu Vitest bị EPERM khi rename cache ở thư mục temp của sandbox. Đã chuyển TEMP/TMP vào `.tmp/` trong workspace và chạy lại. Các kết quả backend ở bảng là lần chạy lại, tránh quy lỗi quyền cache thành lỗi nghiệp vụ.

## Các lỗi cần xử lý theo thứ tự

### P0 — Backend còn xung đột Git, không thể build/khởi động từ source hiện tại

`git ls-files -u` xác nhận 6 file chưa hợp nhất:

- `apps/api/src/modules/inventory/services/inventory.service.ts` — marker đầu ở dòng 122.
- `apps/api/src/modules/orders/services/orders.service.ts` — dòng 17.
- `apps/api/src/modules/orders/services/orders.service.spec.ts` — dòng 1.
- `apps/api/src/modules/orders/services/order-retry.spec.ts` — dòng 24.
- `apps/api/test/inventory-expiry.integration-spec.ts` — dòng 1.
- `apps/api/test/orders-inventory.integration-spec.ts` — dòng 49.

Không chỉ xóa marker: InventoryService vẫn có lời gọi `reserveStock`/`restoreStock` không tồn tại trong repository hiện tại, thiếu biến `totals`/`plans`; Orders có import trùng và kiểu `RecipeLine` thiếu `ingredientId` theo cách đang sử dụng. Cần hợp nhất đúng mô hình tồn kho nguyên liệu, rồi chạy typecheck/build lại.

### P1 — Backend thanh toán thành công nhưng checkout báo thất bại

`apps/api/src/modules/payments/services/payments.service.ts:109` trả `{ success, isRetried, status, gatewayTransactionId, errorCode }`. Controller giữ cấu trúc này trong `{ data: result }`.

`apps/web/src/app/checkout/page.tsx:68` kiểm tra `payment.paymentStatus`, còn dòng 75 điều hướng bằng `payment.orderId`. Backend không trả hai trường này. Frontend cũng mong `failureCode`, backend trả `errorCode`.

Đã chạy mã service và checkout hiện tại, thay I/O bằng adapter giả lập: backend trả `status=SUCCEEDED`, đơn chuyển `PAID`, checkout vẫn hiển thị “Thanh toán chưa thành công”, không xóa giỏ và không điều hướng. Đây là lỗi contract đã tái hiện, không suy ra chỉ từ TypeScript.

Cần thống nhất response thực tế và kiểu frontend; bổ sung kiểm tra xuyên qua response API tới handler checkout. Chỉ sửa `paymentStatus` chưa đủ vì còn `orderId` và mã lỗi.

### P1 — Retry sau PAYMENT_FAILED bị chặn

`apps/api/src/modules/payments/services/payments.service.ts:75` chỉ chấp nhận đơn PENDING. Nhánh gateway thất bại chuyển đơn sang PAYMENT_FAILED. Lần bấm lại trên checkout giữ nguyên order ID, tạo payment key mới, nhưng service trả `ORDER_INVALID_TRANSITION` trước khi gọi gateway.

`OrdersService.transitionForPaymentRetry` đã có nhưng không được gọi từ luồng xử lý thanh toán. Script tái hiện xác nhận retry với đơn PAYMENT_FAILED bị từ chối và gateway không được gọi. Cần nối chuyển trạng thái retry và kiểm tra hạn giữ kho trong một luồng nhất quán.

### P1 — Cấu hình chạy theo README chưa đủ và DB không hoạt động

`compose.yaml:50,67` yêu cầu `DATABASE_URL_DOCKER`; `.env.example:14` chỉ khai báo `DATABASE_URL`. `.env` hiện tại cũng thiếu `DATABASE_URL_DOCKER`, nên `docker compose up --build` sẽ dừng ngay khi đọc cấu hình.

Docker CLI có cài, nhưng Engine chưa truy cập được. API dùng localhost:5433; kết nối kiểm tra ngoài sandbox trả ECONNREFUSED. Chưa có SMOKE_DATABASE_URL. Vì vậy chưa kiểm chứng migration, seed, khóa tồn kho đồng thời, rollback, coupon hoặc điểm thưởng bằng DB thật. Không sửa các thông số này tự động trong đợt audit.

Migration `20261101100000_topping_recipe/` hiện là untracked. Khi bàn giao cần đưa migration vào phiên bản cùng schema; validate schema thành công không thay thế kiểm tra deploy từ database sạch.

### P2 — Test catalog chưa cập nhật theo mô hình nguyên liệu

`apps/api/src/modules/catalog/services/catalog.service.spec.ts:28` vẫn tạo fixture variants có `stock`, không có `recipeItems`; service hiện gọi `maxServings(v.recipeItems)`. Test TC-GET-01 thất bại với `Cannot read properties of undefined (reading 'length')` tại `recipe-capacity.ts:13`.

Đây là fixture/test không khớp contract hiện tại. Repository thật đã include recipeItems; chưa có bằng chứng từ lỗi test này rằng catalog API thật cũng crash với DB đã migrate đúng.

### P2 — Build frontend mặc định lỗi trên môi trường Windows hiện tại

Trong sandbox, build không tải được hai Google Fonts. Chạy ngoài sandbox để loại trừ giới hạn mạng thì build mặc định vẫn lỗi Turbopack tại xử lý CSS/khởi tạo child Node process. Chi tiết nằm trong `web-build.log`. Build Webpack được kiểm tra riêng trong `web-build-webpack.log`.

Build Webpack hoàn tất với exit 0, gồm compile, TypeScript, prerender và build traces. Điều này khoanh vùng lỗi build mặc định về đường xử lý Turbopack/child process trên môi trường hiện tại; chưa xác định nguyên nhân sâu hơn. Không nên ghi nhận build mặc định là pass từ kết quả build Webpack thay thế.

### P2 — Kiểm tra tài liệu/CI đang lỗi

`scripts/check-docs.mjs` gọi đọc Khang-A2 nhưng thư mục không tồn tại trên working tree hiện tại. Nhiều tài liệu cũ đang đánh dấu xóa, trong khi README trỏ sang các gói A2 chưa có tại root. Job Documentation của CI sẽ lỗi với trạng thái này.

## Khoảng trống kiểm thử E2E

- `tests/e2e/` chỉ có `.gitkeep`, không có kịch bản chạy browser.
- Web hiện test bằng Node, mock và render component; 63 test pass không chứng minh checkout gọi API/DB thật thành công.
- API E2E hiện chỉ có health và JWT/RBAC/ownership, override Prisma/UserRepository; không phải browser E2E mua hàng.
- `payments-idempotency.integration.spec.ts` trong src mock trực tiếp chính `processPayment` rồi assert lỗi từ mock, nên không kiểm chứng được thuật toán idempotency thực. Concurrency/double-charge cần test service/HTTP thật với DB test và gateway kiểm soát được.
- `MOCK_PAYMENT_MODE=deterministic` có trong Compose nhưng không được đọc trong mã gateway; gateway hiện dùng Math.random với tỷ lệ thành công 80%. Cấu hình hiện tại không tạo demo/test payment có kết quả xác định.
- OrdersController hiện chỉ expose tạo đơn, lịch sử và chi tiết; chưa có endpoint chuyển trạng thái pha chế/hủy đơn trong controller này. Chưa thể xác nhận chuỗi PAID → PREPARING → READY → COMPLETED từ UI/API.

## Trình tự xác minh lại sau khi sửa

1. Hợp nhất 6 file và mô hình tồn kho; backend lint/typecheck/build đều phải pass.
2. Thống nhất payment response, nối retry, cập nhật fixture catalog và test contract.
3. Hoàn thiện biến Compose, bật Docker/DB, tạo database smoke riêng; chạy migration smoke và integration từ DB sạch, rồi seed catalog.
4. Xử lý build mặc định frontend hoặc chọn bundler được kiểm chứng; sửa kiểm tra tài liệu.
5. Chạy browser thật: đăng ký/đăng nhập → menu → size/topping/đường/đá/note → giỏ → tạo đơn → payment thành công → xác nhận → lịch sử/chi tiết. Kiểm tra thêm payment fail/retry, double click/cùng key, mất phản hồi sau thành công, hết hạn giữ kho, hết hàng và hai người mua đồng thời.

## Bằng chứng

- `api-unit.log`: lần chạy backend unit đã khắc phục lỗi cache temp.
- `api-e2e.log`, `api-integration.log`: suite bị chặn và lý do.
- `web-build.log`, `web-build-webpack.log`: build mặc định và kiểm tra bundler thay thế.
- `checkout-reproduction.log`: kết quả hai lỗi thanh toán.
- `reproduce-checkout.cjs`: chạy từ root bằng `node outputs/e2e-audit-2026-11-01/reproduce-checkout.cjs`.

Các script tái hiện thanh toán dùng source hiện tại với dependency/I/O giả lập và không gọi DB, gateway hay gửi tiền thật.

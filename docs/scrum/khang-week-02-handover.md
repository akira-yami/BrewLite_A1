# Bàn giao Khang — Tuần 2 (12–18/10/2026)

Ngày kiểm chứng: 17/10/2026. Nhánh local: `codex/khang-week-2-orders-contract`, base `27e0ece`.

Đầu việc chính: [Khang — Orders Contract + S1 Integration](https://trello.com/c/FsqrauPC), S1-10 trong workbook phân công. Đã hoàn thành phần chuẩn bị thiết kế/DTO, kiểm tra tích hợp và rà Product Detail. **Chờ review**, chưa đủ điều kiện ghi Done: chưa có approval SD-10 của Hoàng hoặc PR được thành viên khác duyệt. Mã và tài liệu bàn giao được đóng gói trên nhánh [codex/khang-week-2-orders-contract](https://github.com/phananhkhang/BrewLite/tree/codex/khang-week-2-orders-contract).

## Sản phẩm bàn giao

| Đầu ra | Vị trí | Kết quả |
|---|---|---|
| SD-10 Sequence tạo đơn & giữ tồn | [PlantUML riêng](../../Khang-A2/docs/architecture/diagrams/SD-10-create-order.puml) | Có nhánh validation, coupon, version/retry, commit/rollback; compile và render thành công |
| Contract request/response/lỗi | [Orders contract](../../Khang-A2/docs/architecture/orders-contract.md), [OpenAPI](../api/orders.openapi.yaml) | Server total, snapshot, PENDING, TTL 15 phút, transaction chung, Inventory/Coupon boundary rõ |
| UC-06 | [Đặc tả tạo đơn](../../Khang-A2/docs/use-cases/UC-06-tao-don-hang.md) | Tiền/hậu điều kiện, luồng chính, ngoại lệ và AC cho S2 |
| DTO draft | [Request](../../apps/api/src/modules/orders/dto/create-order.dto.ts), [response](../../apps/api/src/modules/orders/dto/create-order-response.dto.ts) | Request whitelist, trường server sở hữu bị từ chối; response snapshot có kiểu |
| S1 integration | [HTTP + PostgreSQL test](../../apps/api/test/s1.integration-spec.ts) | Register/Login/JWT/profile/Menu qua AppModule với Prisma thật |
| Rà Product Detail | Phần bên dưới | Có phát hiện cần Hoàng xử lý; chưa tự ghi nhận task của Hoàng Done |

Đã sửa tài liệu transaction tạo đơn: Order được insert trước `CouponRedemption` để đáp ứng foreign key; stock/version/reservation/coupon cùng rollback. Không phát sinh thay đổi schema hay migration mới.

DTO coupon được trim hai đầu, giữ nguyên hoa/thường, từ chối chuỗi trắng. Bổ sung kiểm tra mỗi item phải là object, ngăn nested array vượt qua ValidateNested. TDD: 3 ca coupon và 2 ca nested array thất bại trước từng sửa tương ứng; sau sửa cả 63 ca DTO pass. Test cũng bảo vệ quantity/dòng, UUID, topping trùng, field giả mạo, đường/đá và ghi chú.

`POST /orders` vẫn thuộc S2-W3; chưa đăng ký endpoint, chưa triển khai OrdersService/InventoryService/PromotionsService. Sơ đồ và chữ ký Service là hợp đồng đề xuất để owner review.

## Bằng chứng kiểm chứng local

| Kiểm tra | Kết quả ngày 17/10 |
|---|---|
| FE lint / typecheck / production build | PASS |
| FE cart / product modal / scroll header | 20/20 PASS |
| BE lint / typecheck / production build | PASS |
| BE unit test | 91/91 PASS, gồm 63 ca CreateOrderDto |
| BE API E2E hiện có (readiness với mock) | 2/2 PASS |
| PostgreSQL integration từ DB sạch | 18/18 PASS, gồm 5 ca S1 HTTP với DB thật |
| Migration | Cả 8 migration deploy thành công; deploy lại no-op; status up-to-date |
| Compose config/JWT secret | 4/4 PASS |
| Coverage riêng CreateOrderDto | Statements/branches/functions/lines đều 100%; không phải coverage toàn repo |
| PlantUML | `-checkonly` và render PNG PASS; đã xem bản render |
| OpenAPI | YAML parse PASS; 27 local `$ref` resolve; 3 ví dụ request/response khớp schema, tổng tiền và TTL |
| HTTP production backend với DB test thật | readiness 200; menu 200; Product Detail 404; POST /orders 404 (chưa triển khai S2) |

Tổng cộng **135 ca test tự động phân biệt** pass (20 FE + 91 BE unit + 2 API E2E + 18 PostgreSQL integration + 4 Compose). Không cộng trùng những lần chạy lại coverage/DTO/integration.

Database kiểm chứng là PostgreSQL 18 tạm riêng, tên `brewlite_foundation_smoke_khang_w2_final`, loopback port 55472. Không migrate/reset DB ứng dụng đang dùng. Seed/integration chạy trên DB tạm; không thay `.env` của dự án.

Lệnh tái lập (cần DB test mới, rỗng mỗi lần `test:migration`):

```powershell
# Tại apps/api; thay URL bằng DB test mới do người chạy tạo.
$env:SMOKE_DATABASE_URL = 'postgresql://user:password@localhost:5432/brewlite_foundation_smoke_new?schema=public'
$env:DATABASE_URL = $env:SMOKE_DATABASE_URL
npm run test:migration
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run test:cov -- --coverage.include=src/modules/orders/dto/create-order.dto.ts
# Tại apps/web: npm run lint; npm run typecheck; npm test; npm run build
# Tại root: node --test scripts/compose-config.test.mjs
```

Docker daemon hiện tắt nên chưa xác nhận stack chạy bằng `docker compose up`; Compose config pass không thay cho runtime smoke. Test unit/readiness và PostgreSQL S1 không chứng minh các nghiệp vụ Orders/Inventory/Coupon chưa triển khai. Build/test local cũng không thay kết quả CI của PR.

## Kết quả rà Product Detail của Hoàng

Đối chiếu [thẻ Hoàng S1-W2](https://trello.com/c/KaTzsjdh) với source tại base `27e0ece` và backend production build. Đây là rà kỹ thuật hỗ trợ Khang, không phải approval của Hoàng cho SD-10.

| Mức | Vị trí / bằng chứng | Vấn đề và việc cần làm |
|---|---|---|
| P1 | [CatalogController:8](../../apps/api/src/modules/catalog/controllers/catalog.controller.ts#L8); gọi `/api/v1/products/{id}` của sản phẩm có thật trả 404 | Chỉ có `@Get()` danh sách, chưa có `@Get(':id')`. Hoàng cần hoàn thiện detail route/service/repository, phân biệt product thiếu/inactive và bổ sung API test trước khi nghiệm thu S1-05. |
| P2 | [CatalogRepository:18](../../apps/api/src/modules/catalog/repositories/catalog.repository.ts#L18), [CatalogService:30](../../apps/api/src/modules/catalog/services/catalog.service.ts#L30) | Query include mọi ProductTopping, không lọc `topping.isActive`. Fixture có topping inactive vẫn xuất hiện trong menu response (5 lượt xuất hiện trên các product khi smoke). UI disable lựa chọn, nhưng API spec quy định chỉ trả option active; Hoàng cần thống nhất/filter và kiểm thử. |

Phần đã kiểm chứng: Catalog lọc product/variant active, trả giá JSON number từ BigInt, Menu frontend dùng được `basePrice` và cấu trúc hiện hành. Tuy nhiên spec mô tả `minPrice`/`available`, runtime hiện là `basePrice`/`stock`; cần Hoàng/Khải thống nhất response detail/menu trước S2 để tránh hai hợp đồng song song. Không thay contract của frontend trong đầu việc Orders này.

## Chuẩn bị Review / Retrospective S1-11

[Thẻ cuối S1](https://trello.com/c/lS4mxW1v) yêu cầu Khang điều phối PO/SM, toàn nhóm tham dự, Khải kiểm tra evidence. Bản dưới đây là chuẩn bị từ bằng chứng kỹ thuật, **chưa phải biên bản họp hoặc kết quả Accepted**.

| Bước demo dự kiến | Bằng chứng hiện có | Nội dung còn cần xác nhận tại Review |
|---|---|---|
| Register → Login → profile | S1 HTTP/DB tests pass, hash an toàn, sai credential/401 được kiểm tra | Demo UI trực tiếp, phản hồi của PO/nhóm |
| Menu | HTTP production 200; giá từ DB; FE build/test pass | Loading/empty/error/responsive qua demo thật |
| Detail → Cart → reload | 20 FE tests pass cho cart/modal/header | Detail API chưa có; không coi toàn luồng đã nghiệm thu |
| SD-10 cho S2 | Contract, OpenAPI, DTO và PlantUML đã chuẩn bị | Hoàng review/approve bằng link thật |

Thông tin ghi khi họp thực sự diễn ra:

- Thời gian, thành viên tham dự, link demo/PR/CI: chưa ghi nhận.
- PBI Accepted/Not Accepted và phản hồi PO: chưa ghi nhận.
- Carry-over đề xuất: Product Detail API và thống nhất option/response; chốt tại Review.
- Action cải tiến đề xuất: Hoàng xử lý phát hiện Catalog; Khang/Hoàng chốt SD-10 trước S2; Khải kiểm tra bằng chứng demo và biên bản. Chưa gán trạng thái đã đồng thuận hoặc đã hoàn thành.
- Cập nhật [burndown](burndown.md) và [retrospective](retrospectives/sprint-01-retro.md) từ kết quả họp thực tế; không tự điền số điểm hay lời nhận xét của thành viên.

## Điều kiện còn lại để Done

1. Hoàng review/approve SD-10 và transaction/API contract; ghi link hoặc bằng chứng thật.
2. Commit/PR của phần bàn giao được reviewer khác Khang duyệt; chạy CI và smoke theo DoD khi merge.
3. Nhóm thực hiện Review/Retro S1, Khải kiểm tra evidence, PO ghi nhận PBI/feedback và burndown thực tế.

Phát hiện Product Detail được ghi lại để owner xử lý; Khang đã hoàn thành phần rà, nhưng không tự đánh dấu đầu việc của Hoàng hoặc toàn Sprint đạt.

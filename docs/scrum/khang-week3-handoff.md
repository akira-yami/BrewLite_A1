# Bàn giao Khang — backend tuần 3

Ghi nhận: 2026-10-23T16:33:06+07:00. Múi giờ UTC+07:00 (giờ Việt Nam).

Task đối chiếu: [S2-W3 Dev Khang — POST /orders + Order History Backend](https://trello.com/c/sWlyebZd). Khoảng kế hoạch trên task: 19/10/2026 08:00 đến 25/10/2026 23:59 UTC+7. Khoảng này là lịch kế hoạch, không được suy ra từ ngày commit.

## 1. Mốc Git và phạm vi từng commit

Nhánh bàn giao: `codex/khang-week3-orders`. Nhánh `main` trên GitHub không bị thay đổi bởi đợt push này. Mốc trước bàn giao: `64e82a4`. [So sánh toàn bộ code và test tuần 3](https://github.com/phananhkhang/BrewLite/compare/64e82a4...f1524a3dc77f6c9bcaa6862d41ea03197eb16f24).

| Commit | Ngày giờ author/committer (UTC+7) | Nội dung đối chiếu |
|---|---|---|
| [`b747cef`](https://github.com/phananhkhang/BrewLite/commit/b747ceffa7e4100db1a0779eca49934fe2e38db6) | 2026-10-23T16:30:52+07:00 | Catalog/Inventory/Users và kiểm tra tiền an toàn; cùng transaction của Orders. |
| [`10e1086`](https://github.com/phananhkhang/BrewLite/commit/10e10860eb3697d767262804883d180c4bc0747a) | 2026-10-23T16:31:08+07:00 | POST /orders, GET /orders/me, GET /orders/:id; quyền sở hữu, tùy chọn, retry và envelope. |
| [`f1524a3`](https://github.com/phananhkhang/BrewLite/commit/f1524a3dc77f6c9bcaa6862d41ea03197eb16f24) | 2026-10-23T16:31:38+07:00 | Unit hồi quy và HTTP/PostgreSQL cho rollback, tranh tồn/coupon, quyền truy cập, phân trang. |

Commit tài liệu đi sau ba commit trên; xem [lịch sử bản bàn giao](https://github.com/phananhkhang/BrewLite/commits/codex%2Fkhang-week3-orders/docs/scrum/khang-week3-handoff.md) để lấy mã và ngày giờ chính xác của nó.

Ngày giờ author và committer của ba commit trên trùng nhau, do Git ghi tại thời điểm commit. Đây là các commit chia từ thay đổi có sẵn trong workspace; không phải bằng chứng rằng từng phần được phát triển trong các ngày khác nhau. Không đổi ngày về quá khứ, không suy diễn phần trăm đóng góp hay trạng thái review từ Git.

## 2. Ma trận yêu cầu → triển khai → kiểm chứng

| Yêu cầu của task | Vị trí chính | Kiểm chứng |
|---|---|---|
| Tạo đơn, giá server, snapshot, PENDING | `apps/api/src/modules/orders/services/orders.service.ts` | HTTP tạo đơn, tổng tiền, snapshot giữ nguyên khi catalog đổi tên |
| Một transaction giữ tồn và coupon | CatalogService, InventoryService, UsersService và OrdersService | PostgreSQL rollback sau khi đã ghi stock/reservation/coupon |
| Xử lý đồng thời | Serializable, expectedVersion, tối đa 3 lần thử, thứ tự UUID | Hai request mua ly cuối, tranh coupon; unit test retry/re-quote |
| Lịch sử và chi tiết của chủ đơn | OrdersController và OrdersRepository | JWT/role; tài khoản khác nhận 404; phân trang cùng timestamp |
| Đường/đá, ghi chú | DTO, snapshot, mapper; modal và cart-store frontend có sẵn | 0/null được giữ đúng, sửa/lưu lại giỏ, gộp cấu hình tương đương |
| Response và lỗi | OrdersResponseInterceptor, OrdersExceptionFilter | requestId trong header/body; không lộ dữ liệu đơn của user khác |

Chi tiết endpoint, payload và các bước demo: [Orders tuần 3](../api/orders-week3.md). Đặc tả máy đọc: [OpenAPI](../api/orders.openapi.yaml).

## 3. Kết quả kiểm thử đã lưu

Các log được ghi từ cùng nội dung source/test đóng tại commit `f1524a3dc77f6c9bcaa6862d41ea03197eb16f24`. Hành động chia commit không thay đổi nội dung code đã kiểm thử.

| Kiểm tra | Kết quả | Log có giờ chạy và exit code |
|---|---|---|
| Backend unit | 181/181, 26 file | [backend-unit.txt](./evidence/khang-week3-2026-10-23/backend-unit.txt) |
| Backend HTTP | 16/16, 2 file | [backend-http.txt](./evidence/khang-week3-2026-10-23/backend-http.txt) |
| PostgreSQL integration | 27/27, 4 file | [backend-integration.txt](./evidence/khang-week3-2026-10-23/backend-integration.txt) |
| Frontend unit | 53/53 | [frontend-unit.txt](./evidence/khang-week3-2026-10-23/frontend-unit.txt) |
| Backend TypeScript và lint | PASS | [backend-static.txt](./evidence/khang-week3-2026-10-23/backend-static.txt) |
| Frontend TypeScript | PASS | [frontend-static.txt](./evidence/khang-week3-2026-10-23/frontend-static.txt) |
| Deploy 8 migration lên database kiểm thử mới | PASS | [database-migrations.txt](./evidence/khang-week3-2026-10-23/database-migrations.txt) |

Một lần chạy toàn bộ integration trên database dùng lại bị trùng SKU fixture của test catalog, không phải lỗi tạo đơn. [Log lần không đạt](./evidence/khang-week3-2026-10-23/backend-integration-reused-db.txt) được giữ nguyên; sau đó chạy lại trên database kiểm thử mới đã migrate và đạt 27/27. Các dòng ERROR trong log đạt là tình huống cố ý gây lỗi để kiểm tra rollback/giới hạn tiền.

[manifest.json](./evidence/khang-week3-2026-10-23/manifest.json) chứa SHA đầy đủ, timestamp ISO 8601, kết quả và SHA-256 của từng log. Có thể tải log rồi đối chiếu hash; metadata này hỗ trợ truy vết, không thay thế việc thầy tự chạy test.

## 4. Giới hạn và cách xác nhận

- Backend Orders đã triển khai; nút đặt/thanh toán trên giỏ chưa gọi API và chưa có trang lịch sử/chi tiết. Không báo đã hoàn thành checkout UI.
- Đường/đá ở frontend đã có từ trước; đợt bàn giao này kiểm chứng luồng hiện có, không ghi nhận là toàn bộ frontend mới do Khang viết.
- Hoàng review tạo đơn, Huy review authz/history, Khải review SD-14 và approval SD-10/SD-14 phải có xác nhận thật trên PR/task; tài liệu này không xác nhận thay.
- Chưa có idempotency cho POST /orders. Khi mất kết nối sau gửi đơn, đối chiếu lịch sử trước khi tạo lại.
- Để đối chứng: mở compare/commit, xem test và log tương ứng; chạy API với token hai tài khoản để kiểm tra 201/200/404 và requestId. Môi trường integration cần database riêng; toàn bộ suite nên dùng database mới vì fixture catalog có SKU cố định.

Lệnh xem cả hai mốc thời gian đầy đủ:

```sh
git log --reverse --format="%H | author=%aI | committer=%cI | %s" 64e82a4..codex/khang-week3-orders
```

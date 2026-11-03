# Đối chiếu BrewLite với Trello ngày 03/11/2026

Phạm vi: mã nguồn local trên nhánh `main`, HEAD `c8455e8c63c356c919abdf1192d0d51b28686ec6`; working tree sạch trước kiểm tra. Đọc toàn bộ 5 danh sách/40 thẻ đang mở của [board BrewLite](https://trello.com/b/JXTjedPU), đối chiếu acceptance criteria, source, cấu hình, tài liệu và chạy kiểm thử. Múi giờ Asia/Bangkok.

Khi lưu báo cáo, phát hiện một thay đổi ngoài audit ở `apps/web/src/app/menu/page.tsx`: bỏ hai liên kết Về BrewLite/Liên hệ khỏi header/footer, mtime 19:04:43. Audit không tạo hoặc hoàn tác thay đổi này. Kết quả build/test dưới đây thuộc source trước thay đổi đó; chưa kiểm chứng lại phần chỉnh menu đang diễn ra.

## Kết luận

Luồng khách hàng menu → giỏ → tạo đơn → thanh toán → xác nhận đã chạy được với PostgreSQL thật. Retry sau thanh toán thất bại dùng lại order và giữ giỏ đúng; inventory/expiry có kiểm thử DB. Dự án đã vượt xa báo cáo ngày 22/10 trong repo, nhưng chưa đủ điều kiện kết luận hoàn tất toàn bộ kế hoạch.

Board hiện tên **BrewLite – Phân công chi tiết 5 tuần Assigment1**. URL cũ chứa “6 tuần” không phải tên kế hoạch hiện tại. Snapshot đọc đầy đủ, không còn trang tiếp: [dữ liệu 40 thẻ](evidence/trello-audit-2026-11-03/board-snapshot.json).

**32/40 thẻ Done = 80% theo số thẻ Trello**. Đây không phải phần trăm khối lượng, story point, mức đạt DoD hay đóng góp cá nhân. Các thẻ có kích thước khác nhau và gồm hồ sơ Scrum cùng một extension.

| Danh sách | Trello Done | Đánh giá hiện tại |
|---|---:|---|
| S1 — Tuần 1 | 12/12 | Nền tảng/catalog/auth có code và kiểm thử; một số tài liệu contract/state machine dẫn trên thẻ không còn trong checkout |
| S1 — Tuần 2 | 8/8 | Detail/cart/session đã có kiểm thử; thẻ Scrum S1 thiếu minh chứng nghiệm thu trong repo |
| S2 — Tuần 3 | 6/6 | Orders/checkout hoạt động; coupon có runtime, cần củng cố regression fail/retry |
| S2 — Tuần 4 | 6/8 | Payment/history/inventory đã có; Loyalty đã triển khai dù Trello chưa Done; Scrum S2 còn thiếu |
| S3 — Tuần 5 | 0/6 | Migration/seed và app build đã có; full lifecycle, staff extension, demo tài khoản và bàn giao còn cần hoàn thiện |

Không đánh dấu lại thẻ hoặc sửa phân công trong lần kiểm tra này. Trạng thái kỹ thuật dưới đây không thay thế review/approval của nhóm theo [Definition of Done](definition-of-done.md).

## Các điểm cần xử lý

### 1. Full Order State Machine vẫn chưa triển khai đủ

[A1-10.2](https://trello.com/c/m2aZIei1) của Kiệt chưa có runtime/API cho `PAID → PREPARING → READY → COMPLETED`; chưa có API khách hủy đơn theo quy tắc đầy đủ. Hiện [OrdersController](../../apps/api/src/modules/orders/controllers/orders.controller.ts) chỉ có tạo đơn, lịch sử của tôi và chi tiết của tôi, giới hạn CUSTOMER. Các nhánh payment retry và tự hủy do TTL đã có.

[EXT-UC10](https://trello.com/c/e2h3cxQ7) chưa có page/queue staff hoặc API nhận/pha/giao đơn. Giữ thẻ này là extension riêng như mô tả Trello; phần full state machine thuộc thẻ core A1-10.2.

### 2. Lỗi đã tái hiện: PAID không được ghi vào lịch sử trạng thái

[OrdersRepository.markAsPaid](../../apps/api/src/modules/orders/repositories/orders.repository.ts) đổi status, consume reservation/coupon và cộng điểm, nhưng không tạo `OrderStatusHistory` cho `PENDING → PAID`. README yêu cầu mọi chuyển trạng thái được ghi lịch sử.

Probe trên PostgreSQL với thanh toán thành công và failed→retry đều cho **0 mốc PAID**, trong khi order/payment đã thành công. Cần ghi history trong cùng transaction và thêm assertion timeline. Đây là lỗi chức năng còn tồn tại dù các bộ test hiện hành đều xanh.

### 3. Loyalty đã có, cần cập nhật bằng chứng và nghiệm thu

[A1-10.6](https://trello.com/c/6fYjlq7H) vẫn ghi chưa có runtime, nhưng logic cộng balance và ledger nằm trong `markAsPaid`. Probe service/DB đã xác nhận:

- Failed không cộng điểm; replay failed không gọi gateway lại.
- Thành công/replay thành công chỉ có một ledger EARN.
- Hai request đồng thời, cùng key hoặc hai key cho cùng order, chỉ có một payment/gateway call và một lần cộng điểm.

Công thức hiện tại là `floor(total / 10)`: đơn 40.000 đồng nhận 4.000 điểm. Unit test hiện dùng tỷ lệ giả định này; cần chốt quy tắc với yêu cầu/nhóm trước khi nghiệm thu. Không tự suy rằng tỷ lệ này sai hoặc đúng đề.

Owner theo board vẫn là Huy, reviewer Khang; việc code hiện nằm ở module Orders không chứng minh đóng góp cá nhân.

### 4. Test idempotency trong repo còn một bài không kiểm chứng implementation

[payments-idempotency.integration.spec.ts](../../apps/api/src/modules/payments/payments-idempotency.integration.spec.ts) mock chính `processPayment` để ném lỗi rồi assert lỗi đó. Bài này không chứng minh chống double-charge.

Probe bổ sung trên DB thật đã chạy implementation và đạt các nhánh cùng key đồng thời, khác key cùng order, replay, payload khác và failed→successful retry. Cần đưa các kịch bản này vào bộ integration chính thức để bảo vệ các thay đổi sau; probe audit không thay thế CI regression.

### 5. Hồ sơ tiến độ không đồng bộ với sản phẩm

[SCRUM-S1](https://trello.com/c/0giU3eGX) đã Done nhưng [Sprint 1](sprint-01.md), [Retro S1](retrospectives/sprint-01-retro.md) vẫn ghi chưa có biên bản. [Sprint 2](sprint-02.md), [Retro S2](retrospectives/sprint-02-retro.md) và [burndown](burndown.md) cũng chưa có dữ liệu nghiệm thu/Actual trong checkout. Chưa thấy biên bản thay thế hoặc dẫn chứng trên thẻ Scrum S1 đã đọc; điều này không khẳng định cuộc họp chưa diễn ra ngoài repo.

[progress-report.md](progress-report.md) là báo cáo lịch sử ngày 22/10, không dùng để mô tả hiện trạng 03/11. README còn nói checkout chưa nối và dẫn các thư mục A2 không có trong checkout. Hiện `docs/architecture` chỉ còn `erd.md`; contract/state machine dẫn trong các thẻ đã Done cần có vị trí bàn giao hiện hành.

Lệnh check-docs đạt nhưng **bỏ qua** một số link legacy A2/OpenAPI và không kiểm tra bộ diagram/register đã bị loại khỏi checkout. Kết quả xanh này không chứng minh hồ sơ bàn giao đầy đủ.

### 6. Migration/seed đạt kiểm thử, bàn giao Compose chưa đủ bằng chứng

10 migration đã deploy thành công trên DB rỗng, deploy lần hai không thay đổi; kiểm thử seed lặp, bảo toàn dữ liệu chỉnh sửa và loại mock SKU cũ đạt. E2E dùng một DB riêng được migration/seed sạch.

[A1-9.5](https://trello.com/c/hvWxq8rG) chưa có bằng chứng chạy sạch toàn stack Compose trong lần audit. Theo [Compose](../../compose.yaml) và [API Dockerfile](../../apps/api/Dockerfile), service migrate chỉ chạy `prisma:deploy`, không seed. Hướng dẫn full stack ở README chưa có bước seed; với volume DB mới sẽ chưa có menu demo. README API có hướng dẫn seed khi chạy trên host, nhưng cần bổ sung quy trình demo cho Compose.

[A1-9.4](https://trello.com/c/5rFozCM5) chưa có bộ tài khoản demo Customer/Barista tái tạo bằng seed; kiểm tra role ở route mẫu chưa thay thế kiểm tra nghiệp vụ staff.

## Mốc hạn trên Trello

Tại 03/11/2026 theo Asia/Bangkok:

- Hai thẻ chưa Done có hạn 01/11 23:59: A1-10.6 và SCRUM-S2. A1-10.6 đã có triển khai, nên cần phân biệt thiếu nghiệm thu/cập nhật board với thiếu code.
- A1-10.2 có hạn 08/11 23:59.
- A1-9.3, A1-9.4, A1-9.5 và SCRUM-S3 có hạn 15/11 23:59.
- EXT-UC10 chưa có due date.

Tên “Tuần 5” chứa cả hạn 08/11 và 15/11. Theo dõi bằng due date cụ thể; cần nhóm chốt lại cách đặt tên tuần/mốc bàn giao.

## Kết quả kiểm tra mới

| Kiểm tra | Kết quả |
|---|---|
| Backend unit | 29 file, 213 test đạt |
| Frontend unit/component/contract | 68 test đạt |
| Env và Compose config | 9 test đạt |
| API HTTP E2E | 2 file, 17 test đạt |
| Migration và PostgreSQL integration | 10 migration; 8 file, 53 test đạt |
| Chromium | 9 test đạt: 2 checkout với API/DB thật; 7 kiểm tra session dùng API auth thật và mock response order |
| Backend/frontend lint, typecheck | Đạt |
| Backend build | Đạt |
| Frontend production build | Đạt với `npm run build -- --webpack` trên Windows theo hướng dẫn E2E của repo |
| Documentation checker | Đạt với các giới hạn bỏ qua nêu trên |
| Probe payment/loyalty | 3 kịch bản đạt assertion; phát hiện timeline PAID bị thiếu |

Tổng 369 test hiện có đạt. Không diễn giải tất cả là E2E hoặc kiểm thử DB thật. Luồng lịch sử có HTTP/DB coverage và browser session coverage, chưa được audit như một demo UI→DB trọn vẹn sau confirmation.

Sandbox ban đầu chặn thư mục cache/temp hoặc kết nối localhost; các bước liên quan đã chạy lại thành công với temp trong workspace/quyền truy cập localhost. Không tính lỗi môi trường đó thành lỗi sản phẩm. Frontend build mặc định Turbopack không được xác minh trong lần audit.

Hai DB kiểm thử tách biệt: `brewlite_foundation_smoke_audit_20261103` và `brewlite_audit_20261103_e2e`. Không migrate/seed/reset database ứng dụng `brewlite`. Chưa xác minh trạng thái CI/ruleset GitHub live, chưa chạy full stack Compose sạch hoặc đánh giá UI thị giác toàn bộ thiết bị.

Minh chứng:

- [Backend unit](evidence/trello-audit-2026-11-03/backend-unit.txt)
- [Migration và DB integration](evidence/trello-audit-2026-11-03/database-smoke.txt)
- [Chromium E2E](evidence/trello-audit-2026-11-03/browser-e2e.txt)
- [Probe payment/loyalty](evidence/trello-audit-2026-11-03/payment-probe.txt)

## Đối chiếu đủ 40 thẻ

### S1 — Tuần 1

| Thẻ | Trello | Kết quả đối chiếu |
|---|---|---|
| [A1-1.1](https://trello.com/c/DrrFi5eK) | Done | Có NestJS/Next.js; backend build và HTTP health tests đạt. |
| [A1-1.2](https://trello.com/c/eZd1XUHH) | Done | Frontend build đạt; 2 luồng checkout dùng API/DB thật đạt. |
| [A1-1.3](https://trello.com/c/9hSaaYjq) | Done | 10 migration chạy từ DB rỗng; integration seed đạt. |
| [A1-1.4](https://trello.com/c/es5MlDuG) | Done | Lint/typecheck/build đạt; 9 test env/Compose đạt. README cần cập nhật hiện trạng. |
| [A1-2.1](https://trello.com/c/CSlHeoFy) | Done | Response sản phẩm được kiểm thử; file docs/architecture/api-spec.md dẫn trên thẻ không còn trong checkout. |
| [A1-2.2](https://trello.com/c/efiH6ZsB) | Done | Catalog API, seed và dữ liệu ảnh có thật; kiểm thử qua DB đạt. |
| [A1-2.3](https://trello.com/c/dVDvr2KJ) | Done | Có catalog service/repository tests và kiểm thử trạng thái menu; bộ hiện tại đạt. |
| [A1-3.1](https://trello.com/c/YUoFJNiV) | Done | Có lưới/thẻ/menu; checkout chạy ở viewport 390×844. Chưa đánh giá thị giác toàn bộ desktop. |
| [A1-3.2](https://trello.com/c/QxkSUp08) | Done | Menu gọi API thật trong 2 bài checkout Chromium. |
| [A1-3.3](https://trello.com/c/2SSr8IHl) | Done | Loading/empty/error/refetch có test frontend đạt. |
| [A1-7.1](https://trello.com/c/aq5UIFJP) | Done | Register/login, bcrypt/JWT và lỗi xác thực có unit/HTTP/DB tests đạt. |
| [A1-10.1](https://trello.com/c/GvTKLkG9) | Done | Minh chứng thiết kế có trên Trello nhưng docs/architecture/order-state-machine.md không còn trong checkout; cần khôi phục hoặc dẫn tới bản bàn giao hiện hành. |

### S1 — Tuần 2

| Thẻ | Trello | Kết quả đối chiếu |
|---|---|---|
| [A1-4.1](https://trello.com/c/xkd7E0tJ) | Done | Có GET /products/:id, kiểm tra variant/topping/availability; tests đạt. |
| [A1-4.2](https://trello.com/c/SB0AOTTL) | Done | Có detail UI, tùy chọn và chuyển dữ liệu vào cart; frontend tests đạt. |
| [A1-4.3](https://trello.com/c/ZwZt7rKc) | Done | Có catalog tests và kiểm tra tùy chọn/giá khi tạo đơn trên DB. |
| [A1-5.1](https://trello.com/c/WupVKBh8) | Done | Cart thêm/sửa/xóa/persist có tests đạt; ghi chú Trello còn nói PR chưa merge đã cũ. |
| [A1-5.2](https://trello.com/c/9iM6qGgW) | Done | Identity có size/topping/đường/đá/note; subtotal và quantity có tests đạt. |
| [A1-5.3](https://trello.com/c/1S6eKGuu) | Done | 13 bài cart trong bộ frontend kiểm tra identity, tổng tiền, số lượng, reload và chỉnh sửa đạt. |
| [A1-7.2](https://trello.com/c/7AOw8fhr) | Done | Session/logout/401 và khôi phục token có unit/HTTP/browser tests đạt. |
| [SCRUM-S1](https://trello.com/c/0giU3eGX) | Done | Chưa đủ bằng chứng nghiệm thu: Sprint 1 và Retro S1 vẫn ghi chưa có biên bản; burndown chưa có Actual. |

### S2 — Tuần 3

| Thẻ | Trello | Kết quả đối chiếu |
|---|---|---|
| [A1-6.1](https://trello.com/c/HrLMG1mj) | Done | Có POST /orders, JWT, validation, giá server và PENDING; HTTP/DB tests đạt. |
| [A1-6.2](https://trello.com/c/aMZs6kjK) | Done | Snapshot, transaction/rollback và giữ nguyên liệu có integration tests đạt. |
| [A1-6.3](https://trello.com/c/Qkv7yk5f) | Done | Principal gắn với order; HTTP tests kiểm tra JWT, ownership và dữ liệu không hợp lệ đạt. |
| [A1-7.3](https://trello.com/c/bsH9dcpQ) | Done | Bảo vệ order/payment bằng JWT, role CUSTOMER và ownership; không nhận userId/amount từ client. |
| [A1-8.2](https://trello.com/c/Kgh0oBeh) | Done | 2 bài Chromium checkout thật đạt: thành công; CARD lỗi giữ cart rồi E_WALLET retry cùng order. |
| [A1-10.5](https://trello.com/c/PhR3V7EO) | Done | Coupon quote/lock/reserve/consume/expiry đã có; cần giữ regression coupon fail→retry trong bộ tự động lâu dài. |

### S2 — Tuần 4

| Thẻ | Trello | Kết quả đối chiếu |
|---|---|---|
| [A1-8.1](https://trello.com/c/bHBZtpqi) | Done | POST /payments lấy amount từ order DB; mock Ví/Thẻ được kiểm tra qua Chromium thật. |
| [A1-8.3](https://trello.com/c/1bSGmT0h) | Done | PAID/PAYMENT_FAILED và retry hoạt động; còn lỗi không ghi history khi chuyển PAID. |
| [A1-9.1](https://trello.com/c/O7RIPi3z) | Done | Có /orders/me và /orders/:id, lọc userId; HTTP/DB tests kiểm tra quyền sở hữu đạt. |
| [A1-9.2](https://trello.com/c/Rs1BPgRm) | Done | Có confirmation/history/detail và loading/error; confirmation dùng DB thật đạt. Các bài browser session của history/detail mock response order. |
| [A1-10.3](https://trello.com/c/xhAGHMxg) | Done | Probe PostgreSQL xác nhận cùng key/cùng order khác key chỉ charge một lần; khác payload bị chặn. Test mang tên integration trong src vẫn mock chính processPayment, cần thay bằng regression DB thật. |
| [A1-10.4](https://trello.com/c/Pu0J19wK) | Done | Reserve/consume/release, optimistic locking theo nguyên liệu, last-cup concurrency và payment–expiry tests đạt; phần thiếu trên Trello đã được triển khai thêm. |
| [A1-10.6](https://trello.com/c/6fYjlq7H) | Chưa Done | Đã có runtime ở OrdersRepository.markAsPaid; probe xác nhận failed không cộng, successful retry và replay không cộng trùng. Cần xác nhận tỷ lệ quy đổi và đưa probe thành regression chính thức. |
| [SCRUM-S2](https://trello.com/c/jWKu9kLZ) | Chưa Done | Chưa có biên bản Review/Retro hoặc Actual burndown trong checkout; thẻ chưa Done phù hợp bằng chứng. |

### S3 — Tuần 5

| Thẻ | Trello | Kết quả đối chiếu |
|---|---|---|
| [A1-9.3](https://trello.com/c/ME9yf6tm) | Chưa Done | Migration DB rỗng, seed và seed lặp có integration tests đạt; dữ liệu E2E sạch chạy được checkout. Sẵn sàng review bộ demo cuối. |
| [A1-9.4](https://trello.com/c/5rFozCM5) | Chưa Done | Auth/ownership đã kiểm tra; chưa có bộ tài khoản demo Customer/Barista tái tạo bằng seed và chưa có nghiệp vụ staff để nghiệm thu. |
| [A1-9.5](https://trello.com/c/hvWxq8rG) | Chưa Done | Có Compose/Dockerfile/README; chưa chạy full stack Compose sạch trong lần audit. Compose migrate không seed, hướng dẫn full stack chưa có bước seed. |
| [A1-10.2](https://trello.com/c/m2aZIei1) | Chưa Done | Chưa có runtime/API PAID→PREPARING→READY→COMPLETED hoặc API khách hủy đơn; có payment transitions và tự hủy do TTL. |
| [EXT-UC10](https://trello.com/c/e2h3cxQ7) | Chưa Done | Chưa có route/page staff queue hay API nhận/pha/giao đơn; đây là extension, không cộng chung vào phần thiếu core. |
| [SCRUM-S3](https://trello.com/c/HZwkHk4o) | Chưa Done | Hồ sơ là bản chuẩn bị, chưa có biên bản nghiệm thu thực tế. |

## Thứ tự hoàn thiện đề nghị

1. **Kiệt, Khang review:** full state machine core và history PAID; test transition hợp lệ/sai và cạnh tranh. Đối chiếu hạn 08/11.
2. **Huy, Khang review:** chốt tỷ lệ Loyalty, đưa các nhánh không cộng/cộng một lần vào regression, nghiệm thu A1-10.6.
3. **Kiệt, Huy/Khang review:** thay bài idempotency giả bằng integration DB thật; thêm coupon failed/retry regression.
4. **Khang:** bổ sung hồ sơ Review/Retro và burndown từ dữ liệu thật; cập nhật tiến độ/tài liệu dẫn chứng, tránh dùng báo cáo lịch sử như hiện trạng.
5. **Hoàng/Huy/Khang theo thẻ hiện có:** chốt seed/tài khoản demo; bổ sung bước seed cho Compose, chạy clean-stack demo cả history và lưu evidence trước mốc 15/11.
6. **Kiệt:** triển khai staff UI extension sau khi core đạt theo phạm vi đã ghi trên Trello.

Các mục này bám owner/thẻ đang có, không tự giao lại công việc hoặc thay thời hạn của nhóm.

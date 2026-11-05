# Phân công công việc và nghiệp vụ BrewLite — đối chiếu 03/11/2026

> Hồ sơ đối chiếu Trello lịch sử ngày 03/11/2026. Phân công hiện hành theo báo cáo PDF và điều chỉnh EXT của nhóm nằm tại [phan-cong.md](phan-cong.md); dùng bản đó để tra người phụ trách hiện tại.

## Phạm vi và cách đọc

Nguồn chính: toàn bộ **40 thẻ hiện hành** trên [Trello BrewLite](https://trello.com/b/JXTjedPU), đọc đủ 5 danh sách, không còn trang tiếp; [vai trò nhóm](team-roles.md); tài liệu bàn giao và lịch sử source trên main `c8455e8`; diff [PR #28](https://github.com/akira-yami/BrewLite_A1/pull/28) tại `67116fb` đã kiểm tra trong cuộc trao đổi này.

Phạm vi là Assignment 1 và các vai trò/phần việc tích hợp liên quan thể hiện trong repo. Workbook `BrewLite_PhanCong_Scrum.xlsx` không có trong checkout, các gói A2 cũ cũng không có để đối chiếu đầy đủ. Không mở rộng kết luận thành danh sách phân công Assignment 2.

“Được giao” lấy từ tên thẻ và trường **Phụ trách** trong mô tả, không suy từ tác giả commit. Các thẻ trả về không có native member assignee; bảng dưới phản ánh phân công bằng nội dung thẻ. “Reviewer” là người được giao review/kiểm tra, không chứng minh họ đã review hoặc approve. Tác giả commit là bằng chứng thay đổi source cụ thể, không phải số đo thời gian/công sức hoặc độc quyền tác giả.

Các acceptance criteria ở phần 40 thẻ được giữ nguyên nội dung lấy từ board. Có một số cách gọi cũ trên thẻ như Prisma/TypeORM, tồn theo biến thể; implementation hiện tại dùng Prisma và tồn nguyên liệu/công thức. Không tự sửa phân công gốc.

## Kiểu phân chia hiện tại

**Có người phụ trách chính theo lĩnh vực, rồi tách đầu việc theo từng phần của luồng nghiệp vụ, kèm review chéo và hỗ trợ tích hợp.**

Không có quy tắc một người độc quyền toàn bộ một thư mục module. Cũng không có việc chia mỗi module thành năm phần ngang nhau cho tất cả thành viên. Đây là mô hình kết hợp:

1. Mảng chính: Khang — nền tảng/schema/Orders/tích hợp; Hoàng — Catalog/Inventory/dataset; Huy — Auth/Security/Loyalty; Khải — Detail/Cart/Checkout/History frontend; Kiệt — Payment/Promotions/State Machine.
2. Mỗi thẻ có một người chịu trách nhiệm đầu ra và một reviewer/người kiểm tra khác.
3. Luồng lớn được chia theo backend/frontend, bảo mật, tồn kho, thanh toán và thiết kế; không chia frontend/backend cứng cho từng người.
4. Code thực tế có nhiều người chỉnh cùng module khi tích hợp/sửa lỗi. Thay đổi file khác domain không tự chuyển owner của thẻ.

| Thành viên | Thẻ phụ trách | Cấu thành | Thẻ được giao review/kiểm tra |
|---|---:|---|---:|
| Khang | 12 | 9 thẻ kỹ thuật + 3 thẻ Scrum | 12 |
| Hoàng | 10 | 10 thẻ kỹ thuật | 8 |
| Huy | 6 | 6 thẻ kỹ thuật | 6 |
| Khải | 6 | 6 thẻ kỹ thuật | 12 |
| Kiệt | 6 | 5 thẻ kỹ thuật core + 1 extension | 2 |
| Tổng | 40 | 36 thẻ kỹ thuật core + 3 Scrum + 1 extension | 40 |

Số thẻ không phải trọng số khối lượng. Một thẻ full state machine hoặc concurrency có thể lớn hơn nhiều thẻ scaffold/UI trạng thái. Chưa có SP/giờ theo từng thẻ đủ để kết luận chia đều công sức.

## Trách nhiệm ngoài từng thẻ

Theo [team-roles.md](team-roles.md), Khang kiêm:

- Product Owner: ưu tiên backlog, làm rõ Acceptance Criteria, nghiệm thu Increment.
- Scrum Master: Planning/Daily/Review/Retrospective, gỡ blocker, theo dõi quy trình.
- Tech Lead/Schema Owner: kiến trúc và schema chung, hợp đồng giữa module, review/tích hợp.
- Developer: nền tảng và backend Orders.

Cả năm là Development Team, cùng chịu trách nhiệm chất lượng Increment. PR của Khang cần reviewer khác; việc kiêm PO/SM không tự thay thế review độc lập.

## Ma trận các nghiệp vụ giao nhau

| Nghiệp vụ/phạm vi | Người phụ trách và ranh giới |
|---|---|
| Nền tảng, DB, cấu hình, chạy hệ thống | Khang scaffold FE/BE, schema/contract chung, env/build/Compose; Hoàng kết nối DB/seed/dataset; Huy bảo mật cấu hình JWT; review chéo theo từng thẻ |
| Xem danh sách đồ uống | Khang chốt contract; Hoàng làm API, seed, menu UI, API integration và trạng thái loading/empty/error; Khải review API/menu |
| Xem chi tiết, chọn size/topping/đường/đá/note | Hoàng làm detail API và tính hợp lệ/giá; Khải làm UI tùy chọn và đưa vào cart; Khang schema/snapshot/contract và hỗ trợ đường/đá/note end-to-end |
| Giỏ hàng | Khải owner thao tác, identity, subtotal/badge/persist và tests; Hoàng review; Khang hỗ trợ các trường snapshot/identity; Kiệt bổ sung coupon UI trong PR #28 |
| Đăng ký/đăng nhập và phiên | Huy làm cả backend lẫn frontend, bcrypt/JWT/session/logout/401/RBAC/ownership; Khang review API/config, Khải review UI/guard theo thẻ |
| Tạo đơn | Khang làm orchestration/giá server/snapshot/transaction/rollback/PENDING; Huy bảo vệ JWT/principal; Hoàng cung cấp tồn kho; Kiệt cung cấp coupon; Khải gửi request từ checkout |
| Thanh toán/retry | Kiệt backend mock gateway/idempotency/payment outcome; Khải checkout UI; Khang tích hợp Orders và E2E; Huy bảo mật/session; Hoàng đồng bộ giữ tồn/expiry |
| Coupon | Kiệt Promotions/backend lifecycle; Huy review bảo mật/transaction/limits; Khang ghép transaction tạo đơn; giao diện checkout ban đầu thuộc Khải, PR #28 của Kiệt cũng bổ sung coupon Cart/Checkout |
| Tồn kho | Hoàng owner reserve/consume/release/concurrency; Khang tích hợp transaction tạo đơn và sửa race payment–expiry; Huy có sửa OrderExpiry/Payment/Promotions khi hardening; Kiệt dùng reservation khi settle/cancel |
| Loyalty | Huy owner theo A1-10.6; Khang reviewer; payment/PAID của Kiệt kích hoạt side effects. Runtime hiện nằm trong OrdersRepository chứ không có module loyalty độc lập |
| Lịch sử/chi tiết/xác nhận đơn | Khang API và dữ liệu; Khải UI; Huy session/ownership; Kiệt ghi transition PAID/payment history; Hoàng review UI |
| State machine | Khang thiết kế luật/sơ đồ; Kiệt triển khai runtime/payment transitions/full lifecycle; Huy bảo vệ role/ownership; Hoàng giữ nhất quán inventory |
| Barista | Kiệt staff queue/UI/API nghiệp vụ theo extension và lifecycle; Huy role/security/demo account; Khang reviewer core lifecycle. Auth role có không đồng nghĩa staff nghiệp vụ đã hoàn thành |
| Demo/bàn giao | Hoàng migration/seed/menu/tồn; Huy demo accounts/security/test guide; Khang Compose/README/toàn stack; Khải/Hoàng/Khang review theo thẻ |
| Scrum | Khang owner cả S1/S2/S3, Khải được giao kiểm tra; toàn nhóm cung cấp demo/evidence/feedback thực tế |

## Những chỗ code thực tế khác ranh giới phân công ban đầu

Các ví dụ này cho thấy phối hợp thực tế, không ghi nhận lại owner hoặc suy tỷ lệ đóng góp:

| Người có commit/thay đổi | Phần hỗ trợ vượt mảng chính | Minh chứng |
|---|---|---|
| Khang | Schema/DTO/mapper cùng modal/cart/store/tests cho đường/đá và note | `174bbd3`, `1380b9a` |
| Khang | Helper tồn kho và kiểm tra catalog/customer trong transaction Orders | `b747cef` |
| Khang | Retry payment, checkout E2E và khóa đồng bộ payment–expiry | `6962e3f`, `4b38859` |
| Khang | Sửa expiry/deadline drift và seed demo khi review tích hợp | `62ba6e8` |
| Hoàng | Inventory module, integration Orders và tests reservation/expiry/concurrency | `ff6c42e`, `c701ac4`, `82cdef8` |
| Huy | Session/token trên checkout, orders và payments API client | `a11d1a4` |
| Huy | Hardening Orders expiry cùng Payment/Promotions và tests | `8c2c616` |
| Huy | Kiểm tra config JWT khi startup và HTTP login/JWT tests | `6ce84d1`, `daa4d28` |
| Khải | Nối Cart → Checkout → Payments UI | `3b79359`; thẻ A1-8.2 |
| Kiệt | Code PAID/coupon/loyalty side effects trong OrdersRepository, ngoài thư mục Payments/Promotions | `4b233fe` |
| Kiệt | Coupon Cart/Checkout UI, lưu phiên payment, payment status và cancel trong PR chưa merge | PR #28 tại `67116fb` |

**Loyalty cần phân biệt rõ:** thẻ A1-10.6 giao Huy chịu trách nhiệm, nhưng commit `4b233fe` của Kiệt đưa logic cộng balance/ledger vào `OrdersRepository.markAsPaid`. Không thể nói Huy đã tự viết toàn bộ Loyalty chỉ vì tên trên thẻ, hoặc nói Loyalty thuộc riêng Kiệt chỉ vì đoạn code đó. Nên ghi Huy owner/nghiệm thu nghiệp vụ, Kiệt phối hợp tích hợp PAID, và xác minh bàn giao thực tế của nhóm.

**PR #28 là thay đổi liên module:** Payments, Promotions, Orders, Cart, Checkout, migration và tests đều bị tác động. Cần review theo owner của các phần bị sửa; việc PR có UI không tự chuyển toàn bộ ownership frontend từ Khải sang Kiệt.

## Danh mục đủ 40 thẻ theo từng người

Phần sau bao gồm toàn bộ thẻ hiện hành, đầu ra, tiêu chí nghiệm thu và người review/kiểm tra được giao. Danh sách trách nhiệm không có nghĩa mọi thẻ đã hoàn thành.

## Khang

### [A1-1.1 — Repository và khung API NestJS](https://trello.com/c/DrrFi5eK)

- Danh sách kế hoạch: S1 — Tuần 1.
- Phụ trách: Khang. Reviewer/người kiểm tra được giao: Huy.

**Công việc được giao:**

Tạo repository Git và khung NestJS cho backend; thiết lập cấu trúc frontend/backend.

**Đầu ra:** Repository Git, NestJS chạy được và thư mục ứng dụng rõ ràng.

**Tiêu chí hoàn thành trên thẻ:**

- Có frontend Next.js và backend NestJS trong cùng repository.
- Backend chạy được endpoint kiểm tra ban đầu; build không lỗi.
- Có README và commit Git rõ ràng.

### [A1-1.2 — Khởi tạo Next.js và kết nối backend](https://trello.com/c/eZd1XUHH)

- Danh sách kế hoạch: S1 — Tuần 1.
- Phụ trách: Khang. Reviewer/người kiểm tra được giao: Huy.

**Công việc được giao:**

Khởi tạo Next.js và kết nối REST/JSON tới NestJS.

**Đầu ra:** Ứng dụng Next.js chạy được và gọi API backend.

**Tiêu chí hoàn thành trên thẻ:**

- Next.js khởi động/build thành công.
- Frontend có thể gọi NestJS API ở môi trường local.
- Cấu hình URL backend không hard-code bí mật.

### [A1-1.4 — Env mẫu, lint/build và hướng dẫn môi trường](https://trello.com/c/es5MlDuG)

- Danh sách kế hoạch: S1 — Tuần 1.
- Phụ trách: Khang. Reviewer/người kiểm tra được giao: Huy.

**Công việc được giao:**

Bổ sung `.env.example`, `.gitignore`, hướng dẫn chạy và lệnh kiểm tra dự án.

**Đầu ra:** README, `.env.example`, scripts chạy/build.

**Tiêu chí hoàn thành trên thẻ:**

- Clone theo README và chạy frontend/backend được.
- `.env.example` đầy đủ, không chứa secret thật.
- Có Git commit và build thành công.

### [A1-2.1 — Contract Product và GET /products](https://trello.com/c/CSlHeoFy)

- Danh sách kế hoạch: S1 — Tuần 1.
- Phụ trách: Khang. Reviewer/người kiểm tra được giao: Kiệt.

**Công việc được giao:**

Thống nhất dữ liệu JSON trả bởi `GET /products` với các trường menu bắt buộc.

**Đầu ra:** Hợp đồng response cho `GET /products`.

**Tiêu chí hoàn thành trên thẻ:**

- Có `id`, tên, giá và ảnh cho mỗi sản phẩm.
- Frontend/backend thống nhất định dạng trả về.
- Không bắt buộc thêm tài liệu/sơ đồ ngoài tiêu chí Task 2.

### [A1-10.1 — Thiết kế Order State Machine](https://trello.com/c/GvTKLkG9)

- Danh sách kế hoạch: S1 — Tuần 1.
- Phụ trách: Khang. Reviewer/người kiểm tra được giao: Kiệt.

**Công việc được giao:**

Chốt các chuyển trạng thái đơn hàng theo sơ đồ đề: `PENDING → PAID → PREPARING → READY → COMPLETED`; nhánh `PAYMENT_FAILED` (retry) và `CANCELLED`.

**Đầu ra:** Bảng/sơ đồ State Machine và danh sách luật chuyển trạng thái.

**Tiêu chí hoàn thành trên thẻ:**

- Đủ trạng thái và nhánh theo Mục 9.1 đề bài.
- Các chuyển tiếp không có trong sơ đồ phải bị từ chối.
- Barista nhận đơn: `PAID → PREPARING`, pha xong: `PREPARING → READY`, giao khách: `READY → COMPLETED`.

### [SCRUM-S1 — Review/Retro và hồ sơ Sprint](https://trello.com/c/0giU3eGX)

- Danh sách kế hoạch: S1 — Tuần 2.
- Phụ trách: Khang. Reviewer/người kiểm tra được giao: Khải.

**Công việc được giao:**

- Review: demo Increment, đối chiếu AC, ghi kết quả và carry-over.
- Retro: ghi vấn đề và action có người phụ trách/hạn.
- Cập nhật backlog/burndown và hồ sơ bàn giao.

**Đầu ra:** Biên bản Review/Retro, quyết định từng PBI và action cải tiến.

**Tiêu chí hoàn thành trên thẻ:**

- Có Sprint Review/demo Increment đối chiếu Product Backlog và Acceptance Criteria.
- Có Sprint Retrospective ghi điều làm tốt, vấn đề và hành động cải tiến.
- Cập nhật Sprint Backlog, Daily Scrum/burndown và các công việc chưa hoàn thành.
- Ghi nhận phản hồi giảng viên/khách hàng và kế hoạch cải tiến Sprint sau.

### [A1-6.1 — POST /orders, giá server và PENDING](https://trello.com/c/HrLMG1mj)

- Danh sách kế hoạch: S2 — Tuần 3.
- Phụ trách: Khang. Reviewer/người kiểm tra được giao: Hoàng.

**Công việc được giao:**

Xây dựng NestJS `POST /orders` nhận giỏ hàng, validate đầu vào, tạo đơn `PENDING` và trả mã đơn; giá được kiểm tra ở backend.

**Đầu ra:** API `POST /orders` và DTO/Service tạo đơn.

**Tiêu chí hoàn thành trên thẻ:**

- Giỏ hợp lệ tạo đơn `PENDING`, trả mã đơn.
- Dữ liệu đầu vào được validate.
- Tổng tiền được xác định tin cậy phía backend.

### [A1-6.2 — Order snapshot, transaction và rollback](https://trello.com/c/aMZs6kjK)

- Danh sách kế hoạch: S2 — Tuần 3.
- Phụ trách: Khang. Reviewer/người kiểm tra được giao: Hoàng.

**Công việc được giao:**

Lưu Order/OrderItem và thông tin món tại thời điểm đặt trong một transaction; rollback khi có lỗi.

**Đầu ra:** Order persistence và test transaction.

**Tiêu chí hoàn thành trên thẻ:**

- Đơn và các dòng món được lưu cùng nhau.
- Thất bại giữa chừng không tạo đơn dở dang.
- Mã đơn/trạng thái/tổng tiền có thể truy xuất.

### [A1-9.1 — API lịch sử và chi tiết đơn của tôi](https://trello.com/c/O7RIPi3z)

- Danh sách kế hoạch: S2 — Tuần 4.
- Phụ trách: Khang. Reviewer/người kiểm tra được giao: Huy.

**Công việc được giao:**

Thực hiện `GET /orders/me` trả lịch sử đơn; có thông tin mã đơn/trạng thái/tổng tiền.

**Đầu ra:** API lịch sử đơn của người dùng.

**Tiêu chí hoàn thành trên thẻ:**

- `GET /orders/me` có JWT và chỉ trả đơn của user đăng nhập.
- Trạng thái và tổng tiền đúng.
- Tài khoản khác không đọc được đơn.

### [SCRUM-S2 — Review/Retro và hồ sơ Sprint](https://trello.com/c/jWKu9kLZ)

- Danh sách kế hoạch: S2 — Tuần 4.
- Phụ trách: Khang. Reviewer/người kiểm tra được giao: Khải.

**Công việc được giao:**

- Review: demo Increment, đối chiếu AC, ghi kết quả và carry-over.
- Retro: ghi vấn đề và action có người phụ trách/hạn.
- Cập nhật backlog/burndown và hồ sơ bàn giao.

**Đầu ra:** Biên bản Review/Retro, quyết định từng PBI và action cải tiến.

**Tiêu chí hoàn thành trên thẻ:**

- Có Sprint Review/demo Increment đối chiếu Product Backlog và Acceptance Criteria.
- Có Sprint Retrospective ghi điều làm tốt, vấn đề và hành động cải tiến.
- Cập nhật Sprint Backlog, Daily Scrum/burndown và các công việc chưa hoàn thành.
- Ghi nhận phản hồi giảng viên/khách hàng và kế hoạch cải tiến Sprint sau.

### [A1-9.5 — Docker Compose và README bàn giao](https://trello.com/c/hvWxq8rG)

- Danh sách kế hoạch: S3 — Tuần 5.
- Phụ trách: Khang. Reviewer/người kiểm tra được giao: Hoàng.

**Công việc được giao:**

Hoàn thiện Docker Compose chạy Next.js, NestJS và database; hướng dẫn chạy trong README và chuẩn bị demo.

**Đầu ra:** Compose web/API/DB, env mẫu và README.

**Tiêu chí hoàn thành trên thẻ:**

- Docker Compose chạy đầy đủ frontend/backend/DB từ môi trường sạch.
- README có hướng dẫn khởi chạy.
- Demo menu → giỏ → thanh toán → xác nhận và lịch sử.

### [SCRUM-S3 — Review/Retro và hồ sơ Sprint](https://trello.com/c/HZwkHk4o)

- Danh sách kế hoạch: S3 — Tuần 5.
- Phụ trách: Khang. Reviewer/người kiểm tra được giao: Khải.

**Công việc được giao:**

- Review: demo Increment, đối chiếu AC, ghi kết quả và carry-over.
- Retro: ghi vấn đề và action có người phụ trách/hạn.
- Cập nhật backlog/burndown và hồ sơ bàn giao.

**Đầu ra:** Biên bản Review/Retro, quyết định từng PBI và action cải tiến.

**Tiêu chí hoàn thành trên thẻ:**

- Có Sprint Review/demo Increment đối chiếu Product Backlog và Acceptance Criteria.
- Có Sprint Retrospective ghi điều làm tốt, vấn đề và hành động cải tiến.
- Cập nhật Sprint Backlog, Daily Scrum/burndown và các công việc chưa hoàn thành.
- Ghi nhận phản hồi giảng viên/khách hàng và kế hoạch cải tiến Sprint sau.

**Các thẻ được giao review/kiểm tra:** [A1-1.3](https://trello.com/c/9hSaaYjq) (Hoàng); [A1-7.1](https://trello.com/c/aq5UIFJP) (Huy); [A1-4.1](https://trello.com/c/xkd7E0tJ) (Hoàng); [A1-4.3](https://trello.com/c/ZwZt7rKc) (Hoàng); [A1-8.2](https://trello.com/c/Kgh0oBeh) (Khải); [A1-8.1](https://trello.com/c/bHBZtpqi) (Kiệt); [A1-8.3](https://trello.com/c/1bSGmT0h) (Kiệt); [A1-10.3](https://trello.com/c/xhAGHMxg) (Kiệt); [A1-10.4](https://trello.com/c/Pu0J19wK) (Hoàng); [A1-10.6](https://trello.com/c/6fYjlq7H) (Huy); [A1-9.4](https://trello.com/c/5rFozCM5) (Huy); [A1-10.2](https://trello.com/c/m2aZIei1) (Kiệt).

## Hoàng

### [A1-1.3 — Kết nối PostgreSQL/Prisma và dữ liệu mẫu](https://trello.com/c/9hSaaYjq)

- Danh sách kế hoạch: S1 — Tuần 1.
- Phụ trách: Hoàng. Reviewer/người kiểm tra được giao: Khang.

**Công việc được giao:**

Kết nối NestJS với PostgreSQL bằng Prisma/TypeORM; chuẩn bị migration và dữ liệu menu mẫu.

**Đầu ra:** Kết nối CSDL, schema/migration và seed menu.

**Tiêu chí hoàn thành trên thẻ:**

- Backend đọc dữ liệu từ PostgreSQL.
- Migration và seed chạy được trên DB sạch.
- Đủ dữ liệu Product (tên, giá, ảnh) để demo menu.

### [A1-2.2 — Seed menu và API GET /products](https://trello.com/c/efiH6ZsB)

- Danh sách kế hoạch: S1 — Tuần 1.
- Phụ trách: Hoàng. Reviewer/người kiểm tra được giao: Khải.

**Công việc được giao:**

Tạo dữ liệu mẫu hoặc seed và triển khai NestJS `GET /products`.

**Đầu ra:** API menu lấy dữ liệu mẫu hoặc PostgreSQL.

**Tiêu chí hoàn thành trên thẻ:**

- `GET /products` trả danh sách JSON có id/tên/giá/ảnh.
- API chạy được với dữ liệu menu mẫu.
- Kết quả đối chiếu được với menu trên frontend.

### [A1-2.3 — Kiểm thử API danh sách sản phẩm](https://trello.com/c/dVDvr2KJ)

- Danh sách kế hoạch: S1 — Tuần 1.
- Phụ trách: Hoàng. Reviewer/người kiểm tra được giao: Khải.

**Công việc được giao:**

Kiểm thử `GET /products` với dữ liệu hợp lệ, rỗng và lỗi truy xuất.

**Đầu ra:** Test API menu và kết quả chạy.

**Tiêu chí hoàn thành trên thẻ:**

- Trường JSON menu đúng hợp đồng.
- Có kiểm tra trường hợp danh sách rỗng/lỗi truy xuất.
- Có kết quả kiểm thử gắn với commit.

### [A1-3.1 — Lưới menu và thẻ đồ uống mobile-first](https://trello.com/c/YUoFJNiV)

- Danh sách kế hoạch: S1 — Tuần 1.
- Phụ trách: Hoàng. Reviewer/người kiểm tra được giao: Khải.

**Công việc được giao:**

Xây dựng trang Menu Next.js hiển thị danh sách đồ uống (ảnh, tên, giá) dạng lưới.

**Đầu ra:** Trang Menu và thẻ sản phẩm.

**Tiêu chí hoàn thành trên thẻ:**

- Lưới menu hiển thị ảnh, tên, giá từ dữ liệu mẫu/API.
- Hiển thị tốt trên trình duyệt và màn hình nhỏ.
- Chọn món mở được chi tiết sản phẩm.

### [A1-3.2 — Tích hợp API thật vào Menu](https://trello.com/c/QxkSUp08)

- Danh sách kế hoạch: S1 — Tuần 1.
- Phụ trách: Hoàng. Reviewer/người kiểm tra được giao: Khải.

**Công việc được giao:**

Kết nối trang Menu Next.js với `GET /products`; ánh xạ dữ liệu trả về.

**Đầu ra:** Trang Menu dùng dữ liệu API backend.

**Tiêu chí hoàn thành trên thẻ:**

- Menu gọi API NestJS và hiển thị chính xác tên/giá/ảnh.
- Không chỉ là giao diện tĩnh.
- Có minh chứng chạy thực tế.

### [A1-3.3 — Loading, empty, error và retry của Menu](https://trello.com/c/2SSr8IHl)

- Danh sách kế hoạch: S1 — Tuần 1.
- Phụ trách: Hoàng. Reviewer/người kiểm tra được giao: Khải.

**Công việc được giao:**

Hiển thị loading khi tải menu, empty khi rỗng; xử lý lỗi API và thao tác thử lại.

**Đầu ra:** Menu states và kiểm thử.

**Tiêu chí hoàn thành trên thẻ:**

- Có trạng thái loading và empty (bắt buộc Task 3).
- Lỗi API hiển thị thông báo rõ; có thể retry.
- Có test hoặc minh chứng thao tác thực tế.

### [A1-4.1 — Product Detail API và tùy chọn hợp lệ](https://trello.com/c/xkd7E0tJ)

- Danh sách kế hoạch: S1 — Tuần 2.
- Phụ trách: Hoàng. Reviewer/người kiểm tra được giao: Khang.

**Công việc được giao:**

Triển khai `GET /products/:id` trả chi tiết sản phẩm, size S/M/L và topping hợp lệ.

**Đầu ra:** API chi tiết sản phẩm và các tùy chọn.

**Tiêu chí hoàn thành trên thẻ:**

- Có `GET /products/:id` hoạt động.
- Dữ liệu size và topping trả đúng sản phẩm.
- ID không tồn tại hoặc tùy chọn không hợp lệ được xử lý.

### [A1-4.3 — Kiểm thử API tùy chọn và giá sản phẩm](https://trello.com/c/ZwZt7rKc)

- Danh sách kế hoạch: S1 — Tuần 2.
- Phụ trách: Hoàng. Reviewer/người kiểm tra được giao: Khang.

**Công việc được giao:**

Kiểm thử chi tiết sản phẩm, size/topping và tính giá theo tùy chọn.

**Đầu ra:** Test API chi tiết/giá và kết quả chạy.

**Tiêu chí hoàn thành trên thẻ:**

- Giá theo size/topping đúng.
- Xử lý ID/tùy chọn không hợp lệ.
- Test hoặc minh chứng kiểm chứng kết quả.

### [A1-10.4 — Inventory reserve/consume/release và concurrency](https://trello.com/c/Pu0J19wK)

- Danh sách kế hoạch: S2 — Tuần 4.
- Phụ trách: Hoàng. Reviewer/người kiểm tra được giao: Khang.

**Công việc được giao:**

Kiểm soát tồn kho khi khách đặt đồng thời bằng transaction + optimistic locking để không bán quá số lượng còn lại.

**Đầu ra:** Inventory concurrency control và integration tests.

**Tiêu chí hoàn thành trên thẻ:**

- Hai/nhiều request đặt cùng lúc không làm tồn kho âm hoặc bán quá số lượng.
- Có transaction và optimistic locking.
- Có test đồng thời chứng minh không oversell.

### [A1-9.3 — Migration/seed và dữ liệu demo sạch](https://trello.com/c/ME9yf6tm)

- Danh sách kế hoạch: S3 — Tuần 5.
- Phụ trách: Hoàng. Reviewer/người kiểm tra được giao: Khải.

**Công việc được giao:**

Chuẩn bị migration/seed và dữ liệu demo phục vụ trình diễn từ menu đến thanh toán.

**Đầu ra:** Dataset demo tái tạo được và log migration/seed.

**Tiêu chí hoàn thành trên thẻ:**

- Database sạch chạy migration và seed thành công.
- Menu, chi tiết và số lượng tồn phù hợp dữ liệu demo.
- Có bằng chứng chạy luồng demo.

**Các thẻ được giao review/kiểm tra:** [A1-4.2](https://trello.com/c/SB0AOTTL) (Khải); [A1-5.1](https://trello.com/c/WupVKBh8) (Khải); [A1-5.2](https://trello.com/c/9iM6qGgW) (Khải); [A1-5.3](https://trello.com/c/1S6eKGuu) (Khải); [A1-6.1](https://trello.com/c/HrLMG1mj) (Khang); [A1-6.2](https://trello.com/c/aMZs6kjK) (Khang); [A1-9.2](https://trello.com/c/Rs1BPgRm) (Khải); [A1-9.5](https://trello.com/c/hvWxq8rG) (Khang).

## Huy

### [A1-7.1 — Register/Login, bcrypt và JWT](https://trello.com/c/aq5UIFJP)

- Danh sách kế hoạch: S1 — Tuần 1.
- Phụ trách: Huy. Reviewer/người kiểm tra được giao: Khang.

**Công việc được giao:**

Triển khai `POST /auth/register` và `POST /auth/login` bằng NestJS; băm mật khẩu bằng bcrypt và cấp JWT.

**Đầu ra:** Auth API, bcrypt và JWT.

**Tiêu chí hoàn thành trên thẻ:**

- Đăng ký/đăng nhập hoạt động.
- Password được hash; không trả passwordHash trong response.
- Login hợp lệ trả JWT; thông tin sai/trùng được xử lý.

### [A1-7.2 — Auth UI, phiên, logout và 401](https://trello.com/c/7AOw8fhr)

- Danh sách kế hoạch: S1 — Tuần 2.
- Phụ trách: Huy. Reviewer/người kiểm tra được giao: Khải.

**Công việc được giao:**

Hoàn thiện giao diện đăng ký/đăng nhập Next.js; xử lý phiên, logout và lỗi token.

**Đầu ra:** Auth UI hoạt động với NestJS API.

**Tiêu chí hoàn thành trên thẻ:**

- Gửi đăng ký/đăng nhập thành công.
- Có xử lý token hết hạn và lỗi form.
- Đăng xuất và bảo vệ phiên hợp lệ.

### [A1-6.3 — JWT, validation và chủ sở hữu đơn](https://trello.com/c/Qkv7yk5f)

- Danh sách kế hoạch: S2 — Tuần 3.
- Phụ trách: Huy. Reviewer/người kiểm tra được giao: Khải.

**Công việc được giao:**

Bảo vệ `POST /orders` bằng JWT; lấy user đăng nhập từ token thay vì tin userId phía client.

**Đầu ra:** JWT guard và kiểm tra quyền sở hữu đơn.

**Tiêu chí hoàn thành trên thẻ:**

- Không có JWT hợp lệ thì không tạo được đơn.
- Đơn gắn với tài khoản đúng.
- Dữ liệu không hợp lệ bị từ chối.

### [A1-7.3 — Bảo vệ API đặt đơn và token an toàn](https://trello.com/c/bsH9dcpQ)

- Danh sách kế hoạch: S2 — Tuần 3.
- Phụ trách: Huy. Reviewer/người kiểm tra được giao: Khải.

**Công việc được giao:**

Áp dụng JWT guard cho route đặt đơn và kiểm tra an toàn dữ liệu tài khoản.

**Đầu ra:** Các route orders bảo vệ bằng token.

**Tiêu chí hoàn thành trên thẻ:**

- Thiếu/hết hạn/sai token bị từ chối.
- Không lộ passwordHash/secret.
- Người khác không thể giả userId đặt đơn.

### [A1-10.6 — Loyalty ledger/balance sau PAID](https://trello.com/c/6fYjlq7H)

- Danh sách kế hoạch: S2 — Tuần 4.
- Phụ trách: Huy. Reviewer/người kiểm tra được giao: Khang.

**Công việc được giao:**

Hiện thực khuyến mãi và tích điểm Loyalty sau khi đơn chuyển PAID; ngăn cộng điểm trùng.

**Đầu ra:** Loyalty ledger/balance và unit/integration test.

**Tiêu chí hoàn thành trên thẻ:**

- Chỉ cộng điểm cho đơn PAID.
- Thanh toán gọi lặp không cộng điểm hai lần.
- Có kiểm thử chứng minh tích điểm hợp lệ.

### [A1-9.4 — Tài khoản demo, bảo mật và hướng dẫn test](https://trello.com/c/5rFozCM5)

- Danh sách kế hoạch: S3 — Tuần 5.
- Phụ trách: Huy. Reviewer/người kiểm tra được giao: Khang.

**Công việc được giao:**

Chuẩn bị tài khoản demo cho Customer và Barista (phần mở rộng); kiểm tra bảo mật JWT và hướng dẫn thử nghiệm.

**Đầu ra:** Tài khoản demo, test guide và kết quả kiểm tra.

**Tiêu chí hoàn thành trên thẻ:**

- JWT và route đặt đơn được bảo vệ.
- Không lộ passwordHash, secrets hoặc dữ liệu của người khác.
- Tài khoản Barista chỉ thao tác chức năng nhân viên.

**Các thẻ được giao review/kiểm tra:** [A1-1.1](https://trello.com/c/DrrFi5eK) (Khang); [A1-1.2](https://trello.com/c/eZd1XUHH) (Khang); [A1-1.4](https://trello.com/c/es5MlDuG) (Khang); [A1-10.5](https://trello.com/c/PhR3V7EO) (Kiệt); [A1-9.1](https://trello.com/c/O7RIPi3z) (Khang); [EXT-UC10](https://trello.com/c/e2h3cxQ7) (Kiệt).

## Khải

### [A1-4.2 — Detail UI, size/topping và giá tạm tính](https://trello.com/c/SB0AOTTL)

- Danh sách kế hoạch: S1 — Tuần 2.
- Phụ trách: Khải. Reviewer/người kiểm tra được giao: Hoàng.

**Công việc được giao:**

Dựng giao diện chi tiết sản phẩm; cho phép chọn size S/M/L và topping, cập nhật giá theo tùy chọn.

**Đầu ra:** Màn hình chi tiết đồ uống và chọn tùy chọn.

**Tiêu chí hoàn thành trên thẻ:**

- Chọn được size S/M/L, topping.
- Giá hiển thị thay đổi đúng với size/topping.
- Cấu hình chọn được gửi vào giỏ.

### [A1-5.1 — Cart store thêm/sửa/xóa và persist](https://trello.com/c/WupVKBh8)

- Danh sách kế hoạch: S1 — Tuần 2.
- Phụ trách: Khải. Reviewer/người kiểm tra được giao: Hoàng.

**Công việc được giao:**

Thực hiện giỏ hàng: thêm món, cập nhật số lượng, xóa món, lưu state qua reload.

**Đầu ra:** Cart store và UI thao tác giỏ.

**Tiêu chí hoàn thành trên thẻ:**

- Thêm/sửa số lượng/xóa hoạt động.
- Badge số lượng và tổng tiền cập nhật.
- State giỏ được giữ qua reload.

### [A1-5.2 — Định danh dòng giỏ và tính tổng](https://trello.com/c/9iM6qGgW)

- Danh sách kế hoạch: S1 — Tuần 2.
- Phụ trách: Khải. Reviewer/người kiểm tra được giao: Hoàng.

**Công việc được giao:**

Tính tổng tiền giỏ theo sản phẩm, size, topping và số lượng; giữ cấu hình từng món.

**Đầu ra:** Hàm tính subtotal và dữ liệu dòng giỏ.

**Tiêu chí hoàn thành trên thẻ:**

- Tổng tiền và badge số lượng chính xác.
- Món khác tùy chọn không bị gộp nhầm.
- Cấu hình món được giữ khi thanh toán.

### [A1-5.3 — Kiểm thử phép tính và khôi phục giỏ](https://trello.com/c/1S6eKGuu)

- Danh sách kế hoạch: S1 — Tuần 2.
- Phụ trách: Khải. Reviewer/người kiểm tra được giao: Hoàng.

**Công việc được giao:**

Kiểm thử giỏ hàng: tổng tiền, thay đổi số lượng, xóa, reload state và tùy chọn.

**Đầu ra:** Cart tests và kết quả chạy.

**Tiêu chí hoàn thành trên thẻ:**

- Có test tổng tiền và số lượng.
- Có test thao tác thêm/sửa/xóa.
- Reload giỏ giữ trạng thái đúng.

### [A1-8.2 — Checkout UI và xử lý payment outcome](https://trello.com/c/Kgh0oBeh)

- Danh sách kế hoạch: S2 — Tuần 3.
- Phụ trách: Khải. Reviewer/người kiểm tra được giao: Khang.

**Công việc được giao:**

Xây dựng giao diện checkout chọn Ví/Thẻ; gọi API tạo đơn/thanh toán; xử lý thành công và thất bại.

**Tiêu chí hoàn thành trên thẻ:**

- Chọn phương thức Ví/Thẻ và thực hiện luồng API.
- Thanh toán lỗi: hiển thị lỗi và giữ nguyên giỏ.
- Thành công: có mã đơn, chuyển màn hình xác nhận.

### [A1-9.2 — Confirmation và History/Detail UI](https://trello.com/c/Rs1BPgRm)

- Danh sách kế hoạch: S2 — Tuần 4.
- Phụ trách: Khải. Reviewer/người kiểm tra được giao: Hoàng.

**Công việc được giao:**

Hiển thị màn hình xác nhận đơn với mã đơn/trạng thái và màn hình lịch sử gọi `GET /orders/me`.

**Đầu ra:** Confirmation UI và History UI.

**Tiêu chí hoàn thành trên thẻ:**

- Khi thanh toán thành công hiển thị mã đơn và trạng thái.
- Lịch sử hiện đơn theo tài khoản.
- Có loading/lỗi cơ bản.

**Các thẻ được giao review/kiểm tra:** [A1-2.2](https://trello.com/c/efiH6ZsB) (Hoàng); [A1-2.3](https://trello.com/c/dVDvr2KJ) (Hoàng); [A1-3.1](https://trello.com/c/YUoFJNiV) (Hoàng); [A1-3.2](https://trello.com/c/QxkSUp08) (Hoàng); [A1-3.3](https://trello.com/c/2SSr8IHl) (Hoàng); [A1-7.2](https://trello.com/c/7AOw8fhr) (Huy); [SCRUM-S1](https://trello.com/c/0giU3eGX) (Khang); [A1-6.3](https://trello.com/c/Qkv7yk5f) (Huy); [A1-7.3](https://trello.com/c/bsH9dcpQ) (Huy); [SCRUM-S2](https://trello.com/c/jWKu9kLZ) (Khang); [A1-9.3](https://trello.com/c/ME9yf6tm) (Hoàng); [SCRUM-S3](https://trello.com/c/HZwkHk4o) (Khang).

## Kiệt

### [A1-10.5 — Coupon validation và retry an toàn](https://trello.com/c/PhR3V7EO)

- Danh sách kế hoạch: S2 — Tuần 3.
- Phụ trách: Kiệt. Reviewer/người kiểm tra được giao: Huy.

**Công việc được giao:**

Hiện thực áp dụng mã giảm giá hợp lệ, kiểm tra điều kiện; phối hợp phần Loyalty để điểm chỉ cộng sau `PAID`.

**Đầu ra:** Promotions/coupon validation và kiểm thử.

**Tiêu chí hoàn thành trên thẻ:**

- Mã hợp lệ giảm giá đúng theo điều kiện.
- Mã hết hạn/không hợp lệ bị từ chối.
- Retry/thanh toán lỗi không áp dụng hoặc tiêu thụ mã lặp.
- Tích hợp được với luồng thanh toán và tích điểm.

### [A1-8.1 — Mock gateway và POST /payments](https://trello.com/c/bHBZtpqi)

- Danh sách kế hoạch: S2 — Tuần 4.
- Phụ trách: Kiệt. Reviewer/người kiểm tra được giao: Khang.

**Công việc được giao:**

Xây dựng mock payment service và NestJS `POST /payments` hỗ trợ Ví/Thẻ.

**Đầu ra:** API Payment và cổng mô phỏng.

**Tiêu chí hoàn thành trên thẻ:**

- `POST /payments` xử lý Ví/Thẻ mô phỏng.
- Thanh toán thành công/thất bại có kết quả rõ.
- Số tiền thanh toán đối chiếu với đơn phía server.

### [A1-8.3 — PAID/PAYMENT_FAILED qua OrdersService](https://trello.com/c/1bSGmT0h)

- Danh sách kế hoạch: S2 — Tuần 4.
- Phụ trách: Kiệt. Reviewer/người kiểm tra được giao: Khang.

**Công việc được giao:**

Kết nối kết quả mock payment với OrdersService để chuyển `PAID` hoặc `PAYMENT_FAILED`.

**Đầu ra:** Luồng cập nhật trạng thái thanh toán.

**Tiêu chí hoàn thành trên thẻ:**

- Thành công chuyển `PAID`.
- Lỗi chuyển `PAYMENT_FAILED` và hỗ trợ thử lại.
- Kết quả được phản ánh tới UI.

### [A1-10.3 — Payment idempotency và chống double-charge](https://trello.com/c/xhAGHMxg)

- Danh sách kế hoạch: S2 — Tuần 4.
- Phụ trách: Kiệt. Reviewer/người kiểm tra được giao: Khang.

**Công việc được giao:**

Bảo đảm `POST /payments` idempotent bằng `Idempotency-Key`; gọi lặp cùng yêu cầu không làm xử lý thanh toán/đặt đơn hai lần.

**Đầu ra:** Idempotency logic và unit/integration tests.

**Tiêu chí hoàn thành trên thẻ:**

- Hai request cùng key không tạo hai đơn/giao dịch hoặc tác dụng phụ lặp.
- Có test chứng minh gửi lặp đúng như tiêu chí Task 10.
- Key trùng nhưng nội dung khác được xử lý an toàn.

### [A1-10.2 — Hiện thực full Order State Machine](https://trello.com/c/m2aZIei1)

- Danh sách kế hoạch: S3 — Tuần 5.
- Phụ trách: Kiệt. Reviewer/người kiểm tra được giao: Khang.

**Công việc được giao:**

Hiện thực State Machine PENDING → PAID → PREPARING → READY → COMPLETED; nhánh PAYMENT_FAILED, CANCELLED và retry. Cho Barista cập nhật các bước pha chế qua OrdersService.

**Đầu ra:** State Machine runtime, API cập nhật trạng thái và test.

**Tiêu chí hoàn thành trên thẻ:**

- Các trạng thái và chuyển tiếp khớp sơ đồ đề bài.
- Chuyển tiếp sai bị từ chối, có unit/integration test.
- Barista nhận đơn chuyển PAID → PREPARING, pha xong chuyển READY, giao khách chuyển COMPLETED.

### [EXT-UC10 — Staff UI queue và cập nhật trạng thái đơn](https://trello.com/c/e2h3cxQ7)

- Danh sách kế hoạch: S3 — Tuần 5.
- Phụ trách: Kiệt. Reviewer/người kiểm tra được giao: Huy.

**Công việc được giao:**

Xây dựng giao diện Barista (phần mở rộng ngoài MVP) để nhận đơn đã thanh toán, cập nhật trạng thái pha chế và giao đơn.

**Đầu ra:** Barista UI, API guard/RBAC và demo.

**Tiêu chí hoàn thành trên thẻ:**

- Nhân viên xem được hàng đợi đơn PAID, nhận đơn thành PREPARING.
- Pha xong cập nhật READY; giao khách cập nhật COMPLETED.
- Chuyển trạng thái qua OrdersService, chặn chuyển tiếp không hợp lệ.
- Customer không sử dụng được API/UI của nhân viên.
- Không thay thế các yêu cầu MVP bắt buộc.

**Các thẻ được giao review/kiểm tra:** [A1-2.1](https://trello.com/c/CSlHeoFy) (Khang); [A1-10.1](https://trello.com/c/GvTKLkG9) (Khang).

## Nhận định về cách phân chia

Cách gọi sát nhất là **phân công theo mảng nghiệp vụ/chuyên môn, có owner cho từng đầu việc và review chéo; cùng thực hiện các luồng liên module**.

- Auth và Catalog tương đối gần một người phụ trách từ backend tới frontend; Catalog Detail UI lại do Khải.
- Orders và Payment là các luồng nhiều người cùng thực hiện những trách nhiệm khác nhau.
- Khang có vai trò tích hợp và quản lý chung nên phạm vi rộng hơn một module.
- Khải thiên frontend nhưng không làm mọi trang frontend: Menu thuộc Hoàng, Auth UI thuộc Huy, Staff UI extension thuộc Kiệt.
- Kiệt thiên backend Payment/Promotions nhưng có phần Orders/state machine và UI trong PR #28.
- Không có căn cứ kết luận công việc đã được phân đều theo SP/giờ; chỉ xác nhận có đủ 40 đầu việc và 40 lượt phân công review.

Điểm cần làm rõ khi tiếp tục: tách trách nhiệm đầu ra (owner), người thực hiện phần thay đổi cụ thể, và reviewer. Với payment/order/expiry/coupon/loyalty, cần chốt contract và người chịu trách nhiệm nghiệm thu toàn luồng vì một thay đổi có thể ảnh hưởng nhiều owner.

Không thay phân công hoặc cập nhật Trello trong lần đối chiếu này.

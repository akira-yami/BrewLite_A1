# Product Backlog BrewLite

Backlog dưới đây bám sát 10 task của đề bài. Story point là ước lượng gợi ý để lập kế hoạch, không thay thế thang điểm chấm của giảng viên.

| ID | Sprint | Hạng mục | Kết quả chấp nhận chính | SP |
|---|---:|---|---|---:|
| BL-01 | 1 | Khởi tạo monorepo | Next.js/NestJS chạy, env mẫu, lint/test, README | 3 |
| BL-02 | 1 | API danh sách sản phẩm | `GET /products`, dữ liệu seed, contract test | 3 |
| BL-03 | 1 | Trang menu | Grid sản phẩm, loading/empty/error | 3 |
| BL-04 | 1 | Chi tiết và tùy chọn | Size/topping hợp lệ, chọn đường/đá chuẩn hoặc 0/25/50/75/100%, hiển thị giá tạm tính | 5 |
| BL-05 | 2 | Giỏ hàng | Thêm/sửa/xóa, badge, persist cả đường/đá, tách dòng khác tùy chọn, tổng tạm tính | 5 |
| BL-06 | 2 | API tạo đơn | Validate, tính giá server-side, giữ tồn, tạo `PENDING` | 8 |
| BL-07 | 2 | Đăng ký/đăng nhập | Hash password, JWT, guard/ownership | 5 |
| BL-08 | 3 | Thanh toán không tiền mặt | Mock gateway, idempotency, PAID/FAILED | 8 |
| BL-09 | 3 | Xác nhận, lịch sử, bàn giao | Confirmation, `/orders/me`, Docker, demo E2E | 8 |
| BL-10 | 3 | Nghiệp vụ backend nâng cao | State machine, concurrency, coupon, loyalty, test | 13 |

## Mục tiêu Sprint

### Sprint 1 - Nền tảng và menu

Increment chạy được từ checkout sạch, frontend đọc menu thật từ backend và người dùng chọn được biến thể/topping.

### Sprint 2 - Giỏ hàng, tài khoản và tạo đơn

Khách đăng nhập, gửi giỏ lên backend, nhận order `PENDING` với tổng tiền do server xác nhận và tồn kho được giữ an toàn.

### Sprint 3 - Thanh toán và hoàn thiện nghiệp vụ

Demo trọn luồng thanh toán/xác nhận/lịch sử; có test chứng minh state machine, idempotency và concurrency; bàn giao qua Docker Compose.

## Ưu tiên rủi ro

Không để toàn bộ Task 10 đến cuối Sprint 3. Nên spike sớm ở Sprint 1/2 cho transaction, partial unique index và test concurrent PostgreSQL. Các story BL-06/BL-08 phải dùng luôn thiết kế reservation/idempotency, tránh viết lại lớn ở cuối.

## Definition of Ready

Một item sẵn sàng đưa vào Sprint khi:

- Có mô tả giá trị và Acceptance Criteria kiểm thử được.
- Dependency, API/ERD bị ảnh hưởng và dữ liệu test đã rõ.
- Không còn câu hỏi nghiệp vụ làm thay đổi đáng kể giải pháp.
- Đã ước lượng và đủ nhỏ để hoàn thành trong Sprint; nếu không thì chia nhỏ nhưng vẫn giữ increment chạy được.

# Hợp đồng nền S1-01/S1-02 — bổ sung tuần 1

Ngày đối chiếu: 09/10/2026. Owner: Khang.

Thiết kế này bổ sung cơ chế chạy cho schema/kiến trúc đã có. Đây là bản đề xuất để review, chưa phải approval của thành viên khác.

Phạm vi theo [sơ đồ gốc của nhóm](./use-case-overview.md): user/khách hàng, barista/nhân viên quầy và Mock Payment Gateway. Role tài khoản chỉ có `CUSTOMER` và `BARISTA`; gateway là tác nhân tích hợp. SD-01 giữ các liên kết barista → UC-02/UC-10 và `extend` UC-04 → UC-03, UC-07 → UC-06.

- `PrismaModule` cung cấp một `PrismaService` dùng PostgreSQL adapter. Ứng dụng connect khi khởi tạo và disconnect khi shutdown. Thiếu `DATABASE_URL` hoặc DB không kết nối được thì startup thất bại.
- `GET /api/v1/health` là readiness: chạy `SELECT 1`, trả `{ "status": "ok" }` khi DB sẵn sàng; lỗi DB trả 503 với thông báo chung, không lộ connection string.
- Build/typecheck tự generate Prisma client; source generated không commit. Docker build cũng generate; runtime có driver và client đã biên dịch.
- Migration one-shot chạy `prisma migrate deploy` trước backend; chỉ backend khởi động khi migration thành công. Không sửa migration nền đã tồn tại; thêm migration bù cho CHECK/partial unique index đã được mô tả trong database-design.
- `ProductVariant.version` là số nguyên mặc định 0 để đáp ứng nền optimistic locking Task 10-C. Inventory implementation sau này phải so sánh version đọc được và tăng version trong cùng update trừ/hoàn stock. Thay đổi này chưa tự triển khai nghiệp vụ Inventory.
- Local host dùng `localhost` cho DB; container dùng `postgres`. `.env.example` riêng của API giúp tránh sao chép nhầm hostname container.
- Smoke migration chỉ chạy vào database test được chỉ định rõ, kiểm tra database rỗng trước khi migrate; không reset DB đang dùng. Integration kiểm tra client thật, CHECK, FK và partial unique index.

API auth dùng `username`. Lượt đối chiếu [ERD gốc của nhóm](./erd.md) ngày 09/10/2026 đã đồng bộ DTO payment với enum Prisma và [API spec](./api-spec.md): method `E_WALLET | CARD`, paymentStatus `PROCESSING | SUCCEEDED | FAILED`, orderStatus riêng. Request không nhận amount/hash của client; interface nhận key từ header và userId đã xác thực. DTO/interface hiện là hợp đồng để triển khai, chưa có PaymentsService xử lý nghiệp vụ. Kiệt/Huy tiếp tục đối chiếu module với API spec và SD-04 trước integration.

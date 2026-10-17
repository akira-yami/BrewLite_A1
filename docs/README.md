# Tài liệu dự án BrewLite

Thư mục này mô tả kiến trúc đích của BrewLite dựa trên đề bài phiên bản 1.0. Repository có scaffold Next.js/NestJS, Prisma/PostgreSQL và Docker; các tài liệu là đường cơ sở để nhóm triển khai module nghiệp vụ theo từng Sprint.

Cập nhật 10/10/2026: thêm `OrderItem.sugarLevel`/`iceLevel` nullable 0..100 vào schema, migration, contract và giỏ. Quy ước null/0%, snapshot, tách dòng và tổng hợp tồn nằm trong [entity](./architecture/entities.md), [database](./architecture/database-design.md) và [API](./architecture/api-spec.md). PDF đề bài và ảnh ERD gốc giữ làm tài liệu tham chiếu; Mermaid ERD là mô hình đã cập nhật.

Bổ sung `OrderItem.note` nullable tối đa 500 ký tự: schema/migration, DTO/mapper, UI/giỏ và các tài liệu thiết kế đã đồng bộ. Quy tắc ghi chú, tách dòng và response xem [entity](./architecture/entities.md) và [API](./architecture/api-spec.md).

## Bàn giao Khang tuần 1

- [SD-01 — Use Case tổng quan](./architecture/use-case-overview.md)
- [SD-02 — Kiến trúc](./architecture/system-architecture.md)
- [SD-03 — ERD](./architecture/erd.md)
- [SD-04 — Order State Machine](./architecture/order-state-machine.md)
- [Contract bổ sung foundation](./architecture/foundation-contract.md)
- [SD-11: Thanh toán & Retry](./architecture/sequence-diagram-payment.md)

## Bàn giao Khang tuần 2

- [SD-10 — Mã PlantUML tạo đơn & giữ tồn](./architecture/diagrams/SD-10-create-order.puml)
- [Hợp đồng Orders S1-10](./architecture/orders-contract.md)
- [UC-06 — Tạo đơn hàng](./use-cases/UC-06-tao-don-hang.md)
- [OpenAPI POST /orders](./api/orders.openapi.yaml)
- [Bằng chứng kiểm tra, rà Product Detail và chuẩn bị Review/Retro](./scrum/khang-week-02-handover.md)

Thiết kế/DTO đã chuẩn bị để Hoàng review; endpoint tạo đơn thuộc S2-W3. Không tự ghi approval hoặc kết quả họp Scrum.

## Lộ trình đọc

1. [Phân tích đề bài](./phan-tich-de-bai.md): phạm vi MVP, yêu cầu, giả định và truy vết 10 task.
2. [Kiến trúc hệ thống](./architecture/system-architecture.md): kiến trúc tổng thể, module, luồng chính và quy tắc phụ thuộc.
3. [ERD](./architecture/erd.md): sơ đồ quan hệ dữ liệu và các quyết định mô hình hóa.
4. [Đặc tả entity](./architecture/entities.md): thuộc tính, enum, khóa và quy tắc của từng thực thể.
5. [Thiết kế cơ sở dữ liệu](./architecture/database-design.md): ràng buộc, index, transaction và chiến lược tồn kho.
6. [Đặc tả REST API](./architecture/api-spec.md): hợp đồng API tối thiểu và API hỗ trợ Task 10.
7. [Thiết kế bảo mật](./architecture/security.md): xác thực, phân quyền và biện pháp bảo vệ API.
8. [Thiết kế Sequence Diagram (SD-05, SD-06)](./architecture/sequence-diagrams-auth.md): luồng đăng ký, đăng nhập và phân quyền JWT/RBAC chi tiết.
9. [Đặc tả Use Case chi tiết](./use-cases/):
   - [UC-01: Đăng ký tài khoản](./use-cases/UC-01-dang-ky-tai-khoan.md)
   - [UC-02: Đăng nhập & Xác thực JWT/RBAC](./use-cases/UC-02-dang-nhap-xac-thuc-jwt.md)
   - [UC-08: Thực hiện thanh toán (Mock Gateway & Idempotency)](./use-cases/UC-08-thuc-hien-thanh-toan.md)
10. [Các quyết định kiến trúc](./decisions/ADR-001-project-architecture.md): ADR giải thích các lựa chọn chính.
11. [Hướng dẫn Docker](./deployment/docker-guide.md): topology chạy local và nguyên tắc cấu hình.
12. [Tài liệu Scrum](./scrum/product-backlog.md): backlog, user story, vai trò, kế hoạch Sprint và Definition of Done.
13. [Chiến lược kiểm thử](./testing/test-strategy.md): cách kiểm chứng acceptance criteria và ba yêu cầu bắt buộc của Task 10.

## Quy ước chung

- Số tiền dùng đơn vị đồng Việt Nam và lưu bằng số nguyên, không dùng số thực.
- Thời gian lưu theo UTC bằng `timestamptz`; giao diện chuyển sang múi giờ người dùng.
- ID dùng UUID để không lộ số lượng bản ghi và thuận tiện khi tách dịch vụ về sau.
- Tên bảng/cột trong PostgreSQL dùng `snake_case`; tên model TypeScript dùng `PascalCase`/`camelCase`.
- Backend luôn tính lại giá, khuyến mãi và tổng tiền; không tin dữ liệu giá từ frontend.
- Ảnh Use Case và ERD gốc của nhóm được giữ trong repository; Mermaid/PlantUML là bản mô tả bằng văn bản để review cùng mã nguồn.

## Phạm vi tài liệu

Kiến trúc này bao phủ luồng: xem menu -> chọn size/topping -> giỏ hàng -> đăng nhập -> tạo đơn -> thanh toán giả lập -> xác nhận/lịch sử đơn. Barista đăng nhập và cập nhật trạng thái đơn theo UC-10. Ba tác nhân và các quan hệ được giữ theo [sơ đồ Use Case gốc của nhóm](./architecture/use-case-overview.md).

## Tài liệu Scrum thực thi

- [Vai trò Scrum](./scrum/team-roles.md)
- [Board phân công 6 tuần](https://trello.com/b/JXTjedPU)
- [Sprint 1](./scrum/sprint-01.md)
- [Sprint 2](./scrum/sprint-02.md)
- [Sprint 3](./scrum/sprint-03.md)
- [Burndown](./scrum/burndown.md)
- [Definition of Done](./scrum/definition-of-done.md)

Các file Sprint/Retrospective là biểu mẫu ban đầu; nhóm phải cập nhật bằng dữ liệu thật trong quá trình thực hiện, không coi placeholder là bằng chứng Scrum đã hoàn thành.

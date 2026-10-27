# Tài liệu dự án BrewLite

Cập nhật hồ sơ A2 ngày 24/10/2026: [NFR và cách kiểm chứng](./phan-tich-de-bai.md), [AD-06 checkout end-to-end](./architecture/sequence-diagram-create-order.md), [nguồn/bản xuất sơ đồ](./architecture/diagrams/README.md), [quản lý phiên bản Task 1–3](./document-control.md), [CI quality gates](./deployment/ci-quality-gates.md). CD-02 đã đối chiếu lại với code `2bb2011`; phần snapshot 22/10 dưới đây được giữ với ngày gốc.

Thư mục này gồm thiết kế đích và minh chứng triển khai BrewLite. Đối chiếu ngày 22/10/2026 trên mã nguồn nền `7feda73`: catalog, menu/chi tiết, giỏ hàng và Auth đã có code/test; tạo đơn và thanh toán chưa hoàn thành. Thiết kế hoặc schema có sẵn không thay cho bằng chứng chức năng đã chạy.

## Hồ sơ đối chiếu và báo cáo

- [Ma trận truy vết](./traceability-matrix.md): A1/A2 → FR/NFR → UC/User Story → thiết kế → code → test → review; giữ các mã task hiện hành.
- [Tiến độ thực tế](./scrum/progress-report.md): sản phẩm đã có, khoảng trống, commit/PR và mốc cần kiểm chứng; không thay bảng 33 task đã gửi nhóm.
- [Class Diagram](./architecture/class-diagram.md): mô hình domain theo Prisma schema, nguồn PlantUML/draw.io và bản xuất.
- [Deployment Diagram](./architecture/deployment-diagram.md): topology Compose hiện có và phương án HTTPS chưa triển khai.
- [Danh mục sơ đồ](./architecture/diagrams/README.md): nguồn chuẩn, bản xuất, tình trạng đồng bộ draw.io.
- [Bàn giao/release](./deployment/release-checklist.md): E2E, required checks, CD, HTTPS, smoke và rollback còn cần minh chứng.

Nguồn đề chính thức hiện có là [BrewLite v1.0](./BrewLite-CongNghePhanMem.pdf). Phạm vi Assignment 2 được đối chiếu theo cuộc trò chuyện “Đánh giá bảng phân công”; chưa có bản đề A2 trong repo, nên các mục A2 được ghi là đối chiếu tạm thời, không coi là trích nguyên văn yêu cầu giảng viên.

Cập nhật 10/10/2026: thêm `OrderItem.sugarLevel`/`iceLevel` nullable 0..100 vào schema, migration, contract và giỏ. Quy ước null/0%, snapshot, tách dòng và tổng hợp tồn nằm trong [entity](./architecture/entities.md), [database](./architecture/database-design.md) và [API](./architecture/api-spec.md). PDF đề bài và ảnh ERD gốc giữ làm tài liệu tham chiếu; Mermaid ERD là mô hình đã cập nhật.

Bổ sung `OrderItem.note` nullable tối đa 500 ký tự: schema/migration, DTO/mapper, UI/giỏ và các tài liệu thiết kế đã đồng bộ. Quy tắc ghi chú, tách dòng và response xem [entity](./architecture/entities.md) và [API](./architecture/api-spec.md).

## Bàn giao Khang tuần 1

- [SD-01 — Use Case tổng quan](./architecture/use-case-overview.md)
- [SD-02 — Kiến trúc](./architecture/system-architecture.md)
- [SD-03 — ERD](./architecture/erd.md)
- [SD-04 — Order State Machine](./architecture/order-state-machine.md)
- [Contract bổ sung foundation](./architecture/foundation-contract.md)
- [SD-11: Thanh toán & Retry](./architecture/sequence-diagram-payment.md)
- [SD-14: Sequence lịch sử và chi tiết đơn hàng (UC-09)](./architecture/sequence-diagram-order-history-detail.md)

## Bàn giao Khang tuần 2

- [SD-10 — Mã PlantUML tạo đơn & giữ tồn](./architecture/diagrams/SD-10-create-order.puml)
- [SD-10 đã bổ sung activation và luồng Activity AD-06](./architecture/sequence-diagram-create-order.md)
- [Hợp đồng Orders S1-10](./architecture/orders-contract.md)
- [UC-06 — Tạo đơn hàng](./use-cases/UC-06-tao-don-hang.md)
- [OpenAPI POST /orders](./api/orders.openapi.yaml)
- [Bằng chứng kiểm tra, rà Product Detail và chuẩn bị Review/Retro](./scrum/khang-week-02-handover.md)
- [Huy — JWT Guard, quản lý phiên và logout/401](./scrum/huy-week-02-handover.md)

## Bàn giao Huy tuần 3

- [Huy — RBAC, Ownership Guard & User Isolation](./scrum/huy-week-03-handover.md)
- [Báo cáo phản biện kỹ thuật SD-12 & Coupon logic](./reviews/huy-review-coupon-sd12.md)

Thiết kế/DTO đã chuẩn bị để Hoàng review; endpoint tạo đơn thuộc S2-W3. Không tự ghi approval hoặc kết quả họp Scrum.

## Bàn giao Kiệt tuần 3

- [UC-07 — Áp dụng coupon](./use-cases/UC-07-ap-dung-coupon.md)
- [SD-12 — Xử lý Coupon & Khuyến mãi](./architecture/sequence-diagram-coupon.md)
- [UC-08 — Thực hiện thanh toán](./use-cases/UC-08-thuc-hien-thanh-toan.md)
- [SD-11 — Thanh toán & Retry](./architecture/sequence-diagram-payment.md)

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
   - [UC-07: Áp dụng mã giảm giá](./use-cases/UC-07-ap-dung-coupon.md)
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

Các file Sprint đã ghi trạng thái kỹ thuật theo minh chứng tại ngày 22/10/2026. Retrospective ghi rõ chưa có biên bản và nội dung chuẩn bị; nhóm cần bổ sung sự kiện, feedback, approval và nghiệm thu thực tế trước khi dùng làm bằng chứng Scrum hoàn thành.

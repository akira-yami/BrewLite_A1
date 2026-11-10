# Tài liệu dự án BrewLite

Đối chiếu ngày 04/11/2026 với [đề bài BrewLite v1.0](BrewLite-CongNghePhanMem.pdf). Bản PDF này có SHA-256 trùng với bản đề bài được cung cấp ngoài dự án.

## Đề bài yêu cầu gì?

Đề không quy định tên hoặc số lượng file Markdown, cũng không yêu cầu báo cáo bàn giao cá nhân theo week. Bảng dưới phân biệt nội dung cần có với tài liệu hỗ trợ; số trang là số in trong đề (không tính bìa).

| Nội dung | Căn cứ trong đề | Tài liệu giữ lại / vị trí đối chiếu |
|---|---|---|
| Vai trò PO/SM/Development Team; Planning, Daily, Review, Retro | Mục 2.1–2.2, trang 2 | [Vai trò nhóm](scrum/team-roles.md), hồ sơ Sprint và Retro |
| Product Backlog, Sprint Backlog, Increment; kế hoạch 3 Sprint là gợi ý | Mục 2.1–2.3 và 8, trang 2, 5–6 | [Product Backlog](scrum/product-backlog.md), [Sprint 1](scrum/sprint-01.md), [Sprint 2](scrum/sprint-02.md), [Sprint 3](scrum/sprint-03.md) |
| Theo dõi SP còn lại cuối mỗi ngày; Ideal/Actual burndown | Mục 2.4, trang 2–3 | [Burndown](scrum/burndown.md) |
| Requirements, User Story/AC và luồng chọn món đến thanh toán | Mục 3–5 và 8, trang 3–6 | [Đề bài gốc](BrewLite-CongNghePhanMem.pdf), [Product Backlog](scrum/product-backlog.md); báo cáo PDF/LaTeX giữ cục bộ ngoài Git |
| DoD, review nhóm, validate API, UI loading/lỗi, hướng dẫn chạy | Mục 10, trang 7 | [Definition of Done](scrum/definition-of-done.md), [README dự án](../README.md), Git/PR và mã nguồn/test |
| Unit/integration test cho chuyển trạng thái sai, idempotency và tồn kho đồng thời | Mục 9, trang 6 | Test trong `apps/api`, [audit và kết quả kiểm chứng](scrum/trello-audit-2026-11-03.md), [log kiểm thử](scrum/evidence/trello-audit-2026-11-03/) |
| Demo E2E, Git, Docker Compose, README; Retro và phản hồi/backlog phiên bản sau | Task 9 và mục 11, trang 6–7 | [README dự án](../README.md), [Compose](../compose.yaml), [hướng dẫn E2E](../tests/e2e/README.md), Review/Retro trong hồ sơ Sprint |
| API và mô hình dữ liệu tối thiểu | Mục 12, trang 7 | Controller/DTO, [schema Prisma](../apps/api/prisma/schema.prisma), [ERD](architecture/erd.md); [API Barista mở rộng](api/staff-orders.md) |

ERD/PlantUML, đặc tả API riêng và các bản audit là tài liệu hỗ trợ thiết kế, vận hành và truy vết; đề không yêu cầu chúng phải là file độc lập. Giữ ERD theo yêu cầu của nhóm. Đề này không quy định bộ hồ sơ Assignment 2 riêng; các gói A2 được nhắc trong hồ sơ cũ hiện không có trong checkout.

## Kiến trúc, API và kiểm thử

- [Bản đồ tri thức hệ thống (Nền tảng, Orders, Tích hợp, Barista, Kho, Luồng chạy & Q&A)](knowledge-map.md)
- [ERD và nguyên tắc dữ liệu](architecture/erd.md)
- [Nguồn ERD PlantUML](../database/BrewLite.puml) · [Ảnh PNG](../database/BrewLite.png) · [Ảnh SVG phóng to](../database/BrewLite.svg)
- [API quản lý kho nguyên liệu](api/staff-inventory.md).
- [Nghiệm thu Compose, Barista và kho](testing/staff-acceptance.md).
- [API đơn hàng cho Barista](api/staff-orders.md): hợp đồng API cho phần mở rộng đang có trong mã nguồn.
- [Vòng đời reservation và seed demo](testing/reservation-and-demo-seed.md): giữ kiến thức nghiệp vụ/kiểm thử có ích, bỏ cách đặt tên theo PR.
- [Hướng dẫn API](../apps/api/README.md), [frontend](../apps/web/README.md), [browser E2E](../tests/e2e/README.md).

## Hồ sơ Scrum và kiểm chứng

- [Phân công hiện hành: 41 đầu việc theo báo cáo](scrum/phan-cong.md), đã chuyển EXT quản lý kho nguyên liệu từ Khải sang Khang.
- [Vai trò nhóm](scrum/team-roles.md), [đối chiếu lịch sử 40 thẻ Trello ngày 03/11](scrum/team-assignment-analysis-2026-11-03.md).
- [Product Backlog](scrum/product-backlog.md), [Definition of Done](scrum/definition-of-done.md), [Burndown](scrum/burndown.md).
- [Sprint 1](scrum/sprint-01.md) · [Retro 1](scrum/retrospectives/sprint-01-retro.md).
- [Sprint 2](scrum/sprint-02.md) · [Retro 2](scrum/retrospectives/sprint-02-retro.md).
- [Sprint 3](scrum/sprint-03.md) · [Retro 3](scrum/retrospectives/sprint-03-retro.md).
- [Tiến độ lịch sử 22/10](scrum/progress-report.md): giữ để đọc các hồ sơ Sprint cùng baseline, không dùng như hiện trạng.
- [Audit ngày 03/11](scrum/trello-audit-2026-11-03.md) và [minh chứng](scrum/evidence/trello-audit-2026-11-03/): được báo cáo chính tham chiếu; kết quả chỉ có giá trị tại lần chạy ghi trong audit.

Các Sprint/Retro còn ghi thiếu biên bản họp, quyết định nghiệm thu và phản hồi; burndown chưa có chuỗi Actual. Giữ các hồ sơ này vì gắn với yêu cầu Scrum, nhưng cần bổ sung dữ liệu thật trước khi bàn giao. Việc dọn docs không xác nhận các nội dung đó đã hoàn thành.

## Quy tắc giữ và dọn

Đã xóa 5 bản bàn giao cá nhân theo week, 9 file log/manifest của đợt week 3 và 2 ảnh kiểm chứng week 2, cùng thư mục rỗng. Không giữ bản sao hoặc đổi tên các tài liệu week để né việc dọn. Đã gỡ liên kết đến tài liệu bị xóa và các gói A2 không còn trong checkout.

Giữ đề bài, ERD, tài liệu API/nghiệp vụ hữu ích, toàn bộ hồ sơ Sprint/Retro và tài liệu Scrum liên quan. Giữ bộ audit 03/11 cùng log và snapshot vì còn dùng làm minh chứng cho báo cáo và nghiệm thu.

Chạy kiểm tra tài liệu từ thư mục gốc:

```sh
node scripts/check-docs.mjs
```

# Quản lý phiên bản tài liệu Task 1–3

Ngày 24/10/2026; baseline code `2bb2011`. Áp dụng A2-4.2 và A2-2-HS. Danh mục máy đọc được: [document-register.json](./document-register.json). Tài liệu được version trong Git; trạng thái review/đo/runtime được ghi riêng, không suy ra từ sự tồn tại của file.

| Task | Bộ tạo phẩm | Nguồn và kiểm soát |
|---|---|---|
| 1 — Yêu cầu | [SRS, FR/NFR, stakeholder, MoSCoW, AC](./phan-tich-de-bai.md), [User Stories](./scrum/user-stories.md), [Use Case](./architecture/use-case-overview.md), [UC chi tiết](./use-cases/UC-06-tao-don-hang.md) | Markdown là nguồn chuẩn; UC-01/02/06/07/08 có đặc tả riêng, các UC còn lại được truy vết qua SRS/US/API, chưa coi là đã đủ đặc tả riêng của toàn nhóm |
| 2 — Mô hình | AD-06; SD-05/06/10/11/12/14; CD-01/02 | [Danh mục sơ đồ](./architecture/diagrams/README.md); mỗi PlantUML có SVG + PNG và SHA-256 trong manifest; enum-contract đối chiếu Prisma |
| 3 — Kiến trúc | [SD-02](./architecture/system-architecture.md), [dependency](./architecture/dependency-map.md), [ERD](./architecture/erd.md), [database](./architecture/database-design.md), [security](./architecture/security.md), [deployment](./architecture/deployment-diagram.md), ADR-001..004 | Markdown + DD-01/DD-02 có bản xuất; DD-02 vẫn là phương án, chưa xác nhận production/CD/HTTPS |

## Quy trình thay đổi

1. Tạo branch `codex/<nội-dung>` từ main mới nhất, ghi mã task, vấn đề và lý do trong PR. Không sửa migration cũ để làm tài liệu trông khớp.
2. Sửa nguồn chuẩn trước. Thay đổi enum/state cập nhật SRS, UC, state machine, sequence, class và API liên quan; phân biệt contract đích với hiện trạng code. CD-02 phản ánh lớp/method thực tế tại baseline ghi trên sơ đồ.
3. Xuất lại sơ đồ bằng [script render](../scripts/render-diagrams.mjs), kiểm tra trực quan, commit nguồn/ảnh/manifest cùng nhau. Không sửa PNG/SVG bằng tay. `archive/` chỉ chứa lịch sử, không dùng làm bản nộp hiện hành.
4. Chạy `node scripts/check-docs.mjs`: link tới file, code fence, danh mục tạo phẩm, hash nguồn/ảnh và enum. Job `Documentation` chạy trên mỗi PR, cùng Frontend/Backend/Database. Kiểm tra tự động không thay review ngữ nghĩa hoặc đo NFR.
5. PR ghi changed artifacts, lý do, baseline, lệnh/kết quả, giới hạn và reviewer. Review NFR/Activity/hồ sơ: Kiệt; CI: Huy. Không tự ghi APPROVED hoặc nghiệm thu thay reviewer.
6. Sau merge, lấy merge SHA làm version bàn giao, dẫn PR/run từ Trello; nếu rollback tài liệu thì revert cả nguồn/ảnh/manifest trong một PR. Lịch sử Git và PR là nguồn version, không tạo các file `final-v2-new` song song.

## Ghi nhận thay đổi 24/10/2026

| Task | Thay đổi và lý do | Kiểm chứng |
|---|---|---|
| A2-1.2.2 | NFR-01..11 có metric, phép đo, evidence và trạng thái; bổ sung availability/deployment | Review nội dung SRS; chưa nhận là các chỉ tiêu đã đo đạt |
| A2-2.1 | AD-06 mở rộng từ tạo đơn sang checkout end-to-end | PlantUML render + kiểm tra đường đi ở tài liệu SD-10 |
| A2-2-HS | Bộ nguồn/xuất hiện hành, CD-02 cập nhật code, archive draw.io cũ, manifest và enum check | `node scripts/check-docs.mjs`; xem SVG/PNG |
| A2-4.2 | Register Task 1–3 và quy trình PR/source/export | Job Documentation; PR của nhánh `codex/a2-docs-quality-gates` |
| A2-4.4 | Bắt buộc CI bằng ruleset riêng, lưu run pass/fail | [Hồ sơ quality gate](./deployment/ci-quality-gates.md) |

Việc quản lý phiên bản được thực hiện cho các tạo phẩm hiện có; không thay quyền sở hữu các task yêu cầu/UI/production của thành viên khác. Đề A2 chính thức chưa có trong repo, nên mapping Task 1–3 vẫn dựa theo board và trao đổi của nhóm.

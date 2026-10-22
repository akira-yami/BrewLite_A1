# Sprint 1

**Thời lượng kế hoạch:** 2 tuần, Tuần 1–2 của dự án (10 ngày làm việc dự kiến). **Đối chiếu:** 22/10/2026, baseline `7feda73`.

## Sprint Goal

Nền tảng dự án chạy được và người dùng xem/chọn được sản phẩm.

## Sprint Backlog giữ nguyên

| Backlog item | Nội dung | Trạng thái kỹ thuật | Minh chứng / phần còn thiếu |
|---|---|---|---|
| Task 1 | Khởi tạo dự án và cấu trúc | REVIEW | Có scaffold, Prisma/migrations, Compose, CI; cần runtime smoke và nghiệm thu |
| Task 2 | API danh sách sản phẩm | REVIEW | GET /products + unit/S1 DB test; list còn topping inactive available=false |
| Task 3 | Trang Menu tích hợp API | REVIEW | Menu dùng API thật; cần demo loading/empty/error và responsive |
| Task 4 | Chi tiết sản phẩm, size/topping/đường/đá/ghi chú | REVIEW | Detail route có từ 23736aa; có UI/test option; cần demo tích hợp |

AC theo [Product Backlog](./product-backlog.md), [User Story](./user-stories.md) và [truy vết](../traceability-matrix.md). Giữ nguyên task/nội dung. Assignee, SP và lịch cam kết chính thức tiếp tục lấy từ workbook/board đã gửi nhóm; tài liệu này không tự giao lại việc. Owner domain tham chiếu [Use Case overview](../architecture/use-case-overview.md).

Trạng thái `TODO → IN_PROGRESS → REVIEW → DONE`: REVIEW là có sản phẩm cần kiểm chứng/review; IN_PROGRESS có thể mới ở mức thiết kế. Chưa ghi DONE khi thiếu bằng chứng [DoD](./definition-of-done.md) và PO nghiệm thu.

## Kế hoạch và minh chứng

- Ngày bắt đầu/kết thúc chính thức: chưa có biên bản Planning trong repo; không suy từ ngày commit.
- Tổng SP theo ước lượng BL trong repo: **14**, chưa phải SP cam kết của workbook 33 task.
- [Board phân công 6 tuần](https://trello.com/b/JXTjedPU); [tiến độ](./progress-report.md); [burndown](./burndown.md).
- [Khang W2](./khang-week-02-handover.md) ghi kết quả tại ngày 17/10. PR #19 bổ sung detail sau đó; [báo cáo 22/10](./progress-report.md) ghi cập nhật, không sửa ngược kết quả kiểm chứng lịch sử.

## Sprint Review

Chưa có biên bản có thời gian, người tham dự, demo, quyết định PO và phản hồi trong repo. Kết quả code/test là đầu vào Review, chưa tự ghi Accepted hoặc lời nhận xét của nhóm/giảng viên.

Điều kiện cần đối chiếu: Review menu/detail/cart; đối chiếu option/contract; lưu approval SD-10, quyết định Accepted/Not Accepted và carry-over.

Khi Review diễn ra, lưu ngày giờ/người tham dự; SHA/PR/CI và link demo; từng task Accepted/Not Accepted kèm AC; phản hồi và carry-over. Hiện chưa xác nhận ngày Sprint kết thúc theo lịch lớp.

## Retrospective

[Retro Sprint 1](./retrospectives/sprint-01-retro.md) ghi rõ chưa có biên bản và các đầu vào cần thảo luận; không điền kết quả họp giả.
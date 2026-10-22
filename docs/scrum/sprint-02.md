# Sprint 2

**Thời lượng kế hoạch:** 2 tuần, Tuần 3–4 của dự án (10 ngày làm việc dự kiến). **Đối chiếu:** 22/10/2026, baseline `7feda73`.

## Sprint Goal

Hoàn thiện giỏ hàng, xác thực và tạo đơn PENDING với giá backend xác nhận; snapshot đường/đá/note và giữ tồn theo tổng quantity mỗi variant.

## Sprint Backlog giữ nguyên

| Backlog item | Nội dung | Trạng thái kỹ thuật | Minh chứng / phần còn thiếu |
|---|---|---|---|
| Task 5 | Giỏ hàng | REVIEW | Đã merge PR #20; có test thêm/sửa/xóa/persist; chưa nghiệm thu payment flow |
| Task 6 | API tạo đơn hàng | IN_PROGRESS | Có DTO/mapper/pricing; chưa có controller/transaction lưu order và reservation |
| Task 7 | Đăng ký/đăng nhập JWT | IN_PROGRESS | Có Auth/session/RBAC và test; thiếu guard/ownership trên order/payment thật |

AC theo [Product Backlog](./product-backlog.md), [User Story](./user-stories.md) và [truy vết](../traceability-matrix.md). Giữ nguyên task/nội dung. Assignee, SP và lịch cam kết chính thức tiếp tục lấy từ workbook/board đã gửi nhóm; tài liệu này không tự giao lại việc. Owner domain tham chiếu [Use Case overview](../architecture/use-case-overview.md).

Trạng thái `TODO → IN_PROGRESS → REVIEW → DONE`: REVIEW là có sản phẩm cần kiểm chứng/review; IN_PROGRESS có thể mới ở mức thiết kế. Chưa ghi DONE khi thiếu bằng chứng [DoD](./definition-of-done.md) và PO nghiệm thu.

## Kế hoạch và minh chứng

- Ngày bắt đầu/kết thúc chính thức: chưa có biên bản Planning trong repo; không suy từ ngày commit.
- Tổng SP theo ước lượng BL trong repo: **18**, chưa phải SP cam kết của workbook 33 task.
- [Board phân công 6 tuần](https://trello.com/b/JXTjedPU); [tiến độ](./progress-report.md); [burndown](./burndown.md).
- [Huy W2](./huy-week-02-handover.md), [Huy W3](./huy-week-03-handover.md) và PR #18/#20/#21/#22. Test Auth chưa chứng minh bảo vệ route đặt đơn chưa tồn tại.

## Sprint Review

Chưa có biên bản có thời gian, người tham dự, demo, quyết định PO và phản hồi trong repo. Kết quả code/test là đầu vào Review, chưa tự ghi Accepted hoặc lời nhận xét của nhóm/giảng viên.

Điều kiện cần đối chiếu: Tạo đơn với JWT/giá server; commit/rollback PostgreSQL thật và concurrent stock. Ownership phải đối chiếu order.userId với principal.

Khi Review diễn ra, lưu ngày giờ/người tham dự; SHA/PR/CI và link demo; từng task Accepted/Not Accepted kèm AC; phản hồi và carry-over. Hiện chưa xác nhận ngày Sprint kết thúc theo lịch lớp.

## Retrospective

[Retro Sprint 2](./retrospectives/sprint-02-retro.md) ghi rõ chưa có biên bản và các đầu vào cần thảo luận; không điền kết quả họp giả.
# Sprint 3

> Hồ sơ kế hoạch và đối chiếu lịch sử ngày 22/10/2026; trạng thái kỹ thuật bên dưới không đại diện cho code hiện tại. Xem [audit 03/11/2026](trello-audit-2026-11-03.md).

**Thời lượng kế hoạch:** 2 tuần, Tuần 5–6 của dự án (10 ngày làm việc dự kiến). **Đối chiếu:** 22/10/2026, baseline `7feda73`.

## Sprint Goal

Hoàn thiện thanh toán, xác nhận/lịch sử, Docker và chứng minh các nghiệp vụ backend nâng cao.

## Sprint Backlog giữ nguyên

| Backlog item | Nội dung | Trạng thái kỹ thuật | Minh chứng / phần còn thiếu |
|---|---|---|---|
| Task 8 | Thanh toán không tiền mặt | IN_PROGRESS | Có DTO/mock gateway; endpoint chưa bật; orchestration chưa triển khai |
| Task 9 | Xác nhận, lịch sử đơn và Docker Compose | IN_PROGRESS | Có Compose/Dockerfile, SD-14 bản làm việc; thiếu history API/UI và demo E2E |
| Task 10 | State machine, idempotency, concurrent stock, promotion/loyalty | IN_PROGRESS | Có schema/constraint/thiết kế; thiếu runtime và test nghiệp vụ đồng thời |

AC theo [Product Backlog](product-backlog.md), User Story (tài liệu A2 chưa có trong checkout) và truy vết (tài liệu A2 chưa có trong checkout). Giữ nguyên task/nội dung. Assignee, SP và lịch cam kết chính thức tiếp tục lấy từ workbook/board đã gửi nhóm; tài liệu này không tự giao lại việc. Owner domain tham chiếu Use Case overview (tài liệu A2 chưa có trong checkout).

Trạng thái `TODO → IN_PROGRESS → REVIEW → DONE`: REVIEW là có sản phẩm cần kiểm chứng/review; IN_PROGRESS có thể mới ở mức thiết kế. Chưa ghi DONE khi thiếu bằng chứng [DoD](definition-of-done.md) và PO nghiệm thu.

## Kế hoạch và minh chứng

- Ngày bắt đầu/kết thúc chính thức: chưa có biên bản Planning trong repo; không suy từ ngày commit.
- Tổng SP theo ước lượng BL trong repo: **29**, chưa phải SP cam kết của workbook 33 task.
- [Board phân công 6 tuần](https://trello.com/b/JXTjedPU); [tiến độ](progress-report.md); [burndown](burndown.md).
- SD-11 (tài liệu A2 chưa có trong checkout), SD-14 (tài liệu A2 chưa có trong checkout), review coupon (bản review cũ không còn trong checkout). Mock gateway/unique index chưa chứng minh payment idempotency qua HTTP.

## Sprint Review

Chưa có biên bản có thời gian, người tham dự, demo, quyết định PO và phản hồi trong repo. Kết quả code/test là đầu vào Review, chưa tự ghi Accepted hoặc lời nhận xét của nhóm/giảng viên.

Điều kiện cần đối chiếu: MVP checkout → payment → confirmation/history; TC-04/05/07; coupon/loyalty không lặp; stack sạch và hồ sơ release/smoke/rollback (tài liệu A2 chưa có trong checkout).

Khi Review diễn ra, lưu ngày giờ/người tham dự; SHA/PR/CI và link demo; từng task Accepted/Not Accepted kèm AC; phản hồi và carry-over. Hiện chưa xác nhận ngày Sprint kết thúc theo lịch lớp.

## Retrospective

[Retro Sprint 3](retrospectives/sprint-03-retro.md) ghi rõ chưa có biên bản và các đầu vào cần thảo luận; không điền kết quả họp giả.
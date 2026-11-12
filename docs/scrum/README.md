# Scrum BrewLite — Assignment 1

Nhóm theo dõi Sprint Backlog, người phụ trách, reviewer và hạn bàn giao trên [board Trello BrewLite](https://trello.com/b/JXTjedPU/brewlite-phan-cong-chi-ti%E1%BA%BFt-5-tu%E1%BA%A7n-assigment1). [Bảng phân công theo tuần](phan-cong.md) liên kết trực tiếp đến từng thẻ. Hạn dưới đây theo giờ Việt Nam (UTC+7). Ngày bắt đầu của các tuần được suy ra theo lịch liên tiếp từ 05/10/2026 và các hạn cuối tuần trên board.

## Vai trò Scrum

| Vai trò | Thành viên | Trách nhiệm |
|---|---|---|
| Product Owner | Khang | Ưu tiên Product Backlog, làm rõ tiêu chí chấp nhận và nghiệm thu Increment. |
| Scrum Master | Khang | Điều phối các sự kiện Scrum và hỗ trợ gỡ vướng cho nhóm. |
| Developers | Khang, Hoàng, Huy, Khải, Kiệt | Phân tích, thiết kế, phát triển, kiểm thử và bàn giao Increment. |

## Mốc thời gian

| Sprint | Tuần | Thời gian | Phạm vi bàn giao theo Trello |
|---|---|---|---|
| 1 | 1 | 05–11/10/2026 | Monorepo, NestJS/Next.js, PostgreSQL/Prisma, API danh sách và UI menu, API xác thực, thiết kế trạng thái đơn. |
| 1 | 2 | 12–18/10/2026 | Chi tiết sản phẩm, tùy chọn và giá, giỏ hàng, giao diện xác thực. Hạn Review/Retro [SCRUM-S1](https://trello.com/c/0giU3eGX) ngày **18/10/2026**. |
| 2 | 3 | 19–25/10/2026 | Tạo đơn, tính giá phía máy chủ, snapshot và rollback, phân quyền đơn, checkout và coupon. |
| 2 | 4 | 26/10–01/11/2026 | Thanh toán giả lập, lịch sử đơn, idempotency, giữ tồn và loyalty. Hạn Review/Retro [SCRUM-S2](https://trello.com/c/jWKu9kLZ) ngày **01/11/2026**. |
| 3 | 5 | 02–08/11/2026 | Seed demo, tài khoản demo, Docker Compose và README bàn giao, triển khai state machine, giao diện Barista và quản lý kho. |
| 3 | 6 | 09–15/11/2026 | Hạn hủy đơn và hoàn tiền vào điểm tích lũy [A1-EXT-03](https://trello.com/c/lEsEevGC) ngày **13/11/2026**. Hạn Review/Retro và hồ sơ bàn giao [SCRUM-S3](https://trello.com/c/HZwkHk4o) ngày **15/11/2026**. |

## Sự kiện Scrum

- **Sprint Planning:** Chốt mục tiêu sprint, chọn hạng mục từ Product Backlog và xác định đầu ra cần demo. Ghi người phụ trách, reviewer và hạn vào Sprint Backlog.
- **Daily Scrum:** Rà tiến độ so với mục tiêu sprint, cập nhật việc tiếp theo, vướng mắc và khối lượng còn lại.
- **Sprint Review:** Demo Increment, đối chiếu tiêu chí chấp nhận và ghi phản hồi, quyết định nghiệm thu cùng các việc chuyển sang sprint sau.
- **Sprint Retrospective:** Ghi điều làm tốt, vấn đề gặp phải và hành động cải tiến kèm người phụ trách và thời hạn.

Trello đánh dấu xong thẻ Review/Retro của Sprint 1 và 2. Thẻ Review/Retro của Sprint 3 còn mở và chưa được đánh dấu xong. Các hạn trong bảng là hạn của thẻ, còn ngày họp và kết quả nghiệm thu cần biên bản tương ứng.

## Definition of Done

- Đầu ra đáp ứng tiêu chí chấp nhận ghi trên thẻ và được reviewer kiểm tra.
- Thay đổi mã qua build, lint và các bài kiểm thử liên quan. Luồng nghiệp vụ được kiểm tra qua UI hoặc API khi phù hợp.
- Thẻ liên kết tới minh chứng như PR, commit, kết quả kiểm thử hoặc biên bản. Thay đổi ảnh hưởng tới cách chạy hoặc demo có hướng dẫn đi kèm.

Xem [tài liệu kiểm thử và nghiệm thu](../README.md#4-kiểm-thử--nghiệm-thu) để tra kết quả theo nghiệp vụ.

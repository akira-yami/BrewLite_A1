# Cập nhật Sprint Burndown

Đề bài dùng Burndown để theo dõi số story point còn lại theo từng ngày của Sprint. Không điền dữ liệu mẫu vào báo cáo cuối; dùng số liệu thực tế của nhóm.

## Hiện trạng ngày 22/10/2026

Chưa có chuỗi SP thực tế từng ngày hoặc biên bản Planning xác nhận SP cam kết trong repo. Chưa đủ dữ liệu để vẽ đường Actual; không dựng lại số liệu ngày từ commit hoặc phần trăm ước tính.

| Sprint | SP theo ước lượng BL trong repo | SP cam kết / Actual |
|---|---:|---|
| 1: BL-01..04 | 14 | Chưa ghi nhận |
| 2: BL-05..07 | 18 | Chưa ghi nhận |
| 3: BL-08..10 | 29 | Chưa ghi nhận |

Đây là SP trong [Product Backlog](product-backlog.md), không thay SP của workbook 33 task đã gửi nhóm. Các giá trị này không dùng làm mẫu số đóng góp cá nhân.

## Cách ghi khi có dữ liệu

Mỗi dòng cần: ngày thực tế, Sprint, SP cam kết ban đầu, SP còn lại, task đạt DoD/được nghiệm thu, thay đổi phạm vi và link evidence. Ngày 0 lấy từ Planning; chỉ giảm SP khi đạt quy ước Done của nhóm. Không suy ngày Done từ ngày merge.

- Cập nhật cuối mỗi ngày làm việc.
- Đường **Ideal** giảm đều từ tổng SP xuống 0.
- Đường **Actual** lấy từ cột story point còn lại.
- Nếu Actual cao hơn Ideal, ghi blocker/rủi ro trong Sprint note thay vì chỉnh số liệu để làm đẹp biểu đồ.

# Phân công công việc BrewLite

Cập nhật ngày 04/11/2026 theo chương 2, bảng 2.1–2.5 của báo cáo `BrewLite-Report/report/build/main.pdf` (trang in 3–4, trang PDF 5–6). Giữ nguyên 41 đầu việc, thứ tự và lịch trong báo cáo; áp dụng điều chỉnh của nhóm: **STT 41 – Giao diện quản lý kho nguyên liệu chuyển từ Khải sang Khang**.

PDF được cung cấp chỉ có tuần 1–5, không có tuần 10. Mục EXT của Khải được xác định là STT 41; không tự thêm mốc tuần 10. STT 38 (máy trạng thái đơn hàng) và STT 39 (giao diện nhân viên) vốn đã giao Khang trong PDF và được giữ nguyên.

Đây là bản phân công hiện hành trong docs. [Đối chiếu Trello ngày 03/11](team-assignment-analysis-2026-11-03.md) và [audit ngày 03/11](trello-audit-2026-11-03.md) là hồ sơ lịch sử, có thể khác phân công dưới đây. Bản này ghi người chịu trách nhiệm đầu ra; không suy trạng thái hoàn thành hoặc tỷ lệ đóng góp từ số đầu việc. Bản PDF nguồn chưa được sửa trong lần cập nhật docs này.

## Tổng hợp người phụ trách

| Thành viên | Số đầu việc | STT |
|---|---:|---|
| Khang | 15 | 1, 2, 4, 5, 12, 20, 21, 22, 29, 34, 37, 38, 39, 40, 41 |
| Hoàng | 10 | 3, 6, 7, 8, 9, 10, 13, 15, 32, 35 |
| Huy | 6 | 11, 19, 23, 24, 33, 36 |
| Khải | 6 | 14, 16, 17, 18, 25, 30 |
| Kiệt | 4 | 26, 27, 28, 31 |
| **Tổng** | **41** | **1–41** |

## Sprint 1 – Nền tảng, menu và chi tiết sản phẩm

### Giai đoạn 05/10–11/10/2026

| STT | Công việc | Phụ trách |
|---|---|---|
| 1 | Khởi tạo kho mã nguồn và khung ứng dụng máy chủ | Khang |
| 2 | Khởi tạo ứng dụng Next.js và kết nối máy chủ | Khang |
| 3 | Kết nối cơ sở dữ liệu và chuẩn bị dữ liệu mẫu | Hoàng |
| 4 | Cấu hình môi trường, kiểm tra mã nguồn và hướng dẫn cài đặt | Khang |
| 5 | Đặc tả dữ liệu và giao diện lập trình danh sách sản phẩm | Khang |
| 6 | Dữ liệu thực đơn và chức năng truy xuất sản phẩm | Hoàng |
| 7 | Kiểm thử chức năng truy xuất danh sách sản phẩm | Hoàng |
| 8 | Giao diện thực đơn cho thiết bị di động | Hoàng |
| 9 | Tích hợp dữ liệu sản phẩm vào giao diện thực đơn | Hoàng |
| 10 | Xử lý trạng thái tải, dữ liệu rỗng, lỗi và thử lại | Hoàng |
| 11 | Đăng ký, đăng nhập và xác thực tài khoản | Huy |
| 12 | Thiết kế máy trạng thái đơn hàng | Khang |

### Giai đoạn 12/10–18/10/2026

| STT | Công việc | Phụ trách |
|---|---|---|
| 13 | Truy xuất chi tiết và tùy chọn sản phẩm | Hoàng |
| 14 | Giao diện chọn kích cỡ, topping và giá tạm tính | Khải |
| 15 | Kiểm thử tùy chọn và giá sản phẩm | Hoàng |
| 16 | Thao tác thêm, sửa, xóa và lưu giỏ hàng | Khải |
| 17 | Định danh dòng hàng và tính tổng giỏ hàng | Khải |
| 18 | Kiểm thử tính tiền và khôi phục giỏ hàng | Khải |
| 19 | Giao diện xác thực và quản lý phiên đăng nhập | Huy |
| 20 | Tổng kết và hoàn thiện hồ sơ đợt phát triển thứ nhất | Khang |

## Sprint 2 – Đặt đơn, thanh toán và lịch sử

### Giai đoạn 19/10–25/10/2026

| STT | Công việc | Phụ trách |
|---|---|---|
| 21 | Chức năng tạo đơn và xác nhận giá tại máy chủ | Khang |
| 22 | Lưu thông tin đơn hàng và bảo đảm toàn vẹn giao dịch | Khang |
| 23 | Kiểm tra dữ liệu và xác thực chủ sở hữu đơn hàng | Huy |
| 24 | Bảo vệ chức năng đặt đơn và thông tin xác thực | Huy |
| 25 | Giao diện thanh toán và xử lý kết quả | Khải |
| 26 | Kiểm tra mã giảm giá và xử lý an toàn khi thử lại | Kiệt |

### Giai đoạn 26/10–01/11/2026

| STT | Công việc | Phụ trách |
|---|---|---|
| 27 | Cổng thanh toán giả lập và chức năng thanh toán | Kiệt |
| 28 | Cập nhật trạng thái đơn theo kết quả thanh toán | Kiệt |
| 29 | Truy xuất lịch sử và chi tiết đơn hàng | Khang |
| 30 | Giao diện xác nhận, lịch sử và chi tiết đơn hàng | Khải |
| 31 | Ngăn giao dịch thanh toán trùng lặp | Kiệt |
| 32 | Xử lý giữ, sử dụng, hoàn nguyên liệu và truy cập đồng thời | Hoàng |
| 33 | Ghi nhận giao dịch điểm thưởng và cập nhật số dư | Huy |
| 34 | Tổng kết và hoàn thiện hồ sơ đợt phát triển thứ hai | Khang |

## Sprint 3 – Hoàn thiện và bàn giao

### Giai đoạn 02/11–08/11/2026

| STT | Công việc | Phụ trách |
|---|---|---|
| 35 | Chuẩn bị cấu trúc cơ sở dữ liệu và dữ liệu trình diễn | Hoàng |
| 36 | Chuẩn bị tài khoản trình diễn và hướng dẫn kiểm tra bảo mật | Huy |
| 37 | Đóng gói môi trường triển khai và tài liệu bàn giao | Khang |
| 38 | Hiện thực đầy đủ máy trạng thái đơn hàng | Khang |
| 39 | Giao diện nhân viên và cập nhật trạng thái đơn | Khang |
| 40 | Tổng kết và hoàn thiện hồ sơ đợt phát triển thứ ba | Khang |
| 41 | Giao diện quản lý kho nguyên liệu (EXT; chuyển từ Khải sang Khang) | Khang |

## Điều chỉnh phân công

| STT | Công việc | Trong PDF | Phân công hiện hành | Căn cứ |
|---|---|---|---|---|
| 41 | Giao diện quản lý kho nguyên liệu (EXT) | Khải | **Khang** | Yêu cầu trực tiếp của nhóm ngày 04/11/2026 |

Phạm vi STT 41 giữ nguyên tên đầu việc trong báo cáo; chưa bổ sung tiêu chí nghiệm thu hoặc thay đổi lịch. Các đầu việc còn lại giữ nguyên người phụ trách theo PDF. Vai trò PO/SM/Development Team xem tại [vai trò nhóm](team-roles.md); tiêu chuẩn hoàn thành xem [DoD](definition-of-done.md).

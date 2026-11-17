# Minh chứng yêu cầu phi chức năng BrewLite

Bộ minh chứng gồm ảnh DB/giao diện/Postman thật, đầu ra kiểm thử và JSON benchmark. Mỗi README NFR dẫn tới tệp bên trong chính thư mục đó. Các tệp `raw/` là log kiểm thử gốc; có thể mở để xem lệnh, tên ca và tổng kết.

| Mã | Kết quả đã kiểm tra | Mở minh chứng |
| --- | --- | --- |
| NFR-01 | 5 API đạt benchmark trên DB mẫu 100 sản phẩm/1.000 đơn ban đầu; p95 dưới 500 ms, toàn bộ phản hồi 2xx | [Hiệu năng](nfr-01/README.md) |
| NFR-02 | Ảnh bcrypt, JWT 200/401; 18 ca HTTP và 103 ca unit bảo mật/DTO/thanh toán đạt | [Bảo mật](nfr-02/README.md) |
| NFR-03 | Ảnh khách bị chặn 403/404; Barista xem kho/công thức/hàng đợi 200; log cô lập đơn/điểm và xử lý đơn đạt | [Phân quyền](nfr-03/README.md) |
| NFR-04 | 51 ca PostgreSQL đạt, gồm rollback đơn/kho/coupon, tranh ly cuối và giới hạn coupon | [Toàn vẹn dữ liệu](nfr-04/README.md) |
| NFR-05 | Thanh toán lặp, đổi điểm lặp và dùng lại khóa với nội dung khác đều có ca đạt | [Chống xử lý lặp](nfr-05/README.md) |
| NFR-06 | Ảnh desktop/mobile; 6 ca Chromium/Firefox và 5 ca trạng thái menu đạt | [Khả năng sử dụng](nfr-06/README.md) |
| NFR-07 | 437 test API, 96 test web và typecheck đạt; có log Compose sạch, migrations và cấu hình | [Bảo trì và triển khai](nfr-07/README.md) |
| NFR-08 | Ảnh xác nhận đơn; log snapshot, lịch sử trạng thái và giới hạn tiền nguyên đạt | [Truy vết](nfr-08/README.md) |

## Phạm vi khi trình bày bài nộp

NFR-01 đạt theo **p95** dưới 500 ms trên máy và DB mẫu đã ghi; một số request riêng lẻ có thể vượt 500 ms. Ảnh thống kê DB smoke cũ có 1.096 sản phẩm thuộc bộ dữ liệu khác. Ảnh PageSpeed là bằng chứng bổ sung cho giao diện web.

Integration và E2E dùng PostgreSQL/API thật, còn gateway/callback thanh toán được mô phỏng trong test. Ca HTTP xác thực dùng kho người dùng giả lập với bcrypt/JWT thật. Các ảnh Postman được lấy trực tiếp trên API local. Các lượt đo và bộ kiểm thử có phạm vi khác nhau, không cộng số ca để tạo tỷ lệ bao phủ.

Không cần chụp lại các ca tự động chỉ để thay log bằng ảnh. Nếu thầy yêu cầu riêng giao dịch trên VNPay Sandbox hoặc Safari, người thực hiện cần chạy luồng tương ứng và lưu kết quả; bộ hiện tại chưa tuyên bố hai nội dung này đã được nghiệm thu.

Không thêm ngày chạy vào phần mô tả. Timestamp gốc trong log, JSON và ảnh được giữ để kiểm chứng nguồn.

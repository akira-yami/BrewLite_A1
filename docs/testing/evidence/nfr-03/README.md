# NFR-03 · Phân quyền

Đã có ảnh phản hồi Postman thật của khách và Barista, cùng log kiểm thử HTTP/PostgreSQL về cô lập dữ liệu và xử lý đơn.

| Quyền cần chứng minh | Ảnh hoặc log | Kết quả |
| --- | --- | --- |
| Khách xem đơn của mình | [Màn hình đơn của khách](screenshot/khach_xem_don_cua_minh.png) | Hiển thị đơn đã thanh toán của tài khoản |
| Khách chỉ xem điểm của mình | [API điểm thưởng](screenshot/khach_xem_diem_thuong_cua_chinh_minh.png), [kiểm thử principal](raw/loyalty-ownership-verification.txt) | API lấy ID từ JWT; 6/6 ca controller/service đạt |
| Khách không xem được đơn người khác | [Postman HTTP 404](screenshot/customer-foreign-order-404.png), [đơn tồn tại và chủ sở hữu trong DB](raw/foreign-order-fixture.txt) | `customer01` gọi UUID hợp lệ của đơn thuộc tài khoản khác; `ORDER_NOT_FOUND`, 2/2 kiểm tra đạt |
| Khách không vào kho nhân viên | [Postman HTTP 403](screenshot/customer-staff-inventory-403.png) | Khách đã xác thực bị chặn bởi quyền |
| Barista xem kho | [Postman HTTP 200](screenshot/barista-inventory-200.png) | Trả nguyên liệu, đơn vị và tồn kho; 2/2 kiểm tra đạt |
| Barista xem công thức | [Postman HTTP 200](screenshot/barista-recipes-200.png) | Trả món, kích cỡ và định lượng nguyên liệu |
| Barista xem hàng đợi | [Postman HTTP 200](screenshot/barista-queue-200.png) | Trả đơn đang PAID; 2/2 kiểm tra đạt |
| Barista xử lý đơn; khách không đổi trạng thái | [Log PostgreSQL chạy lại](raw/postgres-verification.txt) | Luồng PENDING → PAID → PREPARING → READY → COMPLETED đạt; khách đổi trạng thái bị chặn |

Các ảnh Postman bổ sung dùng `BrewLite Local Environment`, API `http://localhost:3001/api/v1`, DB Docker `brewlite`. Đã đăng nhập tài khoản demo `customer01` và `barista01` để làm mới token trước khi gửi các yêu cầu.

[Log HTTP xác thực chạy lại](raw/auth-http-verification.txt) đạt 18/18. [Log PostgreSQL](raw/postgres-verification.txt) đạt 51/51, gồm quyền kho/công thức, phân trang không lộ đơn của người khác và tranh chấp khi hai Barista nhận cùng đơn. Gateway trong kiểm thử được mô phỏng.

Ảnh bổ sung: [Barista không được mua hàng](screenshot/barista_khong_the_mua_hang.png).

Hai ảnh cũ được giữ trong `screenshot/diagnostic/`: [400 vì mã đơn không phải UUID](screenshot/diagnostic/foreign-order-invalid-id-400.png), [401 vì chưa xác thực hợp lệ](screenshot/diagnostic/staff-unauthorized-401.png). Chúng là ảnh chẩn đoán, không dùng kết luận về phân quyền. Ảnh 404 và 403 ở bảng trên thay thế chúng trong bài nộp.

Log trước đó: [18 ca HTTP](raw/auth-http-tests.txt), [trích log phân quyền](raw/access-control-extract.txt).

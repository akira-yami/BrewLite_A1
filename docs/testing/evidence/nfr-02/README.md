# NFR-02 · Bảo mật

Đã có ảnh DB/Postman thật và log kiểm thử bcrypt, JWT, kiểm tra đầu vào, chữ ký VNPay. Các ca HTTP tự động chạy ứng dụng Nest với kho người dùng giả lập, vẫn kiểm tra bcrypt và JWT thật.

| Nội dung | Minh chứng | Kết quả |
| --- | --- | --- |
| Mật khẩu được băm | [Truy vấn DB bằng DBeaver](screenshot/bcrypt.png) | Tài khoản `customer01`, tiền tố `$2b$10$`, độ dài 60 ký tự |
| JWT hợp lệ | [GET /auth/me](screenshot/jwt-200.png) | HTTP 200, trả hồ sơ người dùng |
| Thiếu JWT | [GET /auth/me không xác thực](screenshot/jwt-no-token-401.png) | HTTP 401; 1/1 kiểm tra đạt |
| Đầu vào không hợp lệ | [Postman kiểm tra độ dài](screenshot/validation-400.png) | `username: a`, `password: 123` bị từ chối HTTP 400; 1/1 kiểm tra đạt |
| JWT hết hạn, sai chữ ký, thiếu subject | [Log HTTP chạy lại](raw/security-verification.txt) | 18/18 ca đạt, gồm ca bcrypt/JWT và quyền truy cập |
| Bcrypt khi đăng ký/đăng nhập, DTO và chữ ký VNPay | [Log unit chạy lại](raw/security-unit-verification.txt) | 103/103 ca đạt; có từ chối chữ ký sai và số tiền không khớp |

Ảnh định dạng bcrypt trong DB cần đọc cùng ca kiểm thử so khớp mật khẩu bằng bcrypt; chỉ tiền tố mã băm chưa chứng minh đầy đủ việc xác thực mật khẩu.

Chữ ký/callback VNPay được kiểm thử bằng dữ liệu mô phỏng; kết quả này chứng minh xử lý chữ ký và số tiền trong BrewLite. Chưa dùng để khẳng định đã thực hiện thanh toán qua ngân hàng Sandbox. Nếu thầy yêu cầu riêng luồng ngân hàng, người thực hiện cần thao tác trên VNPay Sandbox và lưu kết quả cùng mã đơn BrewLite.

Log cũ được giữ để đối chiếu: [trích log bảo mật](raw/auth-and-validation-extract.txt), [118 unit test trước đó](raw/api-unit-tests.txt).

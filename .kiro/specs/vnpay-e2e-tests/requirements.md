# Tài Liệu Yêu Cầu

## Giới thiệu

Tài liệu này mô tả các yêu cầu cho một bộ kiểm thử đầu cuối (end-to-end) toàn diện nhằm xác thực việc tích hợp thanh toán QR VNPAY với môi trường Sandbox thực tế của VNPAY. Bộ kiểm thử sẽ xác minh toàn bộ vòng đời thanh toán, bao gồm tạo thanh toán, hiển thị mã QR, xử lý callback IPN, truy vấn trạng thái thanh toán, các tình huống hết thời gian chờ và các luồng khôi phục.

Hệ thống được kiểm thử là ứng dụng đặt hàng quán cà phê (BrewLite) tích hợp VNPAY để xử lý thanh toán bằng mã QR. Bộ kiểm thử phải xác thực cả các luồng thành công và các trường hợp biên, đồng thời đảm bảo tính idempotency, xử lý lỗi chính xác và trải nghiệm người dùng nhất quán.

## Thuật ngữ

- **VNPAY**: Nhà cung cấp cổng thanh toán điện tử tại Việt Nam hỗ trợ xử lý thanh toán bằng mã QR.
- **Sandbox_Environment**: Môi trường kiểm thử của VNPAY tại `https://sandbox.vnpayment.vn`.
- **IPN** (Instant Payment Notification): Thông báo thanh toán tức thời, là callback bất đồng bộ từ VNPAY tới hệ thống backend của đơn vị bán hàng.
- **Idempotency_Key**: Định danh duy nhất cho một yêu cầu thanh toán để ngăn xử lý trùng lặp.
- **Payment_Status**: Tập hợp các trạng thái thanh toán (PROCESSING, SUCCEEDED, FAILED).
- **QR_Code**: Mã QR hiển thị cho người dùng quét bằng ứng dụng thanh toán trên điện thoại.
- **Order_Reservation**: Cơ chế giữ hàng và giá trong thời gian giới hạn (10 phút).
- **Gateway_Transaction_ID**: Mã giao dịch duy nhất do VNPAY cấp.
- **Merchant_TmnCode**: Mã định danh thương nhân của VNPAY (`QEZXV06S` trong môi trường Sandbox).
- **Hash_Secret**: Khóa mật mã dùng để xác thực chữ ký yêu cầu/phản hồi.
- **Payment_URL**: Trang thanh toán của VNPAY nơi hiển thị mã QR.
- **Payment_Inquiry**: Truy vấn thủ công tới VNPAY để lấy trạng thái giao dịch.
- **Test_Isolation**: Tính chất đảm bảo các lần chạy kiểm thử song song không ảnh hưởng lẫn nhau.
- **Mock_Gateway**: Cổng thanh toán giả lập dùng cho các bài kiểm thử không liên quan đến VNPAY.
- **Playwright**: Framework tự động hóa trình duyệt phục vụ kiểm thử end-to-end.
- **Checkout_Flow**: Hành trình người dùng từ giỏ hàng đến xác nhận đơn hàng.
- **Recovery_Flow**: Luồng khôi phục do người dùng chủ động thực hiện sau khi thanh toán hết thời gian chờ hoặc gặp lỗi.

## Các yêu cầu

### Yêu cầu 1: Xác thực luồng thanh toán QR thành công

**User Story:** Với vai trò là kỹ sư QA, tôi muốn xác minh việc hoàn tất thanh toán QR thành công để đảm bảo toàn bộ luồng thanh toán hoạt động chính xác trong môi trường Sandbox.

#### Tiêu chí chấp nhận

1. KHI người dùng đã đăng ký thêm sản phẩm vào giỏ hàng và tiến hành thanh toán THÌ Hệ thống kiểm thử PHẢI tạo đơn hàng với trạng thái thanh toán PROCESSING.
2. KHI người dùng chọn phương thức thanh toán VNPAY THÌ Hệ thống kiểm thử PHẢI nhận được Payment_URL có chữ ký hợp lệ và tham số QR_Code.
3. KHI bài kiểm thử mô phỏng thanh toán thành công trên Sandbox_Environment THÌ VNPAY PHẢI gửi callback IPN tới backend.
4. KHI callback IPN được nhận với trạng thái thành công THÌ Hệ thống PHẢI cập nhật Payment_Status thành SUCCEEDED và trạng thái đơn hàng thành PAID.
5. KHI thanh toán thành công THÌ Hệ thống PHẢI chuyển hướng người dùng tới trang xác nhận với tham số orderId chính xác.
6. KHI bài kiểm thử truy vấn chi tiết đơn hàng qua API THÌ Hệ thống PHẢI trả về trạng thái PAID và bao gồm Gateway_Transaction_ID.
7. KHI người dùng truy cập lại trang thanh toán sau khi thanh toán thành công THÌ Hệ thống PHẢI hiển thị thông báo giỏ hàng trống.

### Yêu cầu 2: Hết thời gian thanh toán và khôi phục thủ công

**User Story:** Với vai trò là người dùng, tôi muốn kiểm tra trạng thái thanh toán thủ công sau khi hết thời gian chờ để xác nhận thanh toán mà không tạo đơn hàng trùng lặp.

#### Tiêu chí chấp nhận

1. KHI thanh toán được tạo với thời gian giữ đơn hàng 10 phút THÌ Hệ thống PHẢI hiển thị đồng hồ đếm ngược theo định dạng mm:ss.
2. KHI đồng hồ đếm ngược đạt 00:00 mà chưa có xác nhận thanh toán THÌ Hệ thống PHẢI gọi callback `onReservationExpired`.
3. KHI thời gian giữ đơn hàng hết hạn THÌ Hệ thống PHẢI hiển thị nút "Kiểm tra trạng thái giao dịch".
4. KHI người dùng nhấn nút khôi phục THÌ Hệ thống PHẢI gọi API Payment_Inquiry với cùng Idempotency_Key.
5. KHI Payment_Inquiry trả về trạng thái SUCCEEDED THÌ Hệ thống PHẢI cập nhật trạng thái cục bộ và chuyển hướng tới trang xác nhận.
6. KHI Payment_Inquiry trả về trạng thái FAILED THÌ Hệ thống PHẢI hiển thị thông báo lỗi cùng mã lỗi tương ứng.
7. ĐỐI VỚI MỌI lần khôi phục THÌ Hệ thống PHẢI sử dụng Idempotency_Key ban đầu để ngăn thanh toán trùng.

### Yêu cầu 3: Xử lý điều kiện tranh chấp IPN (Race Condition)

**User Story:** Với vai trò người vận hành hệ thống, tôi muốn hệ thống xử lý trường hợp callback IPN đến trước khi người dùng quay lại để người dùng thấy trạng thái đúng ngay lập tức.

#### Tiêu chí chấp nhận

1. KHI thanh toán hoàn tất trên Sandbox_Environment THÌ VNPAY PHẢI gửi callback IPN tới endpoint đã cấu hình.
2. KHI callback IPN đến trước khi người dùng quay lại ứng dụng THÌ Hệ thống PHẢI lưu trạng thái Payment_Status vào cơ sở dữ liệu.
3. KHI người dùng quay lại ứng dụng sau khi IPN đã đến THÌ Hệ thống PHẢI hiển thị trạng thái thành công ngay lập tức mà không cần polling.
4. KHI người dùng kiểm tra trạng thái thanh toán sau khi IPN đã được xử lý THÌ Hệ thống PHẢI trả về trạng thái SUCCEEDED từ cơ sở dữ liệu.
5. KHI có nhiều callback IPN đến cho cùng một giao dịch THÌ Hệ thống PHẢI chỉ xử lý callback đầu tiên và bỏ qua các callback trùng lặp.
6. ĐỐI VỚI MỌI callback IPN THÌ Hệ thống PHẢI xác thực chữ ký bằng Hash_Secret trước khi xử lý.

### Yêu cầu 4: Mất kết nối mạng và khôi phục trễ

**User Story:** Với vai trò là người dùng mất kết nối Internet trong lúc thanh toán, tôi muốn có thể khôi phục trạng thái thanh toán sau đó để không bị mất tiền hoặc phải đặt lại đơn hàng.

#### Tiêu chí chấp nhận

1. KHI người dùng hoàn tất thanh toán nhưng mất kết nối trước khi IPN được gửi tới THÌ Hệ thống PHẢI duy trì trạng thái PROCESSING.
2. KHI người dùng quay lại ứng dụng sau nhiều giờ THÌ Hệ thống PHẢI hiển thị màn hình thanh toán đang chờ cùng tùy chọn khôi phục.
3. KHI người dùng nhấn nút "Kiểm tra lại" THÌ Hệ thống PHẢI gọi Payment_Inquiry với Idempotency_Key ban đầu.
4. KHI Payment_Inquiry thành công sau một khoảng thời gian trễ THÌ Hệ thống PHẢI cập nhật Payment_Status và trạng thái đơn hàng một cách nguyên tử (atomic).
5. KHI Payment_Inquiry cho biết giao dịch chưa bao giờ được hoàn thành THÌ Hệ thống PHẢI cung cấp tùy chọn thử lại hoặc hủy.
6. ĐỐI VỚI MỌI kịch bản khôi phục trễ THÌ Hệ thống PHẢI lưu giữ dữ liệu Order_Reservation cho mục đích kiểm toán.

### Yêu cầu 5: Xác thực chữ ký mật mã

**User Story:** Với vai trò kỹ sư bảo mật, tôi muốn mọi giao tiếp với VNPAY đều xác thực chữ ký để hệ thống từ chối các yêu cầu bị sửa đổi hoặc giả mạo.

#### Tiêu chí chấp nhận

1. KHI tạo yêu cầu thanh toán THÌ Hệ thống PHẢI tính toán chữ ký bằng Hash_Secret và thuật toán HMACSHA512.
2. KHI URL thanh toán được tạo THÌ Hệ thống PHẢI bao gồm tham số `vnp_SecureHash` trong query string.
3. KHI callback IPN được nhận THÌ Hệ thống PHẢI xác minh `vnp_SecureHash` khớp với chữ ký được tính toán.
4. NẾU xác thực chữ ký IPN thất bại THÌ Hệ thống PHẢI từ chối callback và ghi log cảnh báo bảo mật.
5. KHI phản hồi Payment_Inquiry được nhận THÌ Hệ thống PHẢI xác minh `vnp_SecureHash` trong nội dung phản hồi.
6. NẾU chữ ký Payment_Inquiry không hợp lệ THÌ Hệ thống PHẢI ném lỗi `VnpayInquiryError` và không cập nhật trạng thái thanh toán.
7. ĐỐI VỚI MỌI phép tính chữ ký THÌ Hệ thống PHẢI sử dụng các tham số được sắp xếp theo URL, loại trừ trường `vnp_SecureHash`.

### Yêu cầu 6: Idempotency và an toàn khi thử lại

**User Story:** Với vai trò người dùng, tôi muốn có cơ chế chống nhấn đúp và thử lại an toàn để tránh bị trừ tiền hai lần cho cùng một đơn hàng.

#### Tiêu chí chấp nhận

1. KHI người dùng nhấn đúp nút thanh toán THÌ Hệ thống PHẢI chỉ tạo một bản ghi thanh toán với một Idempotency_Key duy nhất.
2. KHI thanh toán thất bại với trạng thái FAILED THÌ Hệ thống PHẢI cho phép thử lại bằng Idempotency_Key mới cho cùng orderId.
3. KHI lần thử lại thành công THÌ Hệ thống PHẢI đánh dấu thanh toán ban đầu là FAILED và thanh toán mới là SUCCEEDED.
4. KHI người dùng cố gắng thử lại giao dịch đang ở trạng thái PROCESSING THÌ Hệ thống PHẢI trả về lỗi `409 Conflict` với mã `PAYMENT_IN_PROGRESS`.
5. KHI gọi `GET /payments/status` với Idempotency_Key không tồn tại THÌ Hệ thống PHẢI trả về lỗi `404 PAYMENT_NOT_FOUND`.
6. ĐỐI VỚI MỌI thao tác thanh toán THÌ Hệ thống PHẢI áp dụng ràng buộc duy nhất trên `(orderId, status=PROCESSING)` để ngăn thanh toán đồng thời.

### Yêu cầu 7: Cấu hình môi trường kiểm thử và cô lập kiểm thử

**User Story:** Với vai trò kỹ sư CI/CD, tôi muốn các bài kiểm thử chạy ổn định trong môi trường độc lập để các lần thực thi song song không ảnh hưởng lẫn nhau.

#### Tiêu chí chấp nhận

1. KHI bộ kiểm thử khởi tạo THÌ Hệ thống kiểm thử PHẢI cấu hình VNPAY bằng thông tin Sandbox_Environment từ biến môi trường.
2. KHI kiểm thử chạy trong môi trường CI THÌ Hệ thống kiểm thử PHẢI tải Merchant_TmnCode và Hash_Secret từ kho bí mật an toàn.
3. KHI nhiều bài kiểm thử chạy đồng thời THÌ Hệ thống kiểm thử PHẢI tạo username duy nhất bằng UUID để tránh xung đột.
4. KHI bài kiểm thử tạo thanh toán THÌ Hệ thống kiểm thử PHẢI tạo Idempotency_Key duy nhất cho mỗi lần thanh toán.
5. KHI bài kiểm thử hoàn tất THÌ Hệ thống kiểm thử PHẢI giữ lại các bản ghi thanh toán phục vụ kiểm toán (không dọn dẹp).
6. KHI Sandbox_Environment không khả dụng THÌ Hệ thống kiểm thử PHẢI thất bại ngay với thông báo lỗi rõ ràng về phụ thuộc bên ngoài.
7. ĐỐI VỚI MỌI lần chạy kiểm thử THÌ Hệ thống kiểm thử PHẢI sử dụng cổng riêng (3100 cho web, 3101 cho API), tách biệt với máy chủ phát triển.

### Yêu cầu 8: Hành vi polling trạng thái thanh toán

**User Story:** Với vai trò người dùng đang chờ xác nhận thanh toán, tôi muốn hệ thống kiểm tra trạng thái một cách hiệu quả để nhận được cập nhật nhanh chóng mà không gây quá tải máy chủ.

#### Tiêu chí chấp nhận

1. KHI thanh toán chuyển sang trạng thái PROCESSING THÌ Hệ thống PHẢI gọi `GET /payments/status` mỗi 5 giây.
2. KHI polling trả về SUCCEEDED THÌ Hệ thống PHẢI dừng polling và gọi callback `onSucceeded`.
3. KHI polling trả về FAILED THÌ Hệ thống PHẢI dừng polling và gọi callback `onFailed` cùng mã lỗi.
4. KHI polling trả về PROCESSING THÌ Hệ thống PHẢI tiếp tục polling cho đến khi hết thời gian hoặc trạng thái thay đổi.
5. KHI 3 lần polling liên tiếp thất bại do lỗi mạng THÌ Hệ thống PHẢI dừng polling và hiển thị trạng thái lỗi.
6. KHI người dùng rời khỏi màn hình thanh toán THÌ Hệ thống PHẢI hủy polling bằng `AbortController` để tránh rò rỉ bộ nhớ.
7. ĐỐI VỚI MỌI yêu cầu polling THÌ Hệ thống PHẢI sử dụng cùng Idempotency_Key và kèm token Bearer Authorization.

### Yêu cầu 9: Độ chính xác và trải nghiệm người dùng của đồng hồ đếm ngược

**User Story:** Với vai trò người dùng, tôi muốn đồng hồ đếm ngược chính xác để biết chính xác còn bao nhiêu thời gian để hoàn tất thanh toán.

#### Tiêu chí chấp nhận

1. KHI màn hình thanh toán được mở với timestamp `reservationExpiresAt` THÌ Countdown_Timer PHẢI tính số giây còn lại từ thời điểm hiện tại.
2. KHI đồng hồ cập nhật mỗi giây THÌ Countdown_Timer PHẢI hiển thị định dạng `mm:ss` với số 0 đệm phía trước.
3. KHI thời gian còn lại là 30 giây hoặc ít hơn THÌ Countdown_Timer PHẢI hiển thị trạng thái khẩn cấp với màu đỏ và hiệu ứng nhấp nháy.
4. KHI đồng hồ đạt 00:00 THÌ Countdown_Timer PHẢI gọi callback `onExpired` đúng một lần.
5. KHI hết thời gian THÌ Countdown_Timer PHẢI hiển thị thông báo "Đã hết thời gian giữ chỗ".
6. KHI trang được tải lại trong khi đang thanh toán THÌ Countdown_Timer PHẢI tiếp tục từ thời gian còn lại chính xác dựa trên `reservationExpiresAt`.
7. ĐỐI VỚI MỌI hiển thị đồng hồ đếm ngược THÌ Countdown_Timer PHẢI sử dụng `aria-live="assertive"` để hỗ trợ trình đọc màn hình khi thời gian trở nên khẩn cấp.

### Yêu cầu 10: Hiệu năng và độ tin cậy khi thực thi kiểm thử

**User Story:** Với vai trò nhóm phát triển, chúng tôi muốn việc chạy kiểm thử nhanh và đáng tin cậy để có thể kiểm thử thường xuyên mà không làm chậm quá trình phát triển.

#### Tiêu chí chấp nhận

1. Toàn bộ bộ kiểm thử PHẢI hoàn thành trong vòng dưới 5 phút, bao gồm cả thời gian khởi động máy chủ.
2. KHI kiểm thử thất bại THÌ Hệ thống kiểm thử PHẢI ghi lại trace và ảnh chụp màn hình để hỗ trợ gỡ lỗi.
3. KHI kiểm thử tương tác với Sandbox_Environment THÌ Hệ thống kiểm thử PHẢI có cơ chế thử lại đối với các lỗi mạng tạm thời.
4. KHI kiểm thử tạo tài khoản người dùng THÌ Hệ thống kiểm thử PHẢI sử dụng endpoint `/auth/register` với username ngẫu nhiên.
5. KHI kiểm thử xác thực thành phần giao diện THÌ Hệ thống kiểm thử PHẢI sử dụng selector ổn định (role, text) thay vì CSS selector dễ hỏng.
6. Bộ kiểm thử PHẢI sinh báo cáo HTML hiển thị trạng thái pass/fail và thời gian thực thi của từng bài kiểm thử.
7. ĐỐI VỚI MỌI assertion THÌ Hệ thống kiểm thử PHẢI cung cấp thông báo lỗi mô tả rõ ràng, phân biệt lỗi VNPAY và lỗi ứng dụng.

### Yêu cầu 11: Chống nhấn đúp và logic truy vấn trạng thái

**User Story:** Với vai trò người dùng, tôi muốn được bảo vệ khỏi việc gửi yêu cầu hai lần ngoài ý muốn để không tạo nhiều lần thanh toán.

#### Tiêu chí chấp nhận

1. KHI người dùng nhấn đúp nút thanh toán với khoảng cách 250ms THÌ Hệ thống PHẢI chỉ gửi một yêu cầu `POST /payments`.
2. KHI lần nhấn thứ hai đến trong lúc yêu cầu đầu tiên đang xử lý THÌ Hệ thống PHẢI trả về lỗi `409 PAYMENT_IN_PROGRESS`.
3. KHI trang được tải lại trong khi thanh toán đang ở trạng thái PROCESSING THÌ Hệ thống PHẢI hiển thị nút "Kiểm tra trạng thái giao dịch".
4. KHI người dùng nhấn nút kiểm tra trạng thái THÌ Hệ thống PHẢI gọi `GET /payments/status` trước khi phát lại `POST /payments`.
5. NẾU `GET /payments/status` trả về `404 PAYMENT_NOT_FOUND` THÌ Hệ thống PHẢI phát lại `POST /payments` với cùng Idempotency_Key.
6. NẾU `GET /payments/status` trả về PROCESSING THÌ Hệ thống KHÔNG ĐƯỢC phát lại `POST /payments` và tiếp tục polling.
7. NẾU `GET /payments/status` trả về SUCCEEDED THÌ Hệ thống PHẢI chuyển hướng tới trang xác nhận mà không phát lại yêu cầu.

### Yêu cầu 12: Lựa chọn phương thức thanh toán và định tuyến cổng thanh toán

**User Story:** Với vai trò người dùng, tôi muốn chọn phương thức thanh toán VNPAY để thanh toán bằng cách quét mã QR.

#### Tiêu chí chấp nhận

1. KHI trang thanh toán được tải THÌ Hệ thống PHẢI hiển thị các phương thức thanh toán khả dụng, bao gồm tùy chọn VNPAY QR.
2. KHI người dùng chọn phương thức VNPAY THÌ Hệ thống PHẢI kích hoạt nút thanh toán với nhãn "Thanh toán [số tiền]".
3. KHI người dùng nhấn nút thanh toán với VNPAY được chọn THÌ Hệ thống PHẢI gửi POST tới `/payments` với `method=VNPAY`.
4. KHI thanh toán được tạo với `method=VNPAY` THÌ Hệ thống PHẢI trả về trường `paymentUrl` trong phản hồi.
5. KHI Mock_Gateway được sử dụng cho các phương thức khác THÌ Hệ thống KHÔNG ĐƯỢC sử dụng Mock_Gateway cho các yêu cầu VNPAY.
6. ĐỐI VỚI MỌI thanh toán VNPAY THÌ Hệ thống PHẢI sử dụng thông tin xác thực Sandbox_Environment thực, không dùng chế độ giả lập.

### Yêu cầu 13: Tính nhất quán trạng thái đơn hàng và dấu vết kiểm toán

**User Story:** Với vai trò quản trị hệ thống, tôi muốn có đầy đủ lịch sử các lần thanh toán để điều tra sự cố và đối soát giao dịch.

#### Tiêu chí chấp nhận

1. KHI thanh toán được tạo THÌ Hệ thống PHẢI lưu bản ghi Payment với `status=PROCESSING`, `Idempotency_Key` và `orderId`.
2. KHI thanh toán thành công qua IPN THÌ Hệ thống PHẢI cập nhật `Payment.status=SUCCEEDED`, `Payment.gatewayTransactionId` và `Order.status=PAID`.
3. KHI thanh toán thất bại THÌ Hệ thống PHẢI cập nhật `Payment.status=FAILED` và `Payment.errorCode`.
4. KHI thanh toán được thử lại THÌ Hệ thống PHẢI tạo bản ghi Payment mới với Idempotency_Key mới và cùng orderId.
5. Hệ thống PHẢI duy trì cờ `Payment.isRetried` để cho biết thanh toán đã được thử lại sau lần thất bại đầu tiên hay chưa.
6. Hệ thống PHẢI lưu giữ các timestamp `createdAt` và `updatedAt` trên mọi bản ghi Payment và Order.
7. ĐỐI VỚI MỌI chuyển đổi trạng thái thanh toán THÌ Hệ thống PHẢI cập nhật bản ghi một cách nguyên tử trong transaction cơ sở dữ liệu.

### Yêu cầu 14: Bản địa hóa thông báo lỗi và hướng dẫn người dùng

**User Story:** Với vai trò người dùng Việt Nam, tôi muốn các thông báo lỗi rõ ràng bằng tiếng Việt để hiểu được vấn đề và cách xử lý tiếp theo.

#### Tiêu chí chấp nhận

1. KHI thanh toán thất bại do không đủ số dư THÌ Hệ thống PHẢI hiển thị "Số dư hoặc hạn mức thanh toán không đủ".
2. KHI xảy ra lỗi mạng trong lúc polling THÌ Hệ thống PHẢI hiển thị "Không thể kiểm tra trạng thái thanh toán".
3. KHI có 3 lần polling liên tiếp thất bại THÌ Hệ thống PHẢI hiển thị hướng dẫn thử lại thủ công hoặc chờ thêm.
4. KHI thanh toán hết hạn mà chưa hoàn tất THÌ Hệ thống PHẢI hiển thị "Đã hết thời gian giữ chỗ".
5. KHI người dùng ở màn hình chờ thanh toán THÌ Hệ thống PHẢI hiển thị hướng dẫn bằng tiếng Việt về cách quét mã QR.
6. Hệ thống PHẢI hiển thị mọi số tiền theo định dạng Đồng Việt Nam có dấu phân tách hàng nghìn.
7. ĐỐI VỚI MỌI nội dung hiển thị cho người dùng THÌ Hệ thống PHẢI sử dụng tiếng Việt nhất quán trong toàn bộ luồng thanh toán.

### Yêu cầu 15: Chiến lược tạo và quản lý dữ liệu kiểm thử

**User Story:** Với vai trò kỹ sư kiểm thử, tôi muốn việc tạo dữ liệu kiểm thử có thể dự đoán được để các bài kiểm thử dễ tái lập và bảo trì.

#### Tiêu chí chấp nhận

1. KHI kiểm thử tạo tài khoản người dùng THÌ Hệ thống kiểm thử PHẢI tạo username với tiền tố `e2e_` và hậu tố UUID ngẫu nhiên.
2. KHI kiểm thử chọn sản phẩm THÌ Hệ thống kiểm thử PHẢI sử dụng sản phẩm khả dụng đầu tiên từ menu.
3. KHI kiểm thử xác minh số tiền thanh toán THÌ Hệ thống kiểm thử PHẢI tính tổng dự kiến từ các sản phẩm trong giỏ hàng và các mã giảm giá.
4. KHI kiểm thử hoàn tất THÌ Hệ thống kiểm thử KHÔNG ĐƯỢC xóa các bản ghi Payment hoặc Order nhằm giữ lại lịch sử kiểm toán.
5. Hệ thống kiểm thử KHÔNG ĐƯỢC yêu cầu script dọn dẹp thủ công giữa các lần chạy.
6. Hệ thống kiểm thử PHẢI sử dụng Idempotency_Key duy nhất cho mỗi lần thanh toán để tránh xung đột với các lần chạy kiểm thử trước.
7. ĐỐI VỚI MỌI dữ liệu kiểm thử THÌ Hệ thống kiểm thử PHẢI đảm bảo dữ liệu hợp lệ theo các quy tắc nghiệp vụ của ứng dụng.

## Hướng dẫn các yêu cầu đặc biệt

### Yêu cầu tích hợp API VNPAY

**Yêu cầu đối với Parser và Serializer:** Hệ thống phải phân tích chính xác các tham số truy vấn URL của VNPAY và tuần tự hóa (serialize) các tham số yêu cầu theo đúng đặc tả của VNPAY.

#### Tiêu chí chấp nhận (Yêu cầu 16)

1. KHI xây dựng URL thanh toán THÌ Hệ thống PHẢI tuần tự hóa các tham số dưới dạng chuỗi truy vấn URL đã được mã hóa.
2. KHI phân tích callback IPN THÌ Hệ thống PHẢI chuyển đổi các tham số query URL thành đối tượng key-value.
3. KHI định dạng dữ liệu chữ ký THÌ Hệ thống PHẢI sắp xếp tham số theo khóa và nối bằng ký tự `&`.
4. ĐỐI VỚI MỌI xử lý tham số VNPAY THÌ Hệ thống PHẢI giữ nguyên chính xác cách mã hóa và thứ tự theo đặc tả của VNPAY.

### Thuộc tính Round-Trip

Mặc dù một bài kiểm thử round-trip truyền thống (parse → format → parse) là lý tưởng, cơ chế chữ ký của VNPAY khiến điều này trở nên khó khăn vì:

- Chữ ký là một chiều (không thể suy ngược Hash_Secret từ chữ ký).
- VNPAY bổ sung các trường do máy chủ sinh ra (`vnp_ResponseCode`, `vnp_TransactionNo`) không tồn tại trong yêu cầu ban đầu.
- Các bài kiểm thử nên tập trung vào tính đúng đắn của việc xác thực chữ ký thay vì round-trip tuần tự hóa dữ liệu.

### Chiến lược kiểm thử

Sử dụng kiểm thử dựa trên thuộc tính (property-based testing) để xác nhận tính nhất quán của việc tính toán chữ ký, đồng thời sử dụng kiểm thử dựa trên ví dụ (example-based testing) cho các kịch bản callback VNPAY cụ thể với các chữ ký hợp lệ đã biết trước.
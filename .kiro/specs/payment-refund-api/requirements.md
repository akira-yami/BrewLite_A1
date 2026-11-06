# Requirements Document

## Introduction

Tính năng API Hoàn Tiền Thanh Toán cho phép nhân viên quản trị (Admin/Staff) hoàn trả tiền cho khách hàng thông qua cổng thanh toán VNPay trong hệ thống quản lý quán cà phê BrewLite. Hệ thống cần đảm bảo tính toàn vẹn dữ liệu, tính idempotent (không tạo nhiều giao dịch hoàn tiền trùng lặp), và ghi log đầy đủ cho mục đích kiểm toán.

## Glossary

- **Payment_System**: Hệ thống con quản lý thanh toán trong BrewLite
- **VNPay_Gateway**: Cổng thanh toán VNPay cung cấp API hoàn tiền
- **Refund_Request**: Yêu cầu hoàn tiền được khởi tạo bởi Admin/Staff
- **Original_Payment**: Giao dịch thanh toán gốc đã thành công trước đó
- **Refund_Window**: Khoảng thời gian cho phép hoàn tiền (thường 90 ngày từ ngày thanh toán)
- **Audit_Trail**: Nhật ký ghi lại toàn bộ thao tác hoàn tiền
- **Transaction_Atomicity**: Tính nguyên tử của giao dịch (toàn bộ thành công hoặc toàn bộ thất bại)
- **Admin**: Người dùng có vai trò PAYMENT_OPERATOR hoặc quyền quản trị cao hơn
- **Staff**: Người dùng có vai trò BARISTA hoặc cao hơn với quyền xử lý hoàn tiền
- **Partial_Refund**: Hoàn tiền một phần số tiền giao dịch gốc
- **Full_Refund**: Hoàn tiền toàn bộ số tiền giao dịch gốc
- **Idempotency_Key**: Khóa duy nhất để đảm bảo một yêu cầu hoàn tiền chỉ được xử lý một lần

## Requirements

### Requirement 1: Endpoint Hoàn Tiền

**User Story:** Là một quản trị viên, tôi muốn có endpoint REST API để khởi tạo hoàn tiền, để có thể hoàn trả tiền cho khách hàng khi cần thiết.

#### Acceptance Criteria

1. THE Payment_System SHALL cung cấp endpoint POST /payments/:id/refund để khởi tạo Refund_Request
2. WHEN Admin gửi Refund_Request với payment ID hợp lệ, THE Payment_System SHALL xác thực tính hợp lệ của request
3. WHEN endpoint nhận request với payment ID không tồn tại, THE Payment_System SHALL trả về lỗi 404 với thông báo rõ ràng
4. WHEN endpoint xử lý request thành công và refund đang trong trạng thái xử lý bất đồng bộ, THE Payment_System SHALL trả về response ngay lập tức chứa refund ID và status 'pending' mà không chờ refund hoàn tất ở trạng thái cuối cùng
5. THE Payment_System SHALL chấp nhận request body chứa refundAmount, reason, và Idempotency_Key

### Requirement 2: Xác Thực và Phân Quyền

**User Story:** Là một hệ thống bảo mật, tôi muốn đảm bảo chỉ người dùng có quyền mới có thể khởi tạo hoàn tiền, để bảo vệ tài chính của doanh nghiệp.

#### Acceptance Criteria

1. WHEN một request đến endpoint hoàn tiền, THE Payment_System SHALL xác thực JWT token hợp lệ
2. WHEN người dùng không có vai trò PAYMENT_OPERATOR hoặc cao hơn, THE Payment_System SHALL từ chối request với lỗi 403
3. WHEN token hết hạn hoặc không hợp lệ, THE Payment_System SHALL trả về lỗi 401
4. THE Payment_System SHALL ghi lại user ID của người khởi tạo hoàn tiền trong Audit_Trail

### Requirement 3: Xác Thực Điều Kiện Hoàn Tiền

**User Story:** Là một hệ thống thanh toán, tôi muốn kiểm tra điều kiện trước khi hoàn tiền, để đảm bảo chỉ hoàn tiền cho các giao dịch hợp lệ.

#### Acceptance Criteria

1. WHEN Original_Payment có status khác SUCCEEDED, THE Payment_System SHALL từ chối Refund_Request với lỗi rõ ràng
2. WHEN Original_Payment đã được hoàn tiền trước đó (status = REFUNDED), THE Payment_System SHALL từ chối Refund_Request với thông báo đã hoàn tiền
3. WHEN ngày thanh toán nằm ngoài Refund_Window (90 ngày), THE Payment_System SHALL từ chối Refund_Request với thông báo hết hạn
4. WHEN refundAmount lớn hơn số tiền thanh toán gốc, THE Payment_System SHALL từ chối request với lỗi vượt quá giới hạn
5. WHEN refundAmount nhỏ hơn hoặc bằng 0, THE Payment_System SHALL từ chối request với lỗi số tiền không hợp lệ
6. WHEN Original_Payment không có gatewayTransactionId, THE Payment_System SHALL từ chối Refund_Request vì thiếu thông tin cổng thanh toán

### Requirement 4: Tính Idempotent

**User Story:** Là một hệ thống tin cậy, tôi muốn đảm bảo yêu cầu hoàn tiền không tạo nhiều giao dịch trùng lặp, để tránh hoàn tiền nhiều lần cho cùng một yêu cầu.

#### Acceptance Criteria

1. WHEN Admin gửi Refund_Request với Idempotency_Key đã tồn tại cho cùng payment, THE Payment_System SHALL trả về kết quả của Refund_Request ban đầu
2. WHEN Payment_System nhận Idempotency_Key trùng lặp, THE Payment_System SHALL không gọi VNPay_Gateway lần thứ hai
3. WHEN Idempotency_Key chưa tồn tại, THE Payment_System SHALL xử lý Refund_Request như một yêu cầu mới
4. THE Payment_System SHALL lưu trữ mapping giữa Idempotency_Key và refund transaction ID
5. WHEN response trả về cho Idempotency_Key trùng lặp, THE Payment_System SHALL trả về cùng HTTP status code như lần đầu tiên

### Requirement 5: Tích Hợp VNPay Refund API

**User Story:** Là một hệ thống thanh toán, tôi muốn gọi VNPay Refund API để thực hiện hoàn tiền thực tế, để tiền được chuyển về tài khoản khách hàng.

#### Acceptance Criteria

1. WHEN Original_Payment vượt qua tất cả xác thực, THE Payment_System SHALL gọi VNPay_Gateway với tham số vnp_TmnCode, vnp_TransactionNo, vnp_Amount, vnp_TransactionDate
2. THE Payment_System SHALL tính toán chữ ký bảo mật (secure hash) theo quy định của VNPay
3. WHEN VNPay_Gateway trả về mã thành công (00), THE Payment_System SHALL cập nhật trạng thái payment thành REFUNDED
4. WHEN VNPay_Gateway trả về mã lỗi, THE Payment_System SHALL lưu lại mã lỗi và không cập nhật trạng thái payment
5. WHEN VNPay_Gateway không phản hồi trong 30 giây, THE Payment_System SHALL timeout và trả về lỗi gateway timeout
6. THE Payment_System SHALL lưu lại response từ VNPay_Gateway vào Audit_Trail

### Requirement 6: Cập Nhật Trạng Thái Payment và Order

**User Story:** Là một hệ thống dữ liệu nhất quán, tôi muốn cập nhật trạng thái payment và order khi hoàn tiền thành công, để phản ánh chính xác trạng thái giao dịch.

#### Acceptance Criteria

1. WHEN VNPay_Gateway xác nhận hoàn tiền thành công, THE Payment_System SHALL cập nhật payment status thành REFUNDED
2. WHEN payment status được cập nhật thành REFUNDED, THE Payment_System SHALL cập nhật order status tương ứng thành CANCELLED
3. THE Payment_System SHALL cập nhật payment và order trong một database transaction duy nhất để đảm bảo Transaction_Atomicity
4. IF việc cập nhật payment hoặc order thất bại, THEN THE Payment_System SHALL rollback toàn bộ transaction và ghi log lỗi
5. THE Payment_System SHALL ghi lại timestamp của việc hoàn tiền vào trường processedAt của payment
6. WHEN payment được hoàn tiền, THE Payment_System SHALL tạo OrderStatusHistory record ghi lại sự thay đổi trạng thái

### Requirement 7: Hoàn Tiền Một Phần

**User Story:** Là một quản trị viên, tôi muốn có thể hoàn tiền một phần số tiền giao dịch, để linh hoạt xử lý các trường hợp đặc biệt.

#### Acceptance Criteria

1. WHEN Admin chỉ định refundAmount nhỏ hơn số tiền thanh toán gốc, THE Payment_System SHALL thực hiện Partial_Refund
2. WHEN thực hiện Partial_Refund, THE Payment_System SHALL lưu lại số tiền đã hoàn so với số tiền gốc
3. WHEN Partial_Refund thành công, THE Payment_System SHALL giữ payment status là REFUNDED và ghi chú số tiền đã hoàn
4. THE Payment_System SHALL cho phép nhiều Partial_Refund cho cùng một payment miễn là tổng số tiền hoàn không vượt quá số tiền gốc
5. WHEN tổng số tiền các lần hoàn vượt quá số tiền gốc, THE Payment_System SHALL từ chối Refund_Request mới

### Requirement 8: Ghi Log Kiểm Toán

**User Story:** Là một hệ thống tuân thủ quy định, tôi muốn ghi log đầy đủ mọi thao tác hoàn tiền, để có thể kiểm toán và truy vết khi cần thiết.

#### Acceptance Criteria

1. WHEN Refund_Request được khởi tạo, THE Payment_System SHALL tạo bản ghi trong Audit_Trail với timestamp, user ID, và payment ID
2. THE Payment_System SHALL ghi lại tất cả tham số request bao gồm refundAmount, reason, và Idempotency_Key
3. WHEN gọi VNPay_Gateway, THE Payment_System SHALL ghi lại request parameters và response từ VNPay
4. WHEN payment status thay đổi, THE Payment_System SHALL ghi lại before state và after state trong audit log
5. THE Payment_System SHALL ghi lại mã lỗi và thông báo lỗi khi Refund_Request thất bại
6. THE Audit_Trail SHALL chứa correlation ID để có thể theo dõi toàn bộ luồng xử lý của một Refund_Request

### Requirement 9: Xử Lý Lỗi và Retry

**User Story:** Là một hệ thống đáng tin cậy, tôi muốn xử lý các lỗi tạm thời và có cơ chế retry phù hợp, để tăng tỷ lệ thành công của hoàn tiền.

#### Acceptance Criteria

1. WHEN VNPay_Gateway trả về lỗi tạm thời (network error, timeout), THE Payment_System SHALL ghi log lỗi và trả về HTTP 503 với thông báo thử lại sau
2. WHEN VNPay_Gateway trả về lỗi nghiệp vụ (invalid transaction, refund not allowed), THE Payment_System SHALL trả về HTTP 400 với thông báo lỗi cụ thể
3. IF xảy ra database connection error trong quá trình cập nhật, THEN THE Payment_System SHALL rollback transaction và trả về HTTP 500
4. THE Payment_System SHALL không tự động retry gọi VNPay_Gateway để tránh duplicate refunds
5. WHEN request thất bại do lỗi tạm thời, THE Payment_System SHALL giữ nguyên payment status để Admin có thể thử lại thủ công
6. THE Payment_System SHALL cung cấp thông báo lỗi chi tiết trong response body giúp Admin hiểu nguyên nhân và cách xử lý

### Requirement 10: Hoàn Trả Điểm Loyalty và Coupon

**User Story:** Là một hệ thống tích hợp, tôi muốn hoàn trả điểm loyalty và giải phóng coupon khi hoàn tiền, để đảm bảo tính nhất quán dữ liệu trong toàn bộ hệ thống.

#### Acceptance Criteria

1. WHEN order được hoàn tiền, THE Payment_System SHALL kiểm tra xem có LoyaltyTransaction liên quan không
2. WHEN order có LoyaltyTransaction type = EARN, THE Payment_System SHALL tạo LoyaltyTransaction mới với type = REVERSAL để thu hồi điểm đã tặng
3. WHEN order có LoyaltyTransaction type = REDEEM, THE Payment_System SHALL tạo LoyaltyTransaction mới với type = ADJUSTMENT để hoàn trả điểm đã dùng
4. WHEN order có CouponRedemption, THE Payment_System SHALL cập nhật CouponRedemption status thành RELEASED
5. THE Payment_System SHALL thực hiện các thao tác loyalty và coupon trong cùng database transaction với payment refund để đảm bảo Transaction_Atomicity
6. WHEN việc hoàn trả loyalty hoặc coupon thất bại, THE Payment_System SHALL rollback toàn bộ transaction bao gồm cả refund

### Requirement 11: Response Format

**User Story:** Là một client application, tôi muốn nhận response có cấu trúc rõ ràng và nhất quán, để dễ dàng xử lý kết quả hoàn tiền.

#### Acceptance Criteria

1. WHEN Refund_Request thành công, THE Payment_System SHALL trả về HTTP 200 với body chứa refund ID, payment ID, refunded amount, và status
2. WHEN Refund_Request thất bại do validation, THE Payment_System SHALL trả về HTTP 400 với error code và error message
3. WHEN Refund_Request thất bại do kiểm tra phân quyền (authorization check), THE Payment_System SHALL trả về HTTP 403 với thông báo rõ ràng và HTTP 403 SHALL được ưu tiên trả về trước lỗi validation (HTTP 400) khi cả hai lỗi xảy ra đồng thời
4. WHEN VNPay_Gateway thất bại, THE Payment_System SHALL trả về HTTP 502 với gateway error details
5. THE Payment_System SHALL sử dụng format JSON cho tất cả response bodies
6. THE Payment_System SHALL bao gồm request ID trong response header để hỗ trợ debug và tracing

### Requirement 12: Hoàn Trả Inventory Reservation

**User Story:** Là một hệ thống quản lý kho, tôi muốn giải phóng nguyên liệu đã giữ khi order được hoàn tiền, để nguyên liệu có thể được sử dụng cho đơn hàng khác.

#### Acceptance Criteria

1. WHEN order status được cập nhật thành CANCELLED do refund, THE Payment_System SHALL kiểm tra InventoryReservation liên quan
2. WHEN order có InventoryReservation với status = CONSUMED, THE Payment_System SHALL cập nhật status thành RELEASED
3. WHEN cập nhật InventoryReservation status, THE Payment_System SHALL hoàn trả số lượng nguyên liệu trong InventoryReservationItem về Ingredient stockQuantity
4. THE Payment_System SHALL cập nhật Ingredient stockQuantity trong cùng database transaction với payment refund
5. WHEN có conflict về Ingredient version (optimistic locking), THE Payment_System SHALL retry cập nhật stockQuantity tối đa 3 lần
6. IF việc hoàn trả inventory thất bại sau 3 lần retry, THEN THE Payment_System SHALL thực hiện rollback toàn bộ refund transaction một cách bắt buộc (mandatory rollback) và đảm bảo rollback được hoàn tất trước hoặc đồng thời với việc trả về lỗi cho client

### Requirement 13: Bảo Mật Thông Tin Nhạy Cảm

**User Story:** Là một hệ thống bảo mật, tôi muốn bảo vệ thông tin nhạy cảm trong quá trình hoàn tiền, để tuân thủ quy định về bảo mật dữ liệu thanh toán.

#### Acceptance Criteria

1. THE Payment_System SHALL không log thông tin nhạy cảm như số thẻ, CVV, hoặc OTP trong Audit_Trail
2. WHEN giao tiếp với VNPay_Gateway, THE Payment_System SHALL sử dụng HTTPS cho tất cả requests
3. THE Payment_System SHALL mã hóa chữ ký bảo mật (secure hash) theo chuẩn SHA-256
4. WHEN lưu trữ VNPay response, THE Payment_System SHALL chỉ lưu các trường cần thiết cho kiểm toán và không lưu thông tin nhạy cảm
5. THE Payment_System SHALL validate và sanitize tất cả input parameters để phòng chống SQL injection và XSS attacks
6. THE Payment_System SHALL rate limit endpoint hoàn tiền để phòng chống brute force attacks (tối đa 10 requests/phút/user)

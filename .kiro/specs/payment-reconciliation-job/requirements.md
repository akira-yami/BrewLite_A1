# Requirements Document

## Introduction

Payment Reconciliation Job là hệ thống tự động chạy định kỳ để phát hiện và khôi phục (recover) các giao dịch thanh toán VNPay bị kẹt ở trạng thái PROCESSING trong hệ thống BrewLite. Job này đảm bảo tính nhất quán dữ liệu giữa hệ thống nội bộ và cổng thanh toán VNPay bằng cách chủ động truy vấn trạng thái thực tế của các giao dịch và cập nhật lại database khi phát hiện sự khác biệt.

## Glossary

- **Reconciliation_Job**: Tác vụ chạy định kỳ để đối soát và khôi phục các giao dịch thanh toán bị kẹt
- **Stuck_Payment**: Giao dịch thanh toán ở trạng thái PROCESSING vượt quá ngưỡng thời gian cho phép
- **VNPay_QueryDr_API**: API của VNPay cho phép tra cứu trạng thái thực tế của giao dịch thanh toán
- **Recovery_Window**: Khoảng thời gian tối thiểu một payment phải ở trạng thái PROCESSING trước khi được xem xét để reconcile
- **Lease_Mechanism**: Cơ chế khóa phân tán để đảm bảo một payment chỉ được xử lý bởi một job instance tại một thời điểm
- **PaymentsService**: Service NestJS chứa business logic xử lý thanh toán, bao gồm phương thức recoverStuckPayment
- **Idempotency**: Tính chất cho phép thực thi một thao tác nhiều lần mà không gây ra side effects bổ sung

## Requirements

### Yêu cầu 1: Phát hiện Stuck Payments

**User Story:** Với vai trò là hệ thống tự động, tôi cần phát hiện các giao dịch thanh toán bị kẹt ở trạng thái PROCESSING, để có thể tiến hành đối soát và khôi phục chúng.

#### Acceptance Criteria

1. THE Reconciliation_Job SHALL query database để tìm tất cả payments có status = PROCESSING và method = VNPAY
2. WHEN querying stuck payments, THE Reconciliation_Job SHALL chỉ chọn các payments có createdAt cũ hơn Recovery_Window (ví dụ: 5 phút)
3. THE Reconciliation_Job SHALL sắp xếp stuck payments theo thứ tự createdAt tăng dần để xử lý các giao dịch cũ nhất trước
4. THE Reconciliation_Job SHALL giới hạn số lượng payments được xử lý trong một lần chạy để tránh overload (ví dụ: batch size 50)
5. THE Reconciliation_Job SHALL đảm bảo query không ảnh hưởng đến hiệu năng của database chính thông qua việc sử dụng index hợp lý

### Yêu cầu 2: Distributed Locking cho Concurrent Processing

**User Story:** Với vai trò là quản trị viên hệ thống, tôi cần đảm bảo rằng nhiều instances của reconciliation job có thể chạy đồng thời mà không xử lý trùng lặp cùng một payment, để tránh race conditions và duplicate processing.

#### Acceptance Criteria

1. WHEN Reconciliation_Job bắt đầu xử lý một stuck payment, THE Reconciliation_Job SHALL tạo một lease record trong database với expiration time
2. THE lease record SHALL chứa paymentId, jobInstanceId, và leaseExpiresAt timestamp
3. WHEN tạo lease, THE Reconciliation_Job SHALL sử dụng database constraints hoặc optimistic locking để đảm bảo chỉ một job instance có thể acquire lease
4. IF một job instance khác đã acquire lease cho cùng payment, THEN THE Reconciliation_Job SHALL bỏ qua payment đó và tiếp tục với payment tiếp theo
5. WHEN lease expires (ví dụ: sau 2 phút) mà job chưa hoàn thành, THE Reconciliation_Job SHALL cho phép job instances khác acquire lease mới
6. WHEN job hoàn thành xử lý payment, THE Reconciliation_Job SHALL release lease bằng cách xóa hoặc đánh dấu lease record

### Yêu cầu 3: Truy vấn VNPay QueryDr API

**User Story:** Với vai trò là hệ thống đối soát, tôi cần truy vấn trạng thái thực tế của payment từ VNPay, để xác định xem giao dịch đã thành công, thất bại hay vẫn đang pending.

#### Acceptance Criteria

1. WHEN xử lý một stuck payment, THE Reconciliation_Job SHALL gọi PaymentsService.recoverStuckPayment với paymentId và serverIp
2. THE Reconciliation_Job SHALL truyền server IP hợp lệ (IPv4 hoặc IPv6) để ký request gửi đến VNPay
3. WHEN gọi recoverStuckPayment, THE Reconciliation_Job SHALL handle các outcomes: SETTLED_SUCCESS, SETTLED_FAILURE, STILL_PROCESSING, và MANUAL_REVIEW
4. IF recoverStuckPayment throw VnpayInquiryError, THEN THE Reconciliation_Job SHALL log error và schedule retry cho payment đó trong lần chạy tiếp theo
5. THE Reconciliation_Job SHALL không retry ngay lập tức khi gặp VnpayInquiryError để tránh spam VNPay API

### Yêu cầu 4: Cập nhật trạng thái Payment

**User Story:** Với vai trò là hệ thống đối soát, tôi cần cập nhật trạng thái payment trong database dựa trên kết quả từ VNPay, để đảm bảo tính nhất quán dữ liệu.

#### Acceptance Criteria

1. WHEN recoverStuckPayment returns SETTLED_SUCCESS, THE Reconciliation_Job SHALL log thông báo thành công và không cần thêm hành động nào
2. WHEN recoverStuckPayment returns SETTLED_FAILURE, THE Reconciliation_Job SHALL log thông báo failure và không cần thêm hành động nào
3. WHEN recoverStuckPayment returns STILL_PROCESSING, THE Reconciliation_Job SHALL log warning và để payment tiếp tục ở trạng thái PROCESSING để retry sau
4. WHEN recoverStuckPayment returns MANUAL_REVIEW, THE Reconciliation_Job SHALL log error và trigger alert để nhân viên can thiệp thủ công
5. THE Reconciliation_Job SHALL ghi nhận tất cả recovery attempts vào PaymentRecoveryAudit table để có audit trail đầy đủ

### Yêu cầu 5: Retry Logic và Error Handling

**User Story:** Với vai trò là quản trị viên hệ thống, tôi cần đảm bảo job có khả năng retry khi gặp lỗi tạm thời, nhưng không retry vô hạn để tránh lãng phí tài nguyên.

#### Acceptance Criteria

1. WHEN một payment recovery attempt thất bại do network error hoặc VNPay timeout, THE Reconciliation_Job SHALL cho phép payment được retry trong các lần chạy tiếp theo
2. THE Reconciliation_Job SHALL track số lần retry cho mỗi payment thông qua số lượng PaymentRecoveryAudit records
3. WHEN một payment đã được retry vượt quá ngưỡng cho phép (ví dụ: 10 lần), THE Reconciliation_Job SHALL chuyển payment sang MANUAL_REVIEW và trigger alert
4. WHEN toàn bộ job instance gặp lỗi nghiêm trọng, THE Reconciliation_Job SHALL log error và exit gracefully để scheduler có thể khởi động lại
5. THE Reconciliation_Job SHALL implement exponential backoff giữa các recovery attempts cho cùng một payment

### Yêu cầu 6: Monitoring và Alerting

**User Story:** Với vai trò là quản trị viên hệ thống, tôi cần được thông báo khi job phát hiện bất thường hoặc cần can thiệp thủ công, để đảm bảo hệ thống thanh toán hoạt động ổn định.

#### Acceptance Criteria

1. THE Reconciliation_Job SHALL emit metrics về số lượng stuck payments được phát hiện trong mỗi lần chạy
2. THE Reconciliation_Job SHALL emit metrics về số lượng payments được settled successfully, failed, và requires manual review
3. WHEN một payment cần MANUAL_REVIEW, THE Reconciliation_Job SHALL gửi alert đến monitoring system (ví dụ: Slack, PagerDuty)
4. THE Reconciliation_Job SHALL log thời gian bắt đầu và kết thúc của mỗi lần chạy để có thể monitor execution duration
5. THE Reconciliation_Job SHALL log warning nếu số lượng stuck payments vượt quá ngưỡng bất thường (ví dụ: >100)

### Yêu cầu 7: Idempotency và Data Integrity

**User Story:** Với vai trò là hệ thống thanh toán, tôi cần đảm bảo rằng việc chạy job nhiều lần không gây ra side effects không mong muốn, để bảo vệ tính toàn vẹn dữ liệu.

#### Acceptance Criteria

1. THE Reconciliation_Job SHALL đảm bảo mỗi payment chỉ được settle một lần bất kể job chạy bao nhiêu lần
2. WHEN job chạy lại trên cùng một payment, THE Reconciliation_Job SHALL nhận ra payment đã được settled và bỏ qua nó
3. THE Reconciliation_Job SHALL sử dụng database transactions để đảm bảo atomicity khi cập nhật payment status và order status
4. THE Reconciliation_Job SHALL không modify payments đã ở trạng thái SUCCEEDED, FAILED, REFUNDED, hoặc MANUAL_REVIEW
5. THE Reconciliation_Job SHALL handle concurrent modifications của payment bởi IPN callback một cách an toàn

### Yêu cầu 8: Configuration và Scheduling

**User Story:** Với vai trò là quản trị viên hệ thống, tôi cần có khả năng cấu hình và điều chỉnh các tham số của job mà không cần deploy lại code, để có thể tối ưu hóa hiệu suất và chi phí.

#### Acceptance Criteria

1. THE Reconciliation_Job SHALL đọc Recovery_Window duration từ environment variable hoặc config file
2. THE Reconciliation_Job SHALL đọc batch size (số lượng payments xử lý mỗi lần) từ configuration
3. THE Reconciliation_Job SHALL đọc lease expiration time từ configuration
4. THE Reconciliation_Job SHALL đọc max retry attempts từ configuration
5. THE Reconciliation_Job SHALL support scheduling frequency configurable (ví dụ: mỗi 2 phút, mỗi 5 phút)
6. THE Reconciliation_Job SHALL có khả năng enable/disable thông qua configuration flag để dễ dàng bật/tắt khi cần

### Yêu cầu 9: Graceful Shutdown và Resource Cleanup

**User Story:** Với vai trò là quản trị viên hệ thống, tôi cần đảm bảo job có thể dừng lại một cách graceful khi nhận shutdown signal, để tránh để lại inconsistent state hoặc zombie processes.

#### Acceptance Criteria

1. WHEN job nhận SIGTERM hoặc SIGINT signal, THE Reconciliation_Job SHALL dừng việc chọn payments mới để xử lý
2. THE Reconciliation_Job SHALL cho phép các recovery attempts đang chạy hoàn thành trước khi exit
3. THE Reconciliation_Job SHALL có timeout cho graceful shutdown (ví dụ: 30 giây) và force exit nếu vượt quá
4. WHEN shutdown timeout expires, THE Reconciliation_Job SHALL release tất cả leases đang hold
5. THE Reconciliation_Job SHALL log shutdown reason và trạng thái cuối cùng trước khi exit

### Yêu cầu 10: Testing và Observability

**User Story:** Với vai trò là developer, tôi cần có khả năng test và debug job dễ dàng, để đảm bảo job hoạt động đúng trong mọi trường hợp.

#### Acceptance Criteria

1. THE Reconciliation_Job SHALL có dry-run mode cho phép chạy job mà không thực sự cập nhật database
2. THE Reconciliation_Job SHALL log chi tiết về mỗi payment đang được xử lý bao gồm paymentId, orderId, và trạng thái hiện tại
3. THE Reconciliation_Job SHALL có structured logging (JSON format) để dễ dàng parse và analyze logs
4. THE Reconciliation_Job SHALL expose health check endpoint để monitoring system có thể verify job đang hoạt động
5. THE Reconciliation_Job SHALL emit OpenTelemetry traces cho mỗi recovery attempt để có distributed tracing

### Yêu cầu 11: Performance và Scalability

**User Story:** Với vai trò là quản trị viên hệ thống, tôi cần đảm bảo job có thể scale để xử lý số lượng lớn stuck payments mà không ảnh hưởng đến hiệu năng hệ thống chính.

#### Acceptance Criteria

1. THE Reconciliation_Job SHALL sử dụng database index trên (status, method, createdAt) để query stuck payments hiệu quả
2. THE Reconciliation_Job SHALL process payments theo batch để tránh load quá nhiều data vào memory cùng lúc
3. THE Reconciliation_Job SHALL support horizontal scaling bằng cách cho phép nhiều job instances chạy đồng thời với lease mechanism
4. THE Reconciliation_Job SHALL có rate limiting cho VNPay API calls để tuân thủ API rate limits của VNPay
5. THE Reconciliation_Job SHALL có configurable concurrency limit cho số lượng concurrent recovery attempts

### Yêu cầu 12: Audit Trail và Compliance

**User Story:** Với vai trò là compliance officer, tôi cần có audit trail đầy đủ về tất cả các recovery attempts, để đảm bảo tuân thủ quy định và có thể điều tra khi cần.

#### Acceptance Criteria

1. THE Reconciliation_Job SHALL ghi lại mỗi recovery attempt vào PaymentRecoveryAudit table với timestamp, outcome, và details
2. THE PaymentRecoveryAudit record SHALL chứa actorType = SYSTEM, correlationId để tracking, và incidentReference
3. THE Reconciliation_Job SHALL ghi lại VNPay API response code và transaction status vào audit details
4. THE Reconciliation_Job SHALL preserve audit records vô thời hạn để có thể audit sau này
5. THE Reconciliation_Job SHALL ghi lại jobInstanceId vào audit trail để xác định instance nào đã xử lý payment


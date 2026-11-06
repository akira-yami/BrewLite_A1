# Implementation Plan: Payment Refund API

## Overview

Triển khai API Hoàn Tiền Thanh Toán cho phép Admin/Staff hoàn trả tiền cho khách hàng thông qua cổng thanh toán VNPay. Implementation tập trung vào đảm bảo tính toàn vẹn dữ liệu (atomicity), tính idempotent, và khả năng kiểm toán đầy đủ.

**Ngôn ngữ lập trình**: TypeScript (NestJS framework)

**Các thành phần chính**:
- Database schema: 2 tables mới (Refund, RefundAuditLog)
- DTOs: RefundRequestDto, RefundResponseDto
- Services: RefundService (orchestrator), VNPayGatewayService
- Guards: RateLimitGuard
- Controller: PaymentsController với endpoint POST /payments/:id/refund
- Integration: LoyaltyService, CouponService, InventoryService

## Tasks

- [ ] 1. Chuẩn bị database schema và migrations
  - [ ] 1.1 Tạo Prisma migration cho Refund model
    - Tạo file migration với enum RefundStatus (PROCESSING, SUCCEEDED, FAILED)
    - Định nghĩa table refunds với các trường: id, paymentId, idempotencyKey, requestHash, amount, reason, status, vnpayTransactionNo, vnpayResponseCode, errorCode, errorMessage, initiatedByUserId, processedAt, createdAt, updatedAt
    - Thêm unique constraint cho (paymentId, idempotencyKey)
    - Thêm indexes: (paymentId, createdAt DESC), (status, createdAt)
    - Thêm foreign keys cho paymentId và initiatedByUserId
    - _Requirements: 1.5, 4.4, 7.2_

  - [ ] 1.2 Tạo Prisma migration cho RefundAuditLog model
    - Tạo enum RefundAuditEventType với 11 event types (REFUND_INITIATED, VALIDATION_FAILED, VNPAY_REQUEST_SENT, VNPAY_RESPONSE_RECEIVED, PAYMENT_STATUS_UPDATED, ORDER_STATUS_UPDATED, LOYALTY_REVERSED, COUPON_RELEASED, INVENTORY_RESTORED, REFUND_SUCCEEDED, REFUND_FAILED)
    - Định nghĩa table refund_audit_logs với các trường: id, refundId (nullable), paymentId, correlationId, eventType, actorUserId (nullable), beforeState (JSON), afterState (JSON), vnpayRequest (JSON), vnpayResponse (JSON), errorDetails (JSON), metadata (JSON), createdAt
    - Thêm indexes: (paymentId, createdAt), (correlationId), (eventType, createdAt)
    - Thêm foreign keys cho refundId, paymentId, actorUserId
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 1.3 Cập nhật Prisma schema với relations
    - Thêm relation refunds và refundAuditLogs vào Payment model
    - Thêm relation initiatedRefunds và refundAuditLogs vào User model
    - Generate Prisma client với schema mới
    - _Requirements: 1.1, 2.4_

  - [ ] 1.4 Chạy migrations trên development database
    - Chạy `npx prisma migrate dev` để apply migrations
    - Verify tables và indexes được tạo đúng
    - Verify foreign key constraints hoạt động
    - _Requirements: 6.3_

- [ ] 2. Checkpoint - Database schema ready
  - Ensure all migrations chạy thành công, database schema đúng với design, ask user if questions arise.

- [ ] 3. Tạo DTOs và validation
  - [ ] 3.1 Implement RefundRequestDto với validation
    - Tạo class RefundRequestDto với decorators: @IsNumber() @Min(1) cho refundAmount, @IsString() @Length(1, 500) cho reason, @IsString() @Length(1, 100) cho idempotencyKey
    - Thêm custom validator để đảm bảo refundAmount là số nguyên dương
    - _Requirements: 1.5, 3.4, 3.5_

  - [ ] 3.2 Implement RefundResponseDto
    - Tạo class RefundResponseDto với các trường: refundId, paymentId, orderId, amount, status (PHẢI là 'pending'), vnpayTransactionNo (optional), processedAt (optional), createdAt
    - Thêm serialization logic để format dates và amounts đúng
    - **Clarification 1**: Response PHẢI trả về ngay với status='pending' và refundId, KHÔNG chờ hoàn tất xử lý. VNPay processing happens asynchronously.
    - _Requirements: 11.1, 11.2, 11.5, Clarification Req 1.4_

  - [ ] 3.3 Implement VNPayRefundRequest và VNPayRefundResponse interfaces
    - Define VNPayRefundRequest interface với các trường theo VNPay API spec
    - Define VNPayRefundResponse interface với các trường response từ VNPay
    - Thêm type guards để validate VNPay response format
    - _Requirements: 5.1, 5.2_

  - [ ] 3.4 Tạo RefundErrorCode enum và custom exceptions
    - Define enum RefundErrorCode với 8 error codes (PAYMENT_NOT_FOUND, PAYMENT_NOT_SUCCEEDED, PAYMENT_ALREADY_REFUNDED, REFUND_WINDOW_EXPIRED, REFUND_AMOUNT_INVALID, REFUND_AMOUNT_EXCEEDS_ORIGINAL, MISSING_GATEWAY_TRANSACTION_ID, DUPLICATE_IDEMPOTENCY_KEY_WITH_DIFFERENT_PARAMS)
    - Implement RefundValidationError extends BadRequestException
    - Implement VNPayGatewayError extends BadGatewayException
    - Implement VNPayTimeoutError extends ServiceUnavailableException
    - _Requirements: 1.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 9.1, 9.2, 9.3, 9.6_

- [ ] 4. Implement VNPayGatewayService
  - [ ] 4.1 Tạo VNPayGatewayService với secure hash calculation
    - Implement calculateSecureHash() method sử dụng SHA-256 để tính secure hash theo quy định VNPay
    - Implement parameter sorting theo alphabet trước khi hash
    - Load VNPay config từ environment variables (TMN_CODE, SECRET_KEY, API_URL)
    - _Requirements: 5.2, 13.3_

  - [ ] 4.2 Implement buildRefundParams() method
    - Build VNPay refund request parameters từ VNPayRefundRequest
    - Format date theo yyyyMMddHHmmss
    - Convert amount sang VND * 100 format
    - Set vnp_TransactionType = '02' cho full refund, '03' cho partial refund
    - _Requirements: 5.1, 7.1_

  - [ ] 4.3 Implement refund() method với HTTP client
    - Gọi VNPay Refund API endpoint qua HTTPS POST
    - Set timeout 30 seconds
    - Handle network errors và timeout errors
    - Throw VNPayTimeoutError nếu timeout
    - _Requirements: 5.5, 13.2_

  - [ ] 4.4 Implement parseResponse() method
    - Parse VNPay response body
    - Validate secure hash của response
    - Map response codes sang internal VNPayRefundResponse
    - Throw VNPayGatewayError nếu response code khác '00'
    - _Requirements: 5.3, 5.4_

  - [ ]* 4.5 Write unit tests cho VNPayGatewayService
    - Test calculateSecureHash() với test vectors từ VNPay docs
    - Test buildRefundParams() format đúng tất cả parameters
    - Test refund() method với mocked HTTP client (success, timeout, network error cases)
    - Test parseResponse() với various response codes
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 5. Implement RateLimitGuard
  - [ ] 5.1 Tạo RateLimitGuard với in-memory cache
    - Implement CanActivate interface
    - Use Map<userId, { count: number, resetAt: Date }> để track requests per user
    - Set limit: 10 requests per minute per user
    - Reset counter sau mỗi phút
    - Throw TooManyRequestsException khi exceed limit
    - _Requirements: 13.6_

  - [ ]* 5.2 Write unit tests cho RateLimitGuard
    - Test cho phép requests dưới limit
    - Test block requests vượt limit
    - Test reset counter sau 1 phút
    - Test different users có separate counters
    - _Requirements: 13.6_

- [ ] 6. Checkpoint - Core services ready
  - Ensure VNPayGatewayService và RateLimitGuard implement đúng, tests pass, ask user if questions arise.

- [ ] 7. Implement RefundService - Validation Logic
  - [ ] 7.1 Tạo RefundService và inject dependencies
    - Inject PrismaService, VNPayGatewayService, ConfigService
    - Setup logger với structured logging
    - _Requirements: 1.1, 2.1_

  - [ ] 7.2 Implement validateRefundConditions() private method
    - Check payment.status === SUCCEEDED, throw nếu không
    - Check payment.gateway TransactionId exists, throw nếu không
    - Check refund window (90 days từ payment.createdAt), throw nếu expired
    - Check refundAmount > 0, throw nếu không
    - Check refundAmount <= payment.amount, throw nếu vượt
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 7.3 Implement calculateTotalRefunded() private method
    - Query tất cả Refund records với paymentId và status = SUCCEEDED
    - Sum up amounts của tất cả successful refunds
    - Return tổng số tiền đã refund
    - _Requirements: 7.4, 7.5_

  - [ ] 7.4 Implement calculateRequestHash() helper
    - Normalize RefundRequestDto (trim reason, sort keys)
    - Calculate SHA-256 hash của normalized JSON
    - Return hex digest
    - _Requirements: 4.1, 4.4_

  - [ ]* 7.5 Write unit tests cho validation methods
    - Test validateRefundConditions() với all error cases
    - Test calculateTotalRefunded() với multiple partial refunds
    - Test calculateRequestHash() produces consistent hashes
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 7.4, 7.5_

- [ ] 8. Implement RefundService - Idempotency Logic
  - [ ] 8.1 Implement checkIdempotency() private method
    - Query Refund table với WHERE (paymentId, idempotencyKey)
    - Nếu found, compare requestHash
    - Nếu hash khác nhau, throw DUPLICATE_IDEMPOTENCY_KEY_WITH_DIFFERENT_PARAMS
    - Nếu hash giống nhau, return cached RefundResult
    - Nếu không found, return null
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [ ] 8.2 Implement mapToRefundResult() helper method
    - Map Refund entity sang RefundResult DTO
    - Include payment.orderId trong result
    - Format dates và amounts
    - _Requirements: 11.1_

  - [ ]* 8.3 Write unit tests cho idempotency logic
    - Test checkIdempotency() returns cached result cho same key + same params
    - Test checkIdempotency() throws error cho same key + different params
    - Test checkIdempotency() returns null cho new key
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [ ] 9. Implement RefundService - Integration với Other Services
  - [ ] 9.1 Implement reverseLoyaltyPoints() private method
    - Query LoyaltyTransaction với orderId
    - Nếu có transaction type = EARN, tạo REVERSAL transaction với negative points
    - Nếu có transaction type = REDEEM, tạo ADJUSTMENT transaction với positive points
    - Thực hiện trong transaction context (tx parameter)
    - _Requirements: 10.2, 10.3, 10.5_

  - [ ] 9.2 Implement releaseCoupon() private method
    - Query CouponRedemption với orderId
    - Nếu có, update status thành RELEASED
    - Thực hiện trong transaction context (tx parameter)
    - _Requirements: 10.4, 10.5_

  - [ ] 9.3 Implement restoreInventory() private method
    - Query InventoryReservation với orderId và status = CONSUMED
    - Update status thành RELEASED
    - For each InventoryReservationItem, increment Ingredient.stockQuantity
    - Implement optimistic locking retry (max 3 retries với exponential backoff: 100ms, 200ms, 400ms)
    - Throw error nếu retry fails
    - Thực hiện trong transaction context (tx parameter)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [ ] 9.4 Implement createAuditLog() private method
    - Tạo RefundAuditLog record với parameters: refundId, paymentId, correlationId, eventType, actorUserId, beforeState, afterState, vnpayRequest, vnpayResponse, errorDetails, metadata
    - Sanitize sensitive data trước khi log (không log số thẻ, CVV, OTP, full secure hash keys)
    - Thực hiện trong transaction context (tx parameter)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 13.1, 13.4_

  - [ ]* 9.5 Write unit tests cho integration methods
    - Test reverseLoyaltyPoints() với EARN và REDEEM scenarios
    - Test releaseCoupon() updates status correctly
    - Test restoreInventory() với optimistic locking conflicts
    - Test createAuditLog() sanitizes sensitive data
    - _Requirements: 10.2, 10.3, 10.4, 12.3, 12.5, 13.1_

- [ ] 10. Checkpoint - Service integrations ready
  - Ensure RefundService validation và integration methods hoạt động đúng, tests pass, ask user if questions arise.

- [ ] 11. Implement RefundService - Main Transaction Flow
  - [ ] 11.1 Implement executeRefundTransaction() private method
    - Start Prisma interactive transaction với timeout 30s
    - Lock payment record với FOR UPDATE
    - Validate refund conditions
    - Calculate total refunded và check tổng <= original amount
    - Call VNPayGatewayService.refund()
    - Nếu VNPay success: update payment status thành REFUNDED, update order status thành CANCELLED, call reverseLoyaltyPoints(), releaseCoupon(), restoreInventory()
    - Create Refund record với status SUCCEEDED
    - Create audit logs cho tất cả steps
    - Store idempotency mapping
    - Nếu bất kỳ step nào fails, rollback entire transaction
    - **Clarification 3**: Nếu restoreInventory() fails (optimistic locking hoặc constraint violation), PHẢI rollback transaction trước khi return error. Không để database trong inconsistent state.
    - Return RefundResult
    - _Requirements: 5.3, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 10.5, 10.6, Clarification Req 12.6_

  - [ ] 11.2 Implement processRefund() public method
    - Generate correlation ID cho request
    - Create audit log: REFUND_INITIATED
    - Check idempotency trước
    - Nếu idempotency hit, return cached result
    - Nếu new request, call executeRefundTransaction()
    - Handle errors: catch VNPayGatewayError, VNPayTimeoutError, database errors
    - Create audit log: REFUND_SUCCEEDED hoặc REFUND_FAILED
    - Return RefundResult hoặc throw appropriate exception
    - _Requirements: 1.2, 4.1, 4.2, 5.3, 5.4, 5.6, 6.3, 8.1, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 11.3 Write integration tests cho RefundService
    - Test full refund success flow với real database (mocked VNPay)
    - Test partial refund flow với multiple refunds
    - Test idempotency prevents duplicate refunds
    - Test VNPay failure rolls back transaction
    - Test database error rolls back transaction
    - Test concurrent requests với same idempotency key
    - Test loyalty/coupon/inventory coordination
    - **Clarification 3**: Test specifically cho inventory restoration failure scenario - verify transaction rollback leaves database unchanged
    - _Requirements: 4.1, 4.2, 5.3, 6.3, 7.1, 7.4, 10.5, 10.6, 12.6, Clarification Req 12.6_

- [ ] 12. Implement PaymentsController
  - [ ] 12.1 Tạo refundPayment() endpoint trong PaymentsController
    - Add route: @Post(':id/refund')
    - **Clarification 2**: Apply guards trong thứ tự ĐÚNG để authorization check chạy TRƯỚC validation (403 takes precedence over 400): @UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard) TRƯỚC khi validate body
    - Apply role decorator: @Roles(UserRole.PAYMENT_OPERATOR)
    - Validate paymentId với ParseUUIDPipe
    - Validate body với RefundRequestDto (chạy SAU guards)
    - Extract user từ JWT token
    - Call RefundService.processRefund()
    - Return RefundResponseDto với HTTP 200
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 11.1, Clarification Req 11.3_

  - [ ] 12.2 Implement global exception filter cho refund errors
    - Map RefundValidationError sang HTTP 400 với structured error response
    - Map VNPayGatewayError sang HTTP 502
    - Map VNPayTimeoutError sang HTTP 503
    - Map NotFoundException sang HTTP 404
    - Map ForbiddenException sang HTTP 403
    - Map UnauthorizedException sang HTTP 401
    - Map database errors sang HTTP 500
    - Include requestId trong response header và body
    - Format error response theo ErrorResponse interface
    - _Requirements: 1.3, 2.2, 2.3, 9.1, 9.2, 9.3, 9.6, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 12.3 Write unit tests cho PaymentsController
    - Test endpoint calls RefundService.processRefund() với correct params
    - Test guards applied correctly (mock guards)
    - Test DTO validation rejects invalid inputs
    - Test exception filter maps errors correctly
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 11.1, 11.2, 11.3, 11.4_

- [ ] 13. Module wiring và configuration
  - [ ] 13.1 Register RefundService trong PaymentsModule
    - Add RefundService, VNPayGatewayService vào providers array
    - Inject dependencies correctly
    - _Requirements: 1.1, 5.1_

  - [ ] 13.2 Configure environment variables cho VNPay
    - Add VNPAY_TMN_CODE, VNPAY_SECRET_KEY, VNPAY_API_URL, VNPAY_TIMEOUT vào .env
    - Validate environment variables ở startup với ConfigService
    - _Requirements: 5.1, 5.2, 13.2_

  - [ ] 13.3 Setup RateLimitGuard globally hoặc per-route
    - Register RateLimitGuard trong app module hoặc apply per-route
    - Configure rate limit từ environment variables (default: 10 req/min)
    - _Requirements: 13.6_

  - [ ] 13.4 Setup structured logging cho refund operations
    - Configure Winston hoặc Pino logger với JSON format
    - Add correlation ID middleware để track requests
    - Setup log levels (ERROR, WARN, INFO, DEBUG)
    - Ensure sensitive data sanitization
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 13.1_

- [ ] 14. Checkpoint - API ready for testing
  - Ensure PaymentsController endpoint hoạt động, dependencies wired correctly, config loaded, ask user if questions arise.

- [ ] 15. End-to-end testing
  - [ ]* 15.1 Write E2E test cho happy path
    - Setup test database với seed data (payment SUCCEEDED với all associations)
    - Call POST /payments/:id/refund với valid Admin JWT token
    - Verify response HTTP 200 với RefundResponseDto
    - Verify database: payment status = REFUNDED, order status = CANCELLED, loyalty reversed, coupon released, inventory restored
    - Verify audit logs created
    - _Requirements: 1.1, 1.2, 5.3, 6.1, 6.2, 10.2, 10.3, 10.4, 12.3_

  - [ ]* 15.2 Write E2E test cho authentication failures
    - Test without JWT token returns 401
    - Test expired JWT token returns 401
    - Test invalid JWT token returns 401
    - _Requirements: 2.3_

  - [ ]* 15.3 Write E2E test cho authorization failures
    - **Clarification 2**: Test rằng authorization failures (403) trả về TRƯỚC validation failures (400)
    - Test với user role CUSTOMER returns 403 (even with invalid request body)
    - Test với user role BARISTA returns 403 (even with invalid request body)
    - Test với user role PAYMENT_OPERATOR với invalid body returns 400
    - Test với user role PAYMENT_OPERATOR với valid body returns 200 (success)
    - _Requirements: 2.2, Clarification Req 11.3_

  - [ ]* 15.4 Write E2E test cho validation errors
    - Test payment not found returns 404
    - Test payment not SUCCEEDED returns 400
    - Test payment already REFUNDED returns 400
    - Test refund window expired returns 400
    - Test refund amount invalid returns 400
    - Test refund amount exceeds original returns 400
    - **Clarification 2**: Verify rằng validation errors CHỈ occur khi user ĐÃ passed authorization (có role PAYMENT_OPERATOR)
    - _Requirements: 1.3, 3.1, 3.2, 3.3, 3.4, 3.5, Clarification Req 11.3_

  - [ ]* 15.5 Write E2E test cho idempotency
    - Send same request twice với same idempotency key
    - Verify second request returns cached result (same refundId)
    - Verify only one Refund record created
    - _Requirements: 4.1, 4.2, 4.5_

  - [ ]* 15.6 Write E2E test cho partial refunds
    - Create payment với amount 100,000 VND
    - Send first refund request cho 30,000 VND, verify success
    - Send second refund request cho 50,000 VND, verify success
    - Send third refund request cho 30,000 VND, verify fails (exceeds original)
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [ ]* 15.7 Write E2E test cho rate limiting
    - Send 10 requests trong 1 minute, verify all succeed
    - Send 11th request, verify returns 429
    - Wait 1 minute, send another request, verify succeeds
    - _Requirements: 13.6_

  - [ ]* 15.8 Write E2E test với VNPay sandbox
    - Configure test environment với VNPay sandbox credentials
    - Create real payment via VNPay sandbox
    - Call refund endpoint
    - Verify VNPay sandbox confirms refund
    - Verify database updated correctly
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 16. Documentation và deployment preparation
  - [ ] 16.1 Write API documentation cho refund endpoint
    - Document endpoint path, method, authentication
    - Document request body schema (RefundRequestDto)
    - Document response schemas (RefundResponseDto, ErrorResponse)
    - Document all possible HTTP status codes và error codes
    - Document rate limiting rules
    - Add examples cho success và error cases
    - _Requirements: 1.1, 1.5, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ] 16.2 Create Postman/Insomnia collection cho manual testing
    - Create request cho happy path
    - Create requests cho all error scenarios
    - Include authentication setup
    - Add tests/assertions cho responses
    - _Requirements: 1.1, 1.2_

  - [ ] 16.3 Write deployment checklist
    - Verify database migrations ran successfully
    - Verify VNPay credentials configured correctly in production
    - Verify rate limiting configured
    - Verify logging configured với sensitive data sanitization
    - Verify HTTPS enforced
    - Verify authentication/authorization working
    - Test với VNPay production credentials (small amount)
    - _Requirements: 5.1, 5.2, 13.1, 13.2, 13.6_

  - [ ] 16.4 Create monitoring và alerting setup
    - Setup metrics cho refund success/failure rates
    - Setup alerts cho high refund failure rates
    - Setup alerts cho VNPay timeout errors
    - Setup alerts cho database transaction errors
    - Setup dashboard cho refund operations monitoring
    - _Requirements: 8.1, 9.1, 9.2, 9.3_

- [ ] 17. Final checkpoint - Production ready
  - Ensure tất cả tests pass (unit, integration, E2E), documentation complete, deployment checklist ready, ask user if questions arise.

## Notes

- Tasks marked with `*` are optional và có thể skip để ship MVP nhanh hơn
- Mỗi task reference specific requirements để đảm bảo traceability
- Checkpoints đảm bảo incremental validation và cơ hội để user review/provide feedback
- Property-based tests KHÔNG có vì feature này heavily dependent on external services và infrastructure (VNPay API, database transactions)
- Testing strategy focus vào: Unit tests (90% coverage), Integration tests (critical paths), E2E tests (complete flows)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3"] },
    { "id": 6, "tasks": ["4.4", "5.1"] },
    { "id": 7, "tasks": ["4.5", "5.2", "7.1"] },
    { "id": 8, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 9, "tasks": ["7.5", "8.1"] },
    { "id": 10, "tasks": ["8.2", "8.3"] },
    { "id": 11, "tasks": ["9.1", "9.2", "9.3", "9.4"] },
    { "id": 12, "tasks": ["9.5"] },
    { "id": 13, "tasks": ["11.1"] },
    { "id": 14, "tasks": ["11.2"] },
    { "id": 15, "tasks": ["11.3"] },
    { "id": 16, "tasks": ["12.1"] },
    { "id": 17, "tasks": ["12.2", "12.3", "13.1", "13.2", "13.3", "13.4"] },
    { "id": 18, "tasks": ["15.1", "15.2", "15.3", "15.4", "15.5", "15.6", "15.7"] },
    { "id": 19, "tasks": ["15.8"] },
    { "id": 20, "tasks": ["16.1", "16.2", "16.3", "16.4"] }
  ]
}
```

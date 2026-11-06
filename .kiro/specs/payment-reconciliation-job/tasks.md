# Implementation Plan: Payment Reconciliation Job

## Overview

Kế hoạch triển khai Payment Reconciliation Job - một scheduled background service trong BrewLite API (NestJS) để tự động phát hiện và khôi phục các giao dịch thanh toán VNPay bị kẹt ở trạng thái PROCESSING. Implementation được chia thành các phases logic: database setup, core services, scheduling, monitoring, testing, và deployment.

## Tasks

- [ ] 1. Checkpoint - Xác nhận yêu cầu và thiết kế
  - Review requirements.md và design.md với team
  - Xác nhận các environment variables cần thiết
  - Xác nhận server IP cho VNPay QueryDr API signature
  - Đảm bảo tất cả stakeholders hiểu rõ scope và architecture
  - _Requirements: Tất cả_

- [ ] 2. Database Schema và Migration
  - [ ] 2.1 Tạo Prisma schema cho PaymentReconciliationLease model
    - Thêm model PaymentReconciliationLease vào `prisma/schema.prisma`
    - Định nghĩa fields: paymentId (PK), instanceId, expiresAt, createdAt, updatedAt
    - Thêm relation từ Payment model đến PaymentReconciliationLease (one-to-many)
    - Thêm index trên expiresAt để optimize cleanup query
    - Thêm ON DELETE CASCADE constraint cho paymentId foreign key
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 2.2 Tạo database migration cho PaymentReconciliationLease
    - Chạy `npx prisma migrate dev --name add_payment_reconciliation_leases`
    - Verify migration SQL tạo table với đúng columns và constraints
    - Verify index được tạo trên expiresAt
    - Verify foreign key constraint với ON DELETE CASCADE
    - _Requirements: 2.1, 2.6_

  - [ ] 2.3 Tạo index cho stuck payment query optimization
    - Thêm partial index trên payments(status, method, created_at)
    - Điều kiện WHERE: status = 'PROCESSING' AND method = 'VNPAY'
    - Tạo migration riêng: `npx prisma migrate dev --name optimize_stuck_payment_query`
    - Test query performance với EXPLAIN ANALYZE
    - _Requirements: 11.1_

- [ ] 3. Checkpoint - Verify database schema
  - Chạy migrations trên test database
  - Verify tất cả tables và indexes tồn tại
  - Kiểm tra constraints hoạt động đúng (unique, foreign key)
  - Đảm bảo không có migration conflicts

- [ ] 4. Configuration và DTOs
  - [ ] 4.1 Tạo ReconciliationJobConfig DTO với validation
    - Tạo file `src/modules/reconciliation/dto/reconciliation-config.dto.ts`
    - Định nghĩa class ReconciliationJobConfig với class-validator decorators
    - Validate các fields: enabled, scheduleExpression, recoveryWindow, batchSize, leaseTtl, maxRetries, dryRun, shutdownTimeout, serverIp
    - Thêm Min/Max constraints cho numeric fields
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 4.2 Setup ConfigModule cho reconciliation configuration
    - Thêm environment variables vào `.env.example`
    - Register ReconciliationJobConfig với ConfigModule
    - Tạo ConfigService provider để inject configuration
    - Validate configuration khi application bootstrap
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 5. LeaseService Implementation
  - [ ] 5.1 Tạo LeaseService với acquire lease logic
    - Tạo file `src/modules/reconciliation/services/lease.service.ts`
    - Implement acquireLease() method với unique constraint handling
    - Implement expired lease takeover logic
    - Generate unique instanceId từ hostname và process PID
    - Handle P2002 error (unique constraint violation) gracefully
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 5.2 Implement lease release và cleanup methods
    - Implement releaseLease() method để xóa lease sau processing
    - Implement cleanupExpiredLeases() method để cleanup leases hết hạn
    - Handle lease not found errors gracefully
    - Log lease operations cho debugging
    - _Requirements: 2.6, 2.5_

  - [ ]* 5.3 Viết unit tests cho LeaseService
    - Test acquireLease() thành công khi chưa có lease
    - Test acquireLease() fail khi lease đã tồn tại và chưa expired
    - Test acquireLease() takeover khi lease đã expired
    - Test releaseLease() xóa lease thành công
    - Test cleanupExpiredLeases() chỉ xóa leases đã expired
    - Test race condition khi multiple instances acquire lease
    - Mock PrismaService cho isolation
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 10.3_

- [ ] 6. ReconciliationService Implementation
  - [ ] 6.1 Tạo ReconciliationService với stuck payment query
    - Tạo file `src/modules/reconciliation/services/reconciliation.service.ts`
    - Implement findStuckPayments() method với WHERE clause filtering
    - Query payments: status = PROCESSING, method = VNPAY, createdAt < cutoff
    - Sort by createdAt ASC để xử lý oldest payments first
    - Apply batch size limit với TAKE clause
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 11.2_

  - [ ] 6.2 Implement retry tracking methods
    - Implement getRetryCount() method đếm PaymentRecoveryAudit records
    - Implement shouldEscalateToManualReview() check max retries
    - Filter audit records theo actorType = SYSTEM
    - _Requirements: 5.2, 5.3_

  - [ ] 6.3 Implement processPayment orchestration method
    - Implement processPayment() method với lease acquisition
    - Call LeaseService.acquireLease() trước khi processing
    - Return LEASE_FAILED nếu không acquire được lease
    - Check retry count và escalate nếu vượt max retries
    - Call PaymentsService.recoverStuckPayment() với paymentId và serverIp
    - Release lease trong finally block để đảm bảo cleanup
    - Handle errors và wrap trong try-catch
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 5.1, 5.2, 5.3_

  - [ ] 6.4 Implement outcome handling và logging
    - Implement handleOutcome() method với switch case cho outcomes
    - Log appropriate messages: success (✓), failure (✗), pending (⧗), manual review (⚠)
    - Emit metrics cho mỗi outcome type
    - Trigger alerts cho MANUAL_REVIEW cases
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 6.4_

  - [ ]* 6.5 Viết unit tests cho ReconciliationService
    - Test findStuckPayments() chỉ trả về payments đúng criteria
    - Test findStuckPayments() sắp xếp theo createdAt ascending
    - Test findStuckPayments() respect batch size limit
    - Test processPayment() handle tất cả outcomes correctly
    - Test getRetryCount() đếm audit records chính xác
    - Test shouldEscalateToManualReview() escalate đúng threshold
    - Test lease release trong finally block khi có errors
    - Mock PaymentsService, LeaseService, và PrismaService
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.1, 4.2, 4.3, 4.4, 5.2, 5.3, 10.3_

- [ ] 7. Checkpoint - Verify core services
  - Run unit tests: `npm test -- lease.service.spec.ts reconciliation.service.spec.ts`
  - Verify tất cả tests pass
  - Review code coverage (target: >80%)
  - Fix any failing tests trước khi tiếp tục

- [ ] 8. PaymentReconciliationJob Implementation
  - [ ] 8.1 Tạo PaymentReconciliationJob với @Cron decorator
    - Tạo file `src/modules/reconciliation/jobs/payment-reconciliation.job.ts`
    - Thêm @Injectable() và OnModuleDestroy interface
    - Thêm @Cron decorator với schedule expression từ config
    - Inject ReconciliationService, ConfigService, và Logger
    - Khởi tạo isRunning flag và shutdownRequested flag
    - _Requirements: 8.5_

  - [ ] 8.2 Implement main job execution flow
    - Implement runReconciliation() method với @Cron decorator
    - Check isRunning guard để prevent concurrent execution trong cùng instance
    - Skip execution nếu job disabled via config
    - Set isRunning = true khi bắt đầu, false khi kết thúc
    - Log job start và end events với timestamps
    - _Requirements: 8.6_

  - [ ] 8.3 Implement batch processing loop
    - Call ReconciliationService.findStuckPayments() để lấy stuck payments
    - Loop qua từng payment trong batch
    - Call ReconciliationService.processPayment() cho mỗi payment
    - Catch và log errors cho từng payment (don't crash entire job)
    - Track processing results: success count, failure count, etc.
    - _Requirements: 1.3, 1.4, 3.1, 3.2, 3.3, 5.1_

  - [ ] 8.4 Implement metrics emission
    - Call ReconciliationService.cleanupExpiredLeases() sau processing
    - Emit metrics: duration, payments found, processed, settled, etc.
    - Emit structured log entry với job completion metrics
    - _Requirements: 6.1, 6.2, 10.3_

  - [ ] 8.5 Implement graceful shutdown handling
    - Implement onModuleDestroy() method
    - Set shutdownRequested = true khi nhận shutdown signal
    - Wait cho currentProcessingCount = 0 trong shutdown timeout
    - Force exit nếu vượt quá shutdown timeout
    - Release all leases held by this instance
    - Log shutdown events và final status
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 8.6 Viết unit tests cho PaymentReconciliationJob
    - Test job skip execution khi isRunning = true
    - Test job skip execution khi disabled via config
    - Test job process batch payments correctly
    - Test job handle errors không crash toàn bộ job
    - Test job emit metrics after completion
    - Test graceful shutdown wait cho processing hoàn thành
    - Test graceful shutdown force exit sau timeout
    - Mock ReconciliationService và ConfigService
    - _Requirements: 8.6, 9.1, 9.2, 9.3, 9.4, 9.5, 10.3_

- [ ] 9. Dry-Run Mode Implementation
  - [ ] 9.1 Thêm dry-run support vào ReconciliationService
    - Check config.dryRun trong processPayment()
    - Log "[DRY-RUN]" prefix cho các operations
    - Skip calling PaymentsService.recoverStuckPayment() khi dry-run
    - Return mock outcome (STILL_PROCESSING) để simulate no changes
    - _Requirements: 10.1_

  - [ ]* 9.2 Viết tests cho dry-run mode
    - Test dry-run mode không gọi recoverStuckPayment()
    - Test dry-run mode log với "[DRY-RUN]" prefix
    - Test dry-run mode không update database
    - _Requirements: 10.1_

- [ ] 10. Checkpoint - Verify job execution
  - Run unit tests: `npm test -- payment-reconciliation.job.spec.ts`
  - Verify tất cả tests pass
  - Test dry-run mode locally với stuck payment trong test database
  - Review logs để đảm bảo structured logging hoạt động

- [ ] 11. Module Setup và Integration
  - [ ] 11.1 Tạo ReconciliationModule
    - Tạo file `src/modules/reconciliation/reconciliation.module.ts`
    - Import ScheduleModule.forRoot() từ @nestjs/schedule
    - Import PaymentsModule để access PaymentsService
    - Import PrismaModule để access PrismaService
    - Register providers: PaymentReconciliationJob, ReconciliationService, LeaseService
    - Export ReconciliationService cho manual triggering nếu cần
    - _Requirements: Tất cả_

  - [ ] 11.2 Register ReconciliationModule trong AppModule
    - Import ReconciliationModule vào AppModule
    - Verify module dependencies resolve correctly
    - Test application bootstrap thành công
    - _Requirements: Tất cả_

- [ ] 12. Health Check Endpoint
  - [ ] 12.1 Implement reconciliation health check
    - Tạo endpoint GET /health/reconciliation-job
    - Return status: healthy/degraded/unhealthy
    - Include lastRunTime, lastRunDuration, lastRunPaymentsProcessed
    - Include isCurrentlyRunning, config.enabled
    - Determine status based on: last run time và error rate
    - _Requirements: 10.4_

  - [ ]* 12.2 Viết integration test cho health check endpoint
    - Test health check trả về 200 status
    - Test health check response schema
    - Test healthy status khi job chạy gần đây
    - Test degraded status khi job chậm
    - Test unhealthy status khi job không chạy lâu
    - _Requirements: 10.4_

- [ ] 13. Checkpoint - Integration testing
  - Deploy lên test environment
  - Enable dry-run mode và monitor logs
  - Verify health check endpoint accessible
  - Verify no crashes hoặc errors trong logs

- [ ] 14. Integration Tests
  - [ ]* 14.1 Viết E2E test cho happy path reconciliation flow
    - Setup: Tạo stuck payment trong test database
    - Mock VNPay API response với SUCCESS
    - Trigger job execution manually
    - Assert payment settled successfully
    - Assert order status updated to PAID
    - Assert PaymentRecoveryAudit record created
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 4.1, 12.1_

  - [ ]* 14.2 Viết integration test cho distributed locking
    - Setup: Tạo stuck payment và spawn multiple job instances (simulated)
    - Execute processPayment() concurrently từ two instances
    - Assert chỉ one instance acquire lease thành công
    - Assert payment chỉ được processed once
    - Assert VNPay API chỉ được called once
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 14.3 Viết integration test cho retry exhaustion scenario
    - Setup: Tạo stuck payment với 10 audit records (max retries)
    - Trigger job execution
    - Assert payment escalated to MANUAL_REVIEW
    - Assert VNPay API không được called
    - Assert alert triggered
    - _Requirements: 5.2, 5.3, 6.3, 6.4_

  - [ ]* 14.4 Viết integration test cho lease expiration và takeover
    - Setup: Tạo stuck payment với expired lease từ crashed instance
    - Trigger job từ new instance
    - Assert new instance takeover lease thành công
    - Assert payment được processed bởi new instance
    - _Requirements: 2.5_

  - [ ]* 14.5 Viết integration test cho batch processing
    - Setup: Tạo 100 stuck payments trong test database
    - Configure batchSize = 50
    - Trigger job execution
    - Assert chỉ 50 payments được processed trong một run
    - Assert oldest payments được processed first
    - _Requirements: 1.3, 1.4, 11.2_

- [ ] 15. Monitoring và Alerting Setup
  - [ ] 15.1 Implement structured logging
    - Ensure tất cả log entries có JSON format
    - Include fields: timestamp, level, event, paymentId, outcome, duration_ms
    - Log job lifecycle events: started, completed, error
    - Log payment processing events với appropriate log levels
    - _Requirements: 6.1, 6.2, 10.2, 10.3_

  - [ ] 15.2 Implement metrics emission
    - Emit metrics vào structured logs (Phase 1)
    - Include metrics: payments_found, processed, settled_success, settled_failure, still_processing, manual_review, errors
    - Include job execution metrics: duration_ms, leases_cleaned
    - Format metrics để dễ dàng parse bởi log aggregation tools
    - _Requirements: 6.1, 6.2, 10.5_

  - [ ] 15.3 Setup alert placeholders cho Phase 2
    - Tạo AlertService interface (stub implementation)
    - Define sendManualReviewAlert() method signature
    - Define sendHighErrorRateAlert() method signature
    - Add TODO comments cho webhook integration
    - _Requirements: 6.3, 6.4_

- [ ] 16. Documentation và Configuration Guide
  - [ ] 16.1 Document environment variables trong README
    - List tất cả RECONCILIATION_* environment variables
    - Explain mỗi variable: purpose, type, default value, validation rules
    - Provide example values cho development và production
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 16.2 Tạo operational runbook
    - Document cách enable/disable job
    - Document cách monitor job health
    - Document cách manually trigger recovery cho specific payment
    - Document common troubleshooting scenarios
    - Document cách clear stuck leases sau crash
    - _Requirements: 8.6, 9.1, 9.2, 9.3, 9.4, 9.5, 10.4_

- [ ] 17. Checkpoint - Pre-production validation
  - Run tất cả tests: `npm test`
  - Verify test coverage: `npm run test:cov`
  - Deploy lên staging environment với dry-run enabled
  - Monitor logs trong 24 hours
  - Review metrics và verify no anomalies
  - Conduct load testing nếu có nhiều stuck payments

- [ ] 18. Production Deployment
  - [ ] 18.1 Deploy database migrations
    - Run migrations trên production database
    - Verify migrations applied successfully
    - Backup database trước khi migrate
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [ ] 18.2 Deploy application với job disabled
    - Set RECONCILIATION_JOB_ENABLED=false trong production env
    - Deploy application code
    - Verify application starts successfully
    - Verify health check endpoint accessible
    - _Requirements: 8.6_

  - [ ] 18.3 Enable dry-run mode trong production
    - Set RECONCILIATION_JOB_ENABLED=true
    - Set RECONCILIATION_JOB_DRY_RUN=true
    - Restart application
    - Monitor logs trong 1-2 hours
    - Verify job chạy correctly và detect stuck payments
    - _Requirements: 10.1_

  - [ ] 18.4 Enable live mode và monitor
    - Set RECONCILIATION_JOB_DRY_RUN=false
    - Restart application
    - Monitor logs real-time trong 30 minutes
    - Verify stuck payments được recovered successfully
    - Monitor metrics: success rate, error rate, manual review rate
    - Setup alerts trong monitoring system
    - _Requirements: Tất cả_

- [ ] 19. Post-deployment Validation
  - [ ] 19.1 Monitor job execution trong 48 hours
    - Check logs mỗi 4 hours
    - Verify no unexpected errors
    - Verify no manual review alerts (hoặc investigate nếu có)
    - Verify performance metrics acceptable
    - _Requirements: 6.1, 6.2, 10.3, 10.4_

  - [ ] 19.2 Conduct production smoke tests
    - Verify stuck payments được detected và recovered
    - Verify lease mechanism hoạt động (nếu có multiple instances)
    - Verify audit trail được ghi đầy đủ
    - Verify health check endpoint accurate
    - _Requirements: Tất cả_

- [ ] 20. Final Checkpoint - Feature complete
  - Tất cả requirements đã được implemented
  - Tất cả tests pass
  - Production deployment thành công
  - Monitoring và alerting hoạt động
  - Documentation đầy đủ
  - Team trained về operational procedures

## Notes

- Tasks marked với `*` là optional test tasks có thể skip cho faster MVP (nhưng highly recommended để đảm bảo quality)
- Mỗi task reference specific requirements để traceability
- Checkpoints đảm bảo incremental validation và early error detection
- Database migrations phải được tested trên staging trước khi deploy production
- Dry-run mode MUST được used trước khi enable live processing
- Integration tests SHOULD được run trên test database với VNPay sandbox environment
- Property-based testing KHÔNG applicable cho feature này (operational task, not algorithmic logic)
- Core implementation tasks (không có `*`) MUST được implemented
- Test tasks (có `*`) là optional nhưng strongly recommended

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "4.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "4.2"] },
    { "id": 2, "tasks": ["5.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "6.1", "6.2"] },
    { "id": 4, "tasks": ["6.3"] },
    { "id": 5, "tasks": ["6.4", "6.5"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "9.1"] },
    { "id": 8, "tasks": ["8.4", "8.5", "9.2"] },
    { "id": 9, "tasks": ["8.6", "11.1"] },
    { "id": 10, "tasks": ["11.2", "12.1"] },
    { "id": 11, "tasks": ["12.2", "14.1", "14.2", "14.3", "14.4", "14.5"] },
    { "id": 12, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 13, "tasks": ["16.1", "16.2"] },
    { "id": 14, "tasks": ["18.1"] },
    { "id": 15, "tasks": ["18.2"] },
    { "id": 16, "tasks": ["18.3"] },
    { "id": 17, "tasks": ["18.4", "19.1"] },
    { "id": 18, "tasks": ["19.2"] }
  ]
}
```

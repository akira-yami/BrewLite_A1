# Tài liệu Thiết kế: Payment Reconciliation Job

## Overview

Payment Reconciliation Job là một scheduled background service trong hệ thống BrewLite API (NestJS) có nhiệm vụ tự động phát hiện và khôi phục các giao dịch thanh toán VNPay bị kẹt ở trạng thái PROCESSING. Job này đảm bảo tính nhất quán dữ liệu giữa hệ thống nội bộ và cổng thanh toán VNPay bằng cách chủ động truy vấn trạng thái thực tế của các giao dịch thông qua VNPay QueryDr API và cập nhật database khi phát hiện sự khác biệt.

### Bối cảnh và Động lực

Trong quá trình thanh toán online, có những trường hợp giao dịch có thể bị kẹt ở trạng thái PROCESSING do:
- Network timeout giữa VNPay và BrewLite server
- IPN (Instant Payment Notification) callback bị mất hoặc không được xử lý
- User đóng trình duyệt trước khi return URL được gọi
- VNPay service gặp sự cố tạm thời

Những giao dịch này cần được phát hiện và khôi phục tự động để:
1. Đảm bảo order được xử lý đúng (chuyển sang PAID nếu thanh toán thành công)
2. Tránh khách hàng phải liên hệ support để xử lý thủ công
3. Đảm bảo inventory được giải phóng đúng nếu thanh toán thất bại
4. Duy trì audit trail đầy đủ cho compliance

### Mục tiêu Thiết kế

1. **Tự động hóa hoàn toàn**: Job chạy tự động theo lịch, không cần can thiệp thủ công trong trường hợp bình thường
2. **Distributed-safe**: Hỗ trợ horizontal scaling với nhiều job instances chạy đồng thời mà không xung đột
3. **Idempotent**: Chạy nhiều lần không gây side effects không mong muốn
4. **Observable**: Cung cấp metrics, logs, và alerts đầy đủ để monitoring
5. **Resilient**: Xử lý lỗi gracefully và retry một cách thông minh
6. **Configurable**: Các tham số quan trọng có thể điều chỉnh qua configuration

### Các Quyết định Thiết kế Chính

#### 1. Scheduling Approach: Cron-based với @nestjs/schedule

**Quyết định**: Sử dụng `@Cron` decorator từ `@nestjs/schedule` với interval 2-5 phút.

**Lý do**:
- Đơn giản, dễ maintain, tích hợp sẵn với NestJS
- Không cần infrastructure bổ sung (như Redis Queue, SQS)
- Phù hợp với workload: reconciliation không cần real-time, delay vài phút là chấp nhận được
- Pattern đã được sử dụng trong codebase (OrderExpiryJob)
- Graceful shutdown được NestJS xử lý tự động

**Trade-offs**:
- Không có built-in retry queue như message queue
- Mỗi instance chạy job độc lập (cần lease mechanism để coordinate)

#### 2. Lease Storage: PostgreSQL với Prisma

**Quyết định**: Sử dụng PostgreSQL table `payment_reconciliation_leases` thông qua Prisma.

**Lý do**:
- Consistency: PostgreSQL ACID guarantees đảm bảo không có race condition khi acquire lease
- Simplicity: Không cần thêm Redis dependency và maintenance overhead
- Unified storage: Tất cả data trong một database, dễ backup và disaster recovery
- Transaction support: Có thể acquire lease và update payment status trong cùng transaction nếu cần

**Trade-offs**:
- Performance: Chậm hơn Redis nhưng vẫn đủ nhanh cho use case này (vài ms per operation)
- Scalability: PostgreSQL có thể handle hàng nghìn leases/giây, đủ cho quy mô hiện tại

#### 3. Batch Processing Strategy: Sequential với Batch Loading

**Quyết định**: Load một batch payments (ví dụ: 50) từ database, xử lý tuần tự từng payment một.

**Lý do**:
- VNPay API có rate limit: sequential processing dễ kiểm soát rate
- Error handling đơn giản: một payment fail không ảnh hưởng payment khác
- Resource efficiency: Không tạo quá nhiều concurrent HTTP requests
- Predictable behavior: Dễ debug và monitor

**Cải tiến tương lai**: Có thể thêm controlled concurrency (ví dụ: 3-5 concurrent requests) nếu cần tăng throughput.

#### 4. Alerting Mechanism: Structured Logging + Webhook

**Quyết định**: Phase 1 sử dụng structured logging (JSON format), Phase 2 thêm webhook integration.

**Lý do**:
- Phase 1: Log aggregation tools (CloudWatch, Datadog) có thể parse JSON logs và tạo alerts
- Phase 2: Webhook cho phép tích hợp Slack, Discord, hoặc PagerDuty khi cần real-time alerts
- Flexibility: Admin có thể chọn monitoring tool phù hợp

#### 5. Configuration Management: Environment Variables

**Quyết định**: Sử dụng environment variables được validate bởi NestJS ConfigModule.

**Lý do**:
- 12-factor app best practice
- Dễ deploy và scale (không cần redeploy khi thay đổi config)
- Type-safe với ConfigService và validation schema

## Architecture

### Tổng quan Kiến trúc

```
┌─────────────────────────────────────────────────────────────────┐
│                      NestJS Application                         │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │         PaymentReconciliationJob                        │   │
│  │         (@Injectable + @Cron)                           │   │
│  │                                                          │   │
│  │  - Scheduled execution (every 2-5 minutes)              │   │
│  │  - Graceful shutdown handling                           │   │
│  │  - Dry-run mode support                                 │   │
│  └───┬──────────────────────────────────────────────────┬──┘   │
│      │                                                   │      │
│      ▼                                                   ▼      │
│  ┌──────────────────────────┐         ┌─────────────────────┐ │
│  │ ReconciliationService     │         │ LeaseService        │ │
│  │                           │         │                     │ │
│  │ - findStuckPayments()     │         │ - acquireLease()    │ │
│  │ - processPayment()        │         │ - releaseLease()    │ │
│  │ - handleOutcome()         │         │ - cleanupExpired()  │ │
│  └────────┬──────────────────┘         └─────────┬───────────┘ │
│           │                                      │             │
│           ▼                                      │             │
│  ┌──────────────────────────┐                   │             │
│  │ PaymentsService           │                   │             │
│  │                           │                   │             │
│  │ - recoverStuckPayment()   │◄──────────────────┘             │
│  │   (existing method)       │                                 │
│  └────────┬──────────────────┘                                 │
│           │                                                     │
│           ▼                                                     │
│  ┌──────────────────────────┐                                 │
│  │ VnpayInquiryService       │                                 │
│  │                           │                                 │
│  │ - query()                 │                                 │
│  │   (VNPay QueryDr API)     │                                 │
│  └────────┬──────────────────┘                                 │
│           │                                                     │
└───────────┼─────────────────────────────────────────────────────┘
            │
            ▼
   ┌────────────────────┐
   │   VNPay API        │
   │   (QueryDr)        │
   └────────────────────┘

Database (PostgreSQL via Prisma):
┌─────────────────────────────────────────┐
│ - payments                              │
│ - payment_recovery_audits               │
│ - payment_reconciliation_leases (NEW)   │
│ - orders                                │
└─────────────────────────────────────────┘
```

### Luồng Xử lý Chính

```
Job Execution Flow:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. @Cron trigger fires
   │
   ▼
2. Check if job is already running (isRunning guard)
   │
   ├─ YES → Skip execution (log warning)
   │
   └─ NO → Continue
      │
      ▼
3. Set isRunning = true, record startTime
   │
   ▼
4. Query stuck payments:
   WHERE status = PROCESSING
     AND method = VNPAY
     AND createdAt < (now - recoveryWindow)
   ORDER BY createdAt ASC
   LIMIT batchSize
   │
   ▼
5. For each stuck payment:
   │
   ├─ 5a. Try acquire lease (with timeout)
   │   │
   │   ├─ SUCCESS → Continue to 5b
   │   │
   │   └─ FAILED → Skip this payment (another instance processing)
   │
   ├─ 5b. Call ReconciliationService.processPayment()
   │   │
   │   ├─ Call PaymentsService.recoverStuckPayment()
   │   │   │
   │   │   ├─ Query VNPay QueryDr API
   │   │   │
   │   │   └─ Return outcome: SETTLED_SUCCESS | SETTLED_FAILURE | 
   │   │                       STILL_PROCESSING | MANUAL_REVIEW
   │   │
   │   ├─ Handle outcome (log, update audit, alert if needed)
   │   │
   │   └─ Release lease
   │
   └─ 5c. Catch and log errors (don't crash entire job)
      │
      ▼
6. Cleanup expired leases
   │
   ▼
7. Emit metrics (total processed, success, failure, manual review)
   │
   ▼
8. Set isRunning = false
   │
   ▼
9. Done (wait for next cron trigger)
```

### Payment State Machine

```
Payment Status Flow:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────┐
│  PROCESSING │ ◄── Initial state after payment initiation
└──────┬──────┘
       │
       │ Time passes (> recoveryWindow)
       ▼
  [Stuck Payment]
       │
       │ Reconciliation Job picks up
       ▼
┌─────────────────────┐
│ Query VNPay QueryDr │
└──────┬──────────────┘
       │
       ├───────────────────────────────────┐
       │                                   │
       ▼                                   ▼
  [SUCCESS]                          [DEFINITIVE_FAILURE]
       │                                   │
       ▼                                   ▼
┌─────────────┐                    ┌─────────────┐
│  SUCCEEDED  │                    │   FAILED    │
└─────────────┘                    └─────────────┘

       │                                   │
       ├───────────────────────────────────┤
       │                                   │
       ▼                                   ▼
  [PENDING/UNKNOWN]                 [MANUAL_REVIEW]
       │                                   │
       ▼                                   ▼
┌─────────────┐                    ┌──────────────────┐
│ PROCESSING  │                    │ MANUAL_REVIEW    │
│ (unchanged) │                    │ (human required) │
└─────────────┘                    └──────────────────┘
```

## Components and Interfaces

### 1. PaymentReconciliationJob

**Mục đích**: Entry point của scheduled job, orchestrate toàn bộ reconciliation process.

**Dependencies**:
- `ReconciliationService`: Business logic cho reconciliation
- `ConfigService`: Đọc configuration
- `Logger`: Structured logging

**Interface**:

```typescript
@Injectable()
export class PaymentReconciliationJob {
  private isRunning: boolean = false;
  private shutdownRequested: boolean = false;

  @Cron(CronExpression.EVERY_2_MINUTES) // Configurable
  async runReconciliation(): Promise<void>;

  onModuleDestroy(): Promise<void>; // Graceful shutdown
}
```

**Responsibilities**:
- Prevent concurrent execution trong cùng instance (isRunning guard)
- Orchestrate execution flow: query → process → cleanup
- Handle graceful shutdown (SIGTERM/SIGINT)
- Emit high-level metrics (execution time, total processed)
- Log job lifecycle events (start, end, errors)

**Configuration**:
```typescript
interface ReconciliationJobConfig {
  enabled: boolean;              // Enable/disable job
  scheduleExpression: string;    // Cron expression
  shutdownTimeout: number;       // Max wait for graceful shutdown (ms)
  dryRun: boolean;              // Dry-run mode (no DB updates)
}
```

### 2. ReconciliationService

**Mục đích**: Core business logic cho payment reconciliation.

**Dependencies**:
- `PaymentsService`: Existing service với recoverStuckPayment()
- `LeaseService`: Distributed locking
- `PrismaService`: Database access
- `MetricsService`: Emit metrics (future)
- `AlertService`: Send alerts (future)

**Interface**:

```typescript
@Injectable()
export class ReconciliationService {
  /**
   * Tìm stuck payments cần reconcile.
   * 
   * @returns Array of payment IDs to process
   */
  async findStuckPayments(params: {
    recoveryWindow: number;  // seconds
    batchSize: number;
  }): Promise<Array<{ id: string; createdAt: Date }>>;

  /**
   * Xử lý một payment: acquire lease, recover, handle outcome, release lease.
   * 
   * @returns Processing result
   */
  async processPayment(params: {
    paymentId: string;
    serverIp: string;
    dryRun: boolean;
  }): Promise<{
    outcome: 'SETTLED_SUCCESS' | 'SETTLED_FAILURE' | 'STILL_PROCESSING' | 
             'MANUAL_REVIEW' | 'LEASE_FAILED' | 'ERROR';
    error?: Error;
  }>;

  /**
   * Track retry attempts cho một payment.
   * 
   * @returns Number of previous retry attempts
   */
  async getRetryCount(paymentId: string): Promise<number>;

  /**
   * Check if payment exceeded max retry attempts.
   */
  async shouldEscalateToManualReview(paymentId: string): Promise<boolean>;
}
```

**Key Methods**:

#### findStuckPayments()

```typescript
async findStuckPayments(params: {
  recoveryWindow: number;
  batchSize: number;
}): Promise<Array<{ id: string; createdAt: Date }>> {
  const cutoffTime = new Date(Date.now() - params.recoveryWindow * 1000);
  
  return this.prisma.payment.findMany({
    where: {
      status: PaymentStatus.PROCESSING,
      method: PaymentMethod.VNPAY,
      createdAt: { lt: cutoffTime },
    },
    orderBy: { createdAt: 'asc' },
    take: params.batchSize,
    select: { id: true, createdAt: true },
  });
}
```

**Database Query**:
- Uses index on `(status, method, createdAt)` for efficient filtering
- Processes oldest payments first (FIFO)
- Batch size limits memory usage and processing time

#### processPayment()

```typescript
async processPayment(params: {
  paymentId: string;
  serverIp: string;
  dryRun: boolean;
}): Promise<ProcessingResult> {
  const { paymentId, serverIp, dryRun } = params;
  
  // 1. Acquire lease
  const leaseAcquired = await this.leaseService.acquireLease({
    paymentId,
    instanceId: this.instanceId,
    ttl: this.config.leaseTtl,
  });
  
  if (!leaseAcquired) {
    return { outcome: 'LEASE_FAILED' };
  }
  
  try {
    // 2. Check retry count
    const retryCount = await this.getRetryCount(paymentId);
    if (await this.shouldEscalateToManualReview(paymentId)) {
      await this.alertService.sendManualReviewAlert({
        paymentId,
        reason: 'MAX_RETRY_EXCEEDED',
        retryCount,
      });
      return { outcome: 'MANUAL_REVIEW' };
    }
    
    // 3. Call recovery (existing PaymentsService method)
    if (dryRun) {
      this.logger.log(`[DRY-RUN] Would recover payment ${paymentId}`);
      return { outcome: 'STILL_PROCESSING' }; // Simulate no action
    }
    
    const result = await this.paymentsService.recoverStuckPayment({
      paymentId,
      serverIp,
    });
    
    // 4. Handle outcome
    await this.handleOutcome(paymentId, result.outcome);
    
    return { outcome: result.outcome };
    
  } catch (error) {
    this.logger.error(
      `Error processing payment ${paymentId}`,
      error.stack,
    );
    return { outcome: 'ERROR', error };
    
  } finally {
    // 5. Always release lease
    await this.leaseService.releaseLease(paymentId);
  }
}
```

#### handleOutcome()

```typescript
private async handleOutcome(
  paymentId: string,
  outcome: RecoveryOutcome,
): Promise<void> {
  switch (outcome) {
    case 'SETTLED_SUCCESS':
      this.logger.log(`✓ Payment ${paymentId} settled successfully`);
      this.metrics.increment('reconciliation.settled.success');
      break;
      
    case 'SETTLED_FAILURE':
      this.logger.log(`✗ Payment ${paymentId} settled as failure`);
      this.metrics.increment('reconciliation.settled.failure');
      break;
      
    case 'STILL_PROCESSING':
      this.logger.warn(`⧗ Payment ${paymentId} still processing at VNPay`);
      this.metrics.increment('reconciliation.still_processing');
      break;
      
    case 'MANUAL_REVIEW':
      this.logger.error(`⚠ Payment ${paymentId} requires MANUAL REVIEW`);
      this.metrics.increment('reconciliation.manual_review');
      await this.alertService.sendManualReviewAlert({
        paymentId,
        reason: 'VNPAY_QUERY_INCONCLUSIVE',
      });
      break;
  }
}
```

### 3. LeaseService

**Mục đích**: Distributed locking mechanism để ngăn nhiều job instances xử lý cùng một payment.

**Interface**:

```typescript
@Injectable()
export class LeaseService {
  /**
   * Acquire lease cho một payment.
   * 
   * @returns true nếu acquire thành công, false nếu payment đang được xử lý
   */
  async acquireLease(params: {
    paymentId: string;
    instanceId: string;
    ttl: number; // seconds
  }): Promise<boolean>;

  /**
   * Release lease sau khi xử lý xong.
   */
  async releaseLease(paymentId: string): Promise<void>;

  /**
   * Cleanup các leases đã expired.
   * Chạy định kỳ để tránh leak leases khi job instance bị crash.
   */
  async cleanupExpiredLeases(): Promise<number>; // Returns số leases cleaned up
}
```

**Implementation**:

```typescript
async acquireLease(params: {
  paymentId: string;
  instanceId: string;
  ttl: number;
}): Promise<boolean> {
  const { paymentId, instanceId, ttl } = params;
  const expiresAt = new Date(Date.now() + ttl * 1000);
  
  try {
    await this.prisma.paymentReconciliationLease.create({
      data: {
        paymentId,
        instanceId,
        expiresAt,
      },
    });
    return true;
    
  } catch (error) {
    // Unique constraint violation: lease already exists
    if (error.code === 'P2002') {
      // Check if existing lease is expired
      const existingLease = await this.prisma.paymentReconciliationLease.findUnique({
        where: { paymentId },
      });
      
      if (existingLease && existingLease.expiresAt < new Date()) {
        // Expired lease: try to take over
        try {
          await this.prisma.paymentReconciliationLease.update({
            where: { 
              paymentId,
              expiresAt: { lt: new Date() }, // Ensure still expired
            },
            data: {
              instanceId,
              expiresAt,
              updatedAt: new Date(),
            },
          });
          return true;
        } catch {
          // Race condition: another instance took over
          return false;
        }
      }
      
      return false; // Lease held by another instance
    }
    
    throw error; // Unexpected error
  }
}

async releaseLease(paymentId: string): Promise<void> {
  try {
    await this.prisma.paymentReconciliationLease.delete({
      where: { paymentId },
    });
  } catch (error) {
    // Lease might already be released or never existed
    this.logger.warn(`Could not release lease for ${paymentId}`);
  }
}

async cleanupExpiredLeases(): Promise<number> {
  const result = await this.prisma.paymentReconciliationLease.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  
  return result.count;
}
```

**Lease Mechanism Flow**:

```
Acquire Lease Flow:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Instance A                          Instance B
    │                                    │
    ├─ Try INSERT lease                  │
    │  (paymentId=123, instanceId=A)     │
    │                                    │
    └─ SUCCESS → Process payment         │
         │                               │
         │                          ├─ Try INSERT lease
         │                          │  (paymentId=123, instanceId=B)
         │                          │
         │                          └─ FAIL (unique constraint)
         │                              │
         │                              └─ Check if expired
         │                                  │
         │                                  └─ NO → Skip payment
         │
         ├─ Processing...
         │
         └─ DELETE lease
             (release after done)

Time-based Takeover:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Instance A crashes with lease held
    │
    ├─ Lease expires after TTL (e.g. 2 minutes)
    │
    ▼
Instance B detects expired lease
    │
    ├─ UPDATE lease (set new instanceId, new expiresAt)
    │  WHERE paymentId = 123 AND expiresAt < NOW()
    │
    └─ SUCCESS → Take over processing
```

### 4. Configuration Service Integration

**Environment Variables**:

```bash
# Reconciliation Job Configuration
RECONCILIATION_JOB_ENABLED=true
RECONCILIATION_JOB_SCHEDULE="*/2 * * * *"  # Every 2 minutes
RECONCILIATION_JOB_RECOVERY_WINDOW=300     # 5 minutes in seconds
RECONCILIATION_JOB_BATCH_SIZE=50
RECONCILIATION_JOB_LEASE_TTL=120           # 2 minutes in seconds
RECONCILIATION_JOB_MAX_RETRIES=10
RECONCILIATION_JOB_DRY_RUN=false
RECONCILIATION_JOB_SHUTDOWN_TIMEOUT=30000  # 30 seconds in ms

# Server IP for VNPay QueryDr signature
RECONCILIATION_SERVER_IP=<server-public-ip>
```

**Configuration Schema** (with validation):

```typescript
import { IsBoolean, IsNumber, IsString, Min, Max } from 'class-validator';

export class ReconciliationJobConfig {
  @IsBoolean()
  enabled: boolean;

  @IsString()
  scheduleExpression: string; // Cron format

  @IsNumber()
  @Min(60) // At least 1 minute
  @Max(3600) // Max 1 hour
  recoveryWindow: number;

  @IsNumber()
  @Min(1)
  @Max(200)
  batchSize: number;

  @IsNumber()
  @Min(30)
  @Max(600)
  leaseTtl: number;

  @IsNumber()
  @Min(1)
  @Max(50)
  maxRetries: number;

  @IsBoolean()
  dryRun: boolean;

  @IsNumber()
  @Min(5000)
  @Max(60000)
  shutdownTimeout: number;

  @IsString()
  serverIp: string;
}
```

## Data Models

### 1. PaymentReconciliationLease (NEW)

**Mục đích**: Distributed lock để ngăn concurrent processing của cùng một payment.

**Prisma Schema**:

```prisma
model PaymentReconciliationLease {
  paymentId  String   @id @map("payment_id") @db.Uuid
  instanceId String   @map("instance_id") @db.VarChar(100)
  expiresAt  DateTime @map("expires_at") @db.Timestamptz(6)
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  payment Payment @relation(fields: [paymentId], references: [id], onDelete: Cascade)

  @@index([expiresAt])
  @@map("payment_reconciliation_leases")
}
```

**Fields**:
- `paymentId` (PK): Reference to Payment, ensures one lease per payment
- `instanceId`: Identifier của job instance đang hold lease (hostname + process ID)
- `expiresAt`: Lease expiration timestamp, indexed for efficient cleanup
- `createdAt`, `updatedAt`: Audit fields

**Indexes**:
- Primary key on `paymentId`: Enforce unique constraint
- Index on `expiresAt`: Fast cleanup query

**Lifecycle**:
- Created when job instance acquires lease
- Deleted when processing completes successfully
- Auto-deleted via cleanup job if expired (crash recovery)
- Cascade deleted if payment is deleted (ON DELETE CASCADE)

### 2. Payment (EXISTING - Modified)

**Changes**: Add relation to PaymentReconciliationLease.

```prisma
model Payment {
  // ... existing fields ...
  
  reconciliationLeases PaymentReconciliationLease[]
  
  // ... existing relations ...
}
```

### 3. PaymentRecoveryAudit (EXISTING - No changes)

Đã tồn tại và được sử dụng bởi `PaymentsService.recoverStuckPayment()` để ghi audit trail.

**Relevant fields**:
- `paymentId`: Reference to payment
- `actorType`: SYSTEM (cho automated job)
- `providerOutcome`: VNPay response status
- `beforeState`, `afterState`: Payment status transition
- `correlationId`: Track recovery attempts
- `incidentReference`: Identify manual review cases
- `details`: JSON chứa VNPay API response details

**Usage in Reconciliation**:
- Mỗi lần gọi `recoverStuckPayment()` sẽ tự động tạo audit record
- Job đọc số lượng audit records để track retry count
- Manual review cases được identify qua `incidentReference`

## Error Handling

### Phân loại Lỗi

#### 1. Transient Errors (Retry-able)

**Loại**:
- Network timeout khi gọi VNPay API
- VNPay API rate limit (429)
- Database connection timeout (transient)
- VNPay API trả về status PENDING/UNKNOWN

**Xử lý**:
- Log warning
- Không làm gì (payment vẫn ở PROCESSING)
- Để job run tiếp theo retry tự nhiên
- Không tăng retry counter (vì chưa kết luận được outcome)

#### 2. Definitive Errors (No retry)

**Loại**:
- VNPay API trả về DEFINITIVE_FAILURE
- Payment không tồn tại (data corruption)
- Payment không phải VNPAY method

**Xử lý**:
- Settle payment ngay (FAILED status)
- Ghi audit record
- Emit metrics
- Không retry

#### 3. Inconclusive Errors (Manual Review)

**Loại**:
- VNPay API trả về SUCCESS nhưng thiếu transactionNo
- VNPay API trả về status không rõ ràng
- Payment đã retry quá nhiều lần mà vẫn không kết luận được

**Xử lý**:
- Log error với severity HIGH
- Ghi audit record với incidentReference
- Trigger alert (webhook/email)
- Payment chuyển sang MANUAL_REVIEW status (nếu có)
- Human intervention required

#### 4. System Errors (Job continues)

**Loại**:
- Lỗi khi acquire/release lease
- Lỗi khi emit metrics
- Lỗi khi send alert

**Xử lý**:
- Log error
- Continue processing next payment (don't crash entire job)
- Increment error metrics

### Retry Strategy

**Automatic Retry** (via job scheduling):
- Payment vẫn ở PROCESSING sau mỗi lần job chạy nếu không settle được
- Job run tiếp theo sẽ pick up payment này lại (natural retry)
- Implicit exponential backoff: payment càng lâu càng có nhiều cơ hội được retry

**Retry Counting**:
```typescript
async getRetryCount(paymentId: string): Promise<number> {
  const count = await this.prisma.paymentRecoveryAudit.count({
    where: {
      paymentId,
      actorType: PaymentRecoveryActorType.SYSTEM,
    },
  });
  
  return count;
}

async shouldEscalateToManualReview(paymentId: string): Promise<boolean> {
  const retryCount = await this.getRetryCount(paymentId);
  return retryCount >= this.config.maxRetries;
}
```

**Max Retry Logic**:
- Track retry count qua số lượng PaymentRecoveryAudit records
- Nếu vượt quá `maxRetries` (default: 10): escalate to manual review
- Alert được gửi khi escalate

### Error Handling Flow

```
Error Handling Decision Tree:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                    [Error occurs]
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    [Transient]    [Definitive]   [Inconclusive]
         │               │               │
         ├─ Log WARN     ├─ Settle       ├─ Check retry count
         ├─ No action    │   FAILED      │   │
         └─ Retry        ├─ Audit        │   ├─ < maxRetries
             next run    └─ Metrics      │   │   │
                                         │   │   ├─ Log ERROR
                                         │   │   ├─ Audit
                                         │   │   └─ Continue
                                         │   │
                                         │   └─ >= maxRetries
                                         │       │
                                         │       ├─ Escalate MANUAL_REVIEW
                                         │       ├─ Audit
                                         │       ├─ Alert
                                         │       └─ Stop retry
                                         │
                                         └─ [System error]
                                             │
                                             ├─ Log ERROR
                                             └─ Continue (don't crash job)
```

### Graceful Shutdown

**Trigger**: SIGTERM or SIGINT signal.

**Flow**:

```typescript
@Injectable()
export class PaymentReconciliationJob implements OnModuleDestroy {
  private shutdownRequested = false;
  private currentProcessingCount = 0;

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutdown signal received, initiating graceful shutdown');
    this.shutdownRequested = true;

    // Wait for ongoing processing to complete
    const startTime = Date.now();
    const timeout = this.config.shutdownTimeout;

    while (this.currentProcessingCount > 0) {
      const elapsed = Date.now() - startTime;
      
      if (elapsed > timeout) {
        this.logger.warn(
          `Graceful shutdown timeout exceeded (${timeout}ms), ` +
          `${this.currentProcessingCount} payments still processing`
        );
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Release all leases held by this instance
    await this.leaseService.releaseAllLeasesForInstance(this.instanceId);

    this.logger.log('Graceful shutdown completed');
  }
}
```

**Shutdown Guarantees**:
- Không accept payments mới khi shutdown requested
- Cho phép payments đang xử lý hoàn thành (trong timeout)
- Force exit nếu vượt quá shutdown timeout
- Release tất cả leases để instances khác có thể take over

## Testing Strategy

### Applicability of Property-Based Testing

**Property-based testing is NOT applicable to this feature** vì:

1. **Operational Task, Not Algorithmic Logic**: Reconciliation job là một operational task chạy trên infrastructure, không phải pure function với clear input/output behavior
2. **External Dependencies**: Job phụ thuộc vào external systems (VNPay API, database, scheduling) mà không thể được modeled as properties
3. **Side-Effect Operations**: Job thực hiện side effects (database updates, API calls, alerts) mà không có universal properties để verify
4. **Configuration and Coordination**: Job behavior phụ thuộc vào configuration và coordination giữa multiple instances, không có "for all inputs X, property P(X) holds"

**Testing approach**: Sử dụng unit tests cho business logic, integration tests cho database/API interactions, và example-based tests cho key scenarios.

### Unit Tests

**1. ReconciliationService**

Test cases:
- `findStuckPayments()` chỉ trả về payments đúng criteria
- `findStuckPayments()` sắp xếp theo createdAt ascending
- `findStuckPayments()` respect batch size limit
- `processPayment()` handle tất cả outcomes correctly
- `getRetryCount()` đếm audit records chính xác
- `shouldEscalateToManualReview()` escalate đúng threshold

Mock dependencies: PaymentsService, LeaseService, PrismaService

**2. LeaseService**

Test cases:
- `acquireLease()` thành công khi chưa có lease
- `acquireLease()` fail khi lease đã tồn tại và chưa expired
- `acquireLease()` takeover khi lease đã expired
- `releaseLease()` xóa lease thành công
- `cleanupExpiredLeases()` chỉ xóa leases đã expired

Mock dependencies: PrismaService

**3. PaymentReconciliationJob**

Test cases:
- Job skip execution khi đang chạy (isRunning guard)
- Job skip execution khi disabled via config
- Job process batch payments correctly
- Job handle errors không crash toàn bộ job
- Job emit metrics after completion
- Graceful shutdown wait cho processing hoàn thành
- Graceful shutdown force exit sau timeout

Mock dependencies: ReconciliationService, ConfigService

### Integration Tests

**1. End-to-End Reconciliation Flow**

Setup:
- Test database với stuck payments
- Mock VNPay API responses
- Real LeaseService với test database

Test scenarios:
- Stuck payment SUCCEEDED at VNPay → settled successfully
- Stuck payment FAILED at VNPay → settled as failed
- Stuck payment still PENDING at VNPay → không thay đổi
- Multiple payments trong một batch → tất cả được xử lý
- Payment exceeds max retries → escalate to manual review

**2. Distributed Locking**

Setup:
- Spawn multiple job instances (simulated via parallel execution)
- Shared test database

Test scenarios:
- Two instances try process same payment → chỉ một succeed
- Instance crashes với lease held → lease expires và được cleanup
- Instance crashes → instance khác takeover sau lease expiry

**3. Database Transactions**

Test scenarios:
- Payment settlement và order update trong cùng transaction
- Rollback khi một phần transaction fail
- Concurrent update từ IPN callback và reconciliation job

### Example-Based Tests

**Example 1**: Happy path - Stuck payment recovered successfully

```typescript
describe('Stuck Payment Recovery - Happy Path', () => {
  it('should settle stuck payment when VNPay confirms success', async () => {
    // Given: Payment stuck in PROCESSING for 10 minutes
    const payment = await createStuckPayment({
      status: PaymentStatus.PROCESSING,
      method: PaymentMethod.VNPAY,
      createdAt: tenMinutesAgo(),
    });

    // And: VNPay API will confirm success
    mockVnpayApi.query.mockResolvedValue({
      status: 'SUCCESS',
      transactionNo: 'VNP123456',
      responseCode: '00',
    });

    // When: Job runs
    await job.runReconciliation();

    // Then: Payment settled successfully
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated.status).toBe(PaymentStatus.SUCCEEDED);
    expect(updated.gatewayTransactionId).toBe('VNP123456');

    // And: Order marked as paid
    const order = await prisma.order.findUnique({ where: { id: payment.orderId } });
    expect(order.status).toBe(OrderStatus.PAID);

    // And: Audit trail created
    const audit = await prisma.paymentRecoveryAudit.findFirst({
      where: { paymentId: payment.id },
    });
    expect(audit).toBeDefined();
    expect(audit.actorType).toBe(PaymentRecoveryActorType.SYSTEM);
    expect(audit.providerOutcome).toContain('SUCCESS');
  });
});
```

**Example 2**: Edge case - Concurrent processing prevented by lease

```typescript
describe('Distributed Locking', () => {
  it('should prevent concurrent processing of same payment', async () => {
    const payment = await createStuckPayment();

    // When: Two instances try to process same payment concurrently
    const [result1, result2] = await Promise.all([
      service.processPayment({ paymentId: payment.id, serverIp: '1.2.3.4', dryRun: false }),
      service.processPayment({ paymentId: payment.id, serverIp: '1.2.3.4', dryRun: false }),
    ]);

    // Then: One succeeds, one fails with LEASE_FAILED
    const outcomes = [result1.outcome, result2.outcome].sort();
    expect(outcomes).toEqual(['LEASE_FAILED', 'SETTLED_SUCCESS']);

    // And: Payment only processed once (not duplicated)
    expect(mockVnpayApi.query).toHaveBeenCalledTimes(1);
  });
});
```

**Example 3**: Error case - Max retries exceeded

```typescript
describe('Retry Exhaustion', () => {
  it('should escalate to manual review after max retries', async () => {
    const payment = await createStuckPayment();

    // Given: Payment already retried 10 times (audit records exist)
    await createAuditRecords(payment.id, 10);

    // And: Config max retries = 10
    configService.get.mockReturnValue(10);

    // When: Job attempts to process again
    const result = await service.processPayment({
      paymentId: payment.id,
      serverIp: '1.2.3.4',
      dryRun: false,
    });

    // Then: Escalated without calling VNPay
    expect(result.outcome).toBe('MANUAL_REVIEW');
    expect(mockVnpayApi.query).not.toHaveBeenCalled();

    // And: Alert sent
    expect(mockAlertService.sendManualReviewAlert).toHaveBeenCalledWith({
      paymentId: payment.id,
      reason: 'MAX_RETRY_EXCEEDED',
      retryCount: 10,
    });
  });
});
```

### Testing Strategy Summary

**Balance between test types**:
- **Unit tests**: Nhiều tests cho business logic và edge cases
- **Integration tests**: Medium số lượng cho critical flows (DB, API, locking)
- **Example-based tests**: Sufficient coverage cho main scenarios và edge cases

**No property-based testing**: 
- Reconciliation job là operational task, không phải algorithmic logic
- Input space không có "universal properties" để test
- Example-based tests đủ để cover scenarios quan trọng

## Monitoring và Alerting

### Metrics

**Job Execution Metrics**:

```typescript
// Emitted at end of each job run
interface ReconciliationJobMetrics {
  'reconciliation.job.duration_ms': number;           // Execution time
  'reconciliation.job.payments_found': number;        // Stuck payments found
  'reconciliation.job.payments_processed': number;    // Actually processed (after lease)
  'reconciliation.settled.success': number;           // Settled successfully
  'reconciliation.settled.failure': number;           // Settled as failed
  'reconciliation.still_processing': number;          // Still pending at VNPay
  'reconciliation.manual_review': number;             // Requires human intervention
  'reconciliation.lease_failed': number;              // Couldn't acquire lease
  'reconciliation.errors': number;                    // Errors during processing
  'reconciliation.leases_cleaned': number;            // Expired leases cleaned up
}
```

**Implementation** (Phase 1 - Structured Logs):

```typescript
private async emitMetrics(results: ProcessingResults): Promise<void> {
  const metrics = {
    timestamp: new Date().toISOString(),
    duration_ms: results.duration,
    payments_found: results.found,
    payments_processed: results.processed,
    settled_success: results.settledSuccess,
    settled_failure: results.settledFailure,
    still_processing: results.stillProcessing,
    manual_review: results.manualReview,
    lease_failed: results.leaseFailed,
    errors: results.errors,
    leases_cleaned: results.leasesCleaned,
  };

  this.logger.log({
    event: 'reconciliation_job_completed',
    ...metrics,
  });
}
```

**Future** (Phase 2 - Metrics Service):
- Integrate với Prometheus, StatsD, hoặc CloudWatch
- Metrics dashboard với grafana
- Alerting rules based on thresholds

### Structured Logging

**Log Format**: JSON structured logs

```typescript
interface ReconciliationLogEntry {
  timestamp: string;         // ISO 8601
  level: 'log' | 'warn' | 'error';
  event: string;             // Event type
  paymentId?: string;        // Payment being processed
  outcome?: string;          // Processing outcome
  error?: string;            // Error message
  stack?: string;            // Error stack trace
  duration_ms?: number;      // Operation duration
  metadata?: Record<string, any>;
}
```

**Example Logs**:

```json
// Job start
{
  "timestamp": "2026-01-15T10:00:00.000Z",
  "level": "log",
  "event": "reconciliation_job_started",
  "instanceId": "api-server-1-abc123",
  "config": {
    "recoveryWindow": 300,
    "batchSize": 50,
    "dryRun": false
  }
}

// Processing payment
{
  "timestamp": "2026-01-15T10:00:05.123Z",
  "level": "log",
  "event": "processing_payment",
  "paymentId": "uuid-1234",
  "orderId": "uuid-5678",
  "age_seconds": 600
}

// Success outcome
{
  "timestamp": "2026-01-15T10:00:06.456Z",
  "level": "log",
  "event": "payment_settled",
  "paymentId": "uuid-1234",
  "outcome": "SETTLED_SUCCESS",
  "duration_ms": 1333,
  "vnpayTransactionNo": "VNP123456"
}

// Manual review required
{
  "timestamp": "2026-01-15T10:00:10.789Z",
  "level": "error",
  "event": "manual_review_required",
  "paymentId": "uuid-9999",
  "reason": "MAX_RETRY_EXCEEDED",
  "retryCount": 10,
  "age_seconds": 3600
}

// Job completed
{
  "timestamp": "2026-01-15T10:01:00.000Z",
  "level": "log",
  "event": "reconciliation_job_completed",
  "duration_ms": 60000,
  "payments_found": 12,
  "payments_processed": 10,
  "settled_success": 7,
  "settled_failure": 2,
  "still_processing": 1,
  "manual_review": 0,
  "lease_failed": 2,
  "errors": 0
}
```

### Alerting

**Alert Triggers**:

1. **Manual Review Required** (HIGH priority)
   - Trigger: Payment requires manual intervention
   - Channel: Webhook → Slack/Email
   - Content: paymentId, orderId, reason, retry count, age

2. **High Error Rate** (MEDIUM priority)
   - Trigger: >20% processing errors in một job run
   - Channel: Webhook → Slack
   - Content: Error count, total processed, sample error messages

3. **Job Not Running** (HIGH priority)
   - Trigger: Không có "job_completed" log trong 10 phút
   - Monitoring: External monitoring service (CloudWatch Alarms, Datadog)
   - Channel: PagerDuty/Email

4. **Excessive Stuck Payments** (MEDIUM priority)
   - Trigger: >100 stuck payments found trong một job run
   - Channel: Webhook → Slack
   - Content: Count, oldest payment age

**Alert Service Interface** (Phase 2):

```typescript
@Injectable()
export class AlertService {
  async sendManualReviewAlert(params: {
    paymentId: string;
    reason: string;
    retryCount?: number;
  }): Promise<void>;

  async sendHighErrorRateAlert(params: {
    errorCount: number;
    totalProcessed: number;
    sampleErrors: string[];
  }): Promise<void>;

  async sendExcessiveStuckPaymentsAlert(params: {
    count: number;
    oldestAgeSeconds: number;
  }): Promise<void>;
}
```

**Implementation Options**:
- Phase 1: Log-based alerts (parse logs trong monitoring tool)
- Phase 2: Webhook integration (Slack incoming webhook, Discord webhook)
- Phase 3: Full alerting service (Twilio SMS, PagerDuty API)

### Health Check

**Endpoint**: `GET /health/reconciliation-job`

**Response**:

```typescript
interface ReconciliationJobHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastRunTime: string;              // ISO 8601
  lastRunDuration: number;          // milliseconds
  lastRunPaymentsProcessed: number;
  lastRunErrors: number;
  isCurrentlyRunning: boolean;
  config: {
    enabled: boolean;
    scheduleExpression: string;
  };
}
```

**Health Status Logic**:
- `healthy`: Last run < 10 minutes ago, errors < 10%
- `degraded`: Last run 10-30 minutes ago OR errors 10-50%
- `unhealthy`: Last run > 30 minutes ago OR errors > 50%

## Triển khai Chi tiết

### File Structure

```
apps/api/src/modules/reconciliation/
├── reconciliation.module.ts
├── jobs/
│   └── payment-reconciliation.job.ts
├── services/
│   ├── reconciliation.service.ts
│   ├── lease.service.ts
│   └── alert.service.ts (Phase 2)
├── dto/
│   └── reconciliation-config.dto.ts
└── __tests__/
    ├── reconciliation.service.spec.ts
    ├── lease.service.spec.ts
    ├── payment-reconciliation.job.spec.ts
    └── reconciliation.e2e.spec.ts
```

### Module Definition

```typescript
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentReconciliationJob } from './jobs/payment-reconciliation.job';
import { ReconciliationService } from './services/reconciliation.service';
import { LeaseService } from './services/lease.service';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PaymentsModule,
    PrismaModule,
  ],
  providers: [
    PaymentReconciliationJob,
    ReconciliationService,
    LeaseService,
  ],
  exports: [ReconciliationService], // For manual triggering if needed
})
export class ReconciliationModule {}
```

### Database Migration

**Migration File**: `prisma/migrations/YYYYMMDDHHMMSS_add_payment_reconciliation_leases/migration.sql`

```sql
-- Create payment_reconciliation_leases table
CREATE TABLE payment_reconciliation_leases (
  payment_id UUID PRIMARY KEY,
  instance_id VARCHAR(100) NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_payment_reconciliation_leases_payment
    FOREIGN KEY (payment_id)
    REFERENCES payments(id)
    ON DELETE CASCADE
);

-- Index for efficient cleanup query
CREATE INDEX idx_payment_reconciliation_leases_expires_at
  ON payment_reconciliation_leases(expires_at);

-- Add relation field to payments table (Prisma will handle this)
-- No schema change needed, just Prisma relation

-- Add index on payments table for efficient stuck payment query
CREATE INDEX IF NOT EXISTS idx_payments_reconciliation
  ON payments(status, method, created_at)
  WHERE status = 'PROCESSING' AND method = 'VNPAY';

-- Add comment for documentation
COMMENT ON TABLE payment_reconciliation_leases IS 
  'Distributed locks for payment reconciliation job to prevent concurrent processing';
```

### Instance ID Generation

```typescript
import * as os from 'os';

@Injectable()
export class ReconciliationService {
  private readonly instanceId: string;

  constructor() {
    // Generate unique instance ID: hostname + process PID
    const hostname = os.hostname();
    const pid = process.pid;
    this.instanceId = `${hostname}-${pid}`;
  }
}
```

### Server IP Configuration

**Options**:

1. **Environment Variable** (Manual configuration):
   ```bash
   RECONCILIATION_SERVER_IP=203.0.113.42
   ```

2. **Auto-detection** (Runtime):
   ```typescript
   import { publicIpv4 } from 'public-ip';
   
   async getServerIp(): Promise<string> {
     if (this.config.serverIp) {
       return this.config.serverIp; // Use configured IP
     }
     
     try {
       return await publicIpv4(); // Auto-detect public IP
     } catch (error) {
       throw new Error('Cannot determine server IP for VNPay QueryDr');
     }
   }
   ```

**Recommendation**: Use environment variable cho production (stable IP), auto-detect cho development.

### Deployment Considerations

#### Single Instance Deployment

- Simplest setup
- No lease contention
- Lease mechanism vẫn cần thiết (crash recovery)

#### Multi-Instance Deployment (Horizontal Scaling)

**Benefits**:
- High availability: Nếu một instance down, instances khác vẫn chạy
- Load distribution: Nhiều payments được xử lý song song (via lease mechanism)

**Configuration**:
- Mỗi instance có unique `instanceId`
- Shared PostgreSQL database
- Cùng schedule expression → natural load balancing

**Lease Behavior**:
- Instance A picks payment 1, 2, 3
- Instance B picks payment 4, 5, 6
- Nếu payment đã có lease, instance skip sang payment tiếp theo

**Example**: 3 instances, 100 stuck payments, batch size 50
- Total processing rate: ~150 payments per job cycle (overlap minimal)
- Actual depends on lease contention, typically 80-120 payments

#### Kubernetes Deployment

**Deployment YAML**:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: brewlite-api
spec:
  replicas: 3  # Multiple instances
  template:
    spec:
      containers:
      - name: api
        image: brewlite/api:latest
        env:
        - name: RECONCILIATION_JOB_ENABLED
          value: "true"
        - name: RECONCILIATION_JOB_SCHEDULE
          value: "*/2 * * * *"
        - name: RECONCILIATION_SERVER_IP
          value: "203.0.113.42"  # Load balancer IP
        # ... other env vars
```

**Notes**:
- All replicas run job simultaneously
- Lease mechanism prevents duplicate processing
- Graceful shutdown handled by Kubernetes termination grace period

## Appendix

### Configuration Reference

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RECONCILIATION_JOB_ENABLED` | boolean | `true` | Enable/disable job |
| `RECONCILIATION_JOB_SCHEDULE` | string | `"*/2 * * * *"` | Cron expression (every 2 minutes) |
| `RECONCILIATION_JOB_RECOVERY_WINDOW` | number | `300` | Seconds before payment considered stuck |
| `RECONCILIATION_JOB_BATCH_SIZE` | number | `50` | Max payments per job run |
| `RECONCILIATION_JOB_LEASE_TTL` | number | `120` | Lease expiration (seconds) |
| `RECONCILIATION_JOB_MAX_RETRIES` | number | `10` | Max retry attempts before manual review |
| `RECONCILIATION_JOB_DRY_RUN` | boolean | `false` | Dry-run mode (no DB updates) |
| `RECONCILIATION_JOB_SHUTDOWN_TIMEOUT` | number | `30000` | Graceful shutdown timeout (ms) |
| `RECONCILIATION_SERVER_IP` | string | - | Server IP for VNPay signature |

### Metrics Dashboard (Example Queries)

**Prometheus Queries**:

```promql
# Success rate
sum(rate(reconciliation_settled_success[5m])) 
/ 
sum(rate(reconciliation_payments_processed[5m]))

# Error rate
sum(rate(reconciliation_errors[5m]))
/
sum(rate(reconciliation_payments_processed[5m]))

# Manual review rate
sum(rate(reconciliation_manual_review[5m]))

# Average job duration
avg(reconciliation_job_duration_ms)

# Stuck payments backlog
reconciliation_job_payments_found - reconciliation_job_payments_processed
```

### Common Operational Scenarios

#### Scenario 1: Disable Job Temporarily

```bash
# Set environment variable
export RECONCILIATION_JOB_ENABLED=false

# Restart application
# Job will not run until re-enabled
```

#### Scenario 2: Process Specific Payment Manually

```typescript
// Via NestJS CLI or Admin API
async function manualRecovery(paymentId: string) {
  const service = app.get(ReconciliationService);
  
  const result = await service.processPayment({
    paymentId,
    serverIp: await service.getServerIp(),
    dryRun: false,
  });
  
  console.log('Recovery result:', result);
}
```

#### Scenario 3: Clear Stuck Leases After Crash

```sql
-- Find expired leases
SELECT payment_id, instance_id, expires_at
FROM payment_reconciliation_leases
WHERE expires_at < NOW();

-- Delete manually (or wait for cleanup job)
DELETE FROM payment_reconciliation_leases
WHERE expires_at < NOW();
```

#### Scenario 4: Monitor Job Health

```bash
# Check last run status
curl https://api.brewlite.com/health/reconciliation-job

# Query logs for recent runs
# (Example: CloudWatch Logs Insights)
fields @timestamp, event, payments_processed, errors
| filter event = "reconciliation_job_completed"
| sort @timestamp desc
| limit 10
```

### Performance Tuning

**If job runs too slow**:
- Increase `batchSize` (test DB performance first)
- Add database read replicas for queries
- Reduce `leaseTtl` để faster takeover nếu instance chậm

**If VNPay rate limit hit**:
- Decrease `batchSize`
- Increase job interval (run less frequently)
- Add delay between VNPay API calls

**If too many stuck payments**:
- Investigate root cause (IPN callback issues?)
- Temporarily increase job frequency
- Scale horizontally (more instances)

### Security Considerations

1. **Server IP Validation**: Ensure `RECONCILIATION_SERVER_IP` matches server's actual public IP để VNPay signature hợp lệ

2. **Database Access**: Job chỉ cần access payments, payment_recovery_audits, và leases tables

3. **Audit Compliance**: Tất cả recovery attempts được ghi vào PaymentRecoveryAudit với full details

4. **Secrets Management**: VNPay credentials quản lý qua environment variables, không hardcode

### Future Enhancements

**Phase 2**:
- [ ] Webhook alerting cho manual review cases
- [ ] Metrics service integration (Prometheus/StatsD)
- [ ] Admin dashboard để monitor job status
- [ ] Configurable concurrency (parallel processing)

**Phase 3**:
- [ ] ML-based anomaly detection (detect patterns in stuck payments)
- [ ] Auto-escalation workflow (notify appropriate team based on failure type)
- [ ] Reconciliation reports (daily summary, trends)
- [ ] A/B testing support (compare reconciliation strategies)

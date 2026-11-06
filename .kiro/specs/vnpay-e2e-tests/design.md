# Tài Liệu Thiết Kế: Bộ Kiểm Thử E2E VNPAY

## Overview

Tài liệu này trình bày kiến trúc kỹ thuật cho bộ kiểm thử end-to-end (E2E) xác thực tích hợp thanh toán QR VNPAY với môi trường Sandbox thực tế. Bộ kiểm thử sử dụng Playwright để tự động hóa toàn bộ luồng thanh toán từ frontend đến backend, đồng thời xử lý các thách thức kỹ thuật đặc thù như mô phỏng IPN callback, quản lý credentials an toàn, và đảm bảo test isolation.

### Mục Tiêu Thiết Kế

- **Độ bao phủ toàn diện**: Xác thực tất cả 16 requirements từ luồng thành công đến edge cases
- **Tích hợp thật**: Gọi VNPAY Sandbox thực tế để phát hiện lỗi signature và configuration
- **CI/CD ready**: Chạy ổn định trong GitHub Actions với secrets management
- **Test isolation**: Các test chạy song song không gây xung đột
- **Maintainability**: Code tổ chức rõ ràng, dễ mở rộng và debug

### Phạm Vi Hệ Thống

**In-scope**:
- Playwright E2E tests gọi VNPAY Sandbox
- Test-only API endpoints để mô phỏng IPN callbacks
- Test helpers và fixtures để giảm code duplication
- Environment variables management cho credentials
- GitHub Actions workflow configuration

**Out-of-scope**:
- Thay đổi production code (trừ test-only endpoints)
- Testing với VNPAY production environment
- Performance testing (chỉ functional correctness)
- Load testing với nhiều concurrent payments

## Architecture

### Component Diagram

```mermaid
graph TB
    subgraph "Test Suite"
        PT[Playwright Tests]
        TH[Test Helpers]
        TF[Test Fixtures]
    end
    
    subgraph "BrewLite Application"
        WEB[Next.js Frontend<br/>Port 3100]
        API[NestJS API<br/>Port 3101]
        DB[(Test Database)]
    end
    
    subgraph "VNPAY Sandbox"
        VNP_API[VNPAY Payment API<br/>sandbox.vnpayment.vn]
        VNP_IPN[IPN Callback Endpoint]
    end
    
    subgraph "Test Infrastructure"
        ENV[.env.test]
        SECRETS[GitHub Actions Secrets]
    end
    
    PT --> TH
    PT --> TF
    PT --> WEB
    PT --> API
    WEB --> API
    API --> DB
    API --> VNP_API
    VNP_IPN -.Giả lập thông qua<br/>test endpoint.-> API
    ENV --> PT
    SECRETS --> PT
    
    style PT fill:#e1f5ff
    style VNP_API fill:#fff4e1
    style API fill:#f0f0f0
```

### Integration Architecture

Bộ kiểm thử tích hợp 4 thành phần chính:

1. **Playwright Test Runner**: Orchestrator điều khiển toàn bộ test flow
2. **BrewLite Application**: Web + API servers chạy trên ports riêng biệt (3100/3101)
3. **VNPAY Sandbox**: Payment gateway thật để generate URLs và validate signatures
4. **Test Infrastructure**: Helpers, fixtures, và test-only endpoints

**Key Design Decisions**:
- Test servers chạy isolated ports (không conflict với dev servers)
- Test-only IPN endpoint thay vì dùng ngrok/localtunnel
- Sequential test execution để tránh database race conditions
- No test cleanup để preserve audit trail

### Data Flow: Luồng Thanh Toán Thành Công

```mermaid
sequenceDiagram
    participant Test as Playwright Test
    participant Web as Next.js Frontend
    participant API as NestJS Backend
    participant DB as Database
    participant VNPAY as VNPAY Sandbox
    participant IPN as Test IPN Simulator
    
    Test->>API: POST /auth/register (tạo user e2e_xxx)
    API-->>Test: accessToken
    Test->>Web: Navigate to /menu với token
    Test->>Web: Add product to cart
    Test->>Web: Proceed to checkout
    Test->>API: POST /payments (method=VNPAY)
    API->>DB: Create Payment (status=PROCESSING)
    API->>VNPAY: Generate payment URL with signature
    VNPAY-->>API: Payment URL với QR code
    API-->>Test: {status: PROCESSING, paymentUrl}
    
    Note over Test: Test mô phỏng thanh toán thành công
    Test->>IPN: POST /test/vnpay/simulate-ipn (với signed params)
    IPN->>API: Trigger internal IPN handler
    API->>DB: Verify payment exists và PROCESSING
    API->>DB: Update Payment (status=SUCCEEDED)
    API->>DB: Update Order (status=PAID)
    API-->>IPN: {RspCode: '00', Message: 'Confirm Success'}
    
    Test->>API: Poll GET /payments/status
    API-->>Test: {status: SUCCEEDED}
    Test->>Web: Verify redirect to /orders/confirmation
    Test->>API: GET /orders/:orderId
    API-->>Test: Verify order status=PAID
```

## Components and Interfaces

### Test Suite Components

#### 1. Playwright Tests
**Location**: `apps/web/tests/e2e/vnpay/*.spec.ts`

**Responsibilities**:
- Execute user journeys through browser automation
- Call API endpoints với proper authentication
- Verify UI states và assertions
- Capture traces/screenshots on failures

**Key Interfaces**:
```typescript
interface VnpayTestContext {
  page: Page;
  request: APIRequestContext;
  testUser: TestUser;
  vnpayHelper: VnpayTestHelper;
  apiUrl: string;
}
```

#### 2. Test Helpers
**Location**: `apps/web/tests/e2e/helpers/*.ts`

**VnpayTestHelper**:
```typescript
class VnpayTestHelper {
  computeSignature(params: Record<string, string>): string;
  simulateIpn(request: APIRequestContext, params: VnpayIpnParams): Promise<IpnResponse>;
  verifyPaymentUrl(paymentUrl: string): boolean;
}
```

**AuthHelper**:
```typescript
async function createTestUser(
  request: APIRequestContext,
  apiUrl: string,
  prefix?: string
): Promise<TestUser>;
```

**CartHelper**:
```typescript
async function setupCartWithProduct(page: Page, accessToken: string): Promise<void>;
async function proceedToCheckout(page: Page): Promise<void>;
```

**AssertionHelper**:
```typescript
async function assertCountdownVisible(page: Page, state: CountdownState): Promise<void>;
async function assertPaymentStatus(orderId: string, status: OrderStatus, apiUrl: string, token: string): Promise<void>;
```

#### 3. Test Fixtures
**Location**: `apps/web/tests/e2e/fixtures/vnpay-fixtures.ts`

**Fixtures Interface**:
```typescript
interface VnpayFixtures {
  vnpayHelper: VnpayTestHelper;
  testUser: TestUser;
  apiUrl: string;
}

export const test = base.extend<VnpayFixtures>({ ... });
```

#### 4. Test-Only API Endpoint
**Location**: `apps/api/src/modules/payments/controllers/payments.controller.ts`

**Endpoint**: `POST /payments/test/vnpay/simulate-ipn`

**Purpose**: Cho phép test mô phỏng IPN callback từ VNPAY mà không cần public-accessible URL

**Request Interface**:
```typescript
interface VnpayIpnQuery {
  vnp_TxnRef: string;
  vnp_Amount: string;
  vnp_TmnCode: string;
  vnp_ResponseCode: string;
  vnp_TransactionStatus: string;
  vnp_TransactionNo: string;
  vnp_BankCode: string;
  vnp_PayDate: string;
  vnp_OrderInfo: string;
  vnp_SecureHash: string;
  // ... other VNPAY fields
}
```

**Response Interface**:
```typescript
interface VnpayIpnResponse {
  RspCode: string; // '00' = success, '97' = invalid signature, etc.
  Message: string;
}
```

**Security**:
- Only available when `NODE_ENV=test`
- Throws `403 Forbidden` in production
- Uses same IPN handler logic as production endpoint

### External Interfaces

#### VNPAY Sandbox API

**Payment URL Generation**:
```typescript
// Request: POST /payments với method=VNPAY
interface CreatePaymentRequest {
  orderId: string;
  method: 'VNPAY';
}

// Response includes VNPAY-generated URL
interface CreatePaymentResponse {
  status: 'PROCESSING';
  paymentUrl: string; // https://sandbox.vnpayment.vn/...
  gatewayReference: string; // UUID
  orderId: string;
  amount: bigint;
}
```

**Payment Inquiry** (cho recovery scenarios):
```typescript
interface VnpayInquiryRequest {
  gatewayReference: string;
  amount: bigint;
  transactionDate: string; // yyyyMMddHHmmss
  orderInfo: string;
}

interface VnpayInquiryResponse {
  status: 'SUCCESS' | 'DEFINITIVE_FAILURE' | 'PENDING' | 'MANUAL_REVIEW';
  transactionNo: string | null;
  responseCode: string;
}
```

## Data Models

### Test Data Models

#### TestUser
```typescript
interface TestUser {
  username: string;      // e.g., "e2e_vnpay_a1b2c3d4e5f6"
  password: string;      // e.g., "E2e-vnpay-password-123"
  accessToken: string;   // JWT token from /auth/register
  userId: string;        // UUID from registration
}
```

**Generation Strategy**:
- Username: `e2e_vnpay_${randomUUID().replaceAll('-', '').slice(0, 16)}`
- Password: Fixed string cho simplicity
- Created mới cho mỗi test case
- Không cleanup sau test (audit trail)

#### VnpayIpnParams
```typescript
interface VnpayIpnParams {
  gatewayReference: string;    // từ payment creation response
  amount: bigint;              // order total
  responseCode: string;        // '00' = success, '07' = suspicious, etc.
  transactionStatus: string;   // '00' = success, '02' = failed
  transactionNo?: string;      // Optional, generated if not provided
  tmnCode?: string;            // Defaults to env var
}
```

**Usage trong Test**:
```typescript
// Simulate success
await vnpayHelper.simulateIpn(request, {
  gatewayReference: payment.gatewayReference,
  amount: payment.amount,
  responseCode: '00',
  transactionStatus: '00',
});

// Simulate failure
await vnpayHelper.simulateIpn(request, {
  gatewayReference: payment.gatewayReference,
  amount: payment.amount,
  responseCode: '07',
  transactionStatus: '02',
});
```

### Application Data Models

#### Payment (Prisma Model)
```typescript
model Payment {
  id                  String         @id @default(uuid())
  idempotencyKey      String         @unique
  orderId             String
  userId              String
  method              PaymentMethod  // VNPAY, E_WALLET, CARD, etc.
  amount              BigInt
  status              PaymentStatus  // PROCESSING, SUCCEEDED, FAILED
  gatewayReference    String?        // vnp_TxnRef
  gatewayTransactionId String?       // vnp_TransactionNo
  errorCode           String?
  isRetried           Boolean        @default(false)
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt
  
  order               Order          @relation(...)
}
```

**Test Data Flow**:
1. POST /payments creates Payment với `status=PROCESSING`
2. IPN callback updates `status=SUCCEEDED`, sets `gatewayTransactionId`
3. Order status updated to `PAID`

#### Order (Prisma Model)
```typescript
model Order {
  id                     String      @id @default(uuid())
  userId                 String
  status                 OrderStatus // PENDING, PAID, CANCELLED
  total                  BigInt
  reservationExpiresAt   DateTime    // 10 minutes from creation
  createdAt              DateTime    @default(now())
  
  items                  OrderItem[]
  payments               Payment[]
}
```

**Test Scenarios**:
- Success: Order status `PENDING` → `PAID` khi payment succeeds
- Timeout: Order vẫn `PENDING` sau `reservationExpiresAt`
- Recovery: Manual inquiry updates Order nếu payment delayed

### Environment Configuration Model

```typescript
interface VnpayTestConfig {
  // VNPAY Credentials
  VNPAY_ENABLED: boolean;
  VNPAY_TMN_CODE: string;          // Merchant code
  VNPAY_HASH_SECRET: string;       // 32-char secret key
  VNPAY_PAYMENT_URL: string;       // Sandbox payment endpoint
  VNPAY_QUERY_URL: string;         // Sandbox inquiry endpoint
  VNPAY_RETURN_URL: string;        // Browser return URL
  VNPAY_IPN_URL: string;           // IPN callback URL (unused in tests)
  
  // Test Environment
  NODE_ENV: 'test';
  E2E_API_URL: string;             // http://localhost:3101/api/v1
  E2E_WEB_PORT: number;            // 3100
  E2E_API_PORT: number;            // 3101
  DATABASE_URL: string;            // Test database connection
}
```

**Loading Strategy**:
```typescript
// Local: từ .env.test file
dotenv.config({ path: '.env.test' });

// CI/CD: từ GitHub Actions secrets
// Injected qua environment variables trong workflow
```

## Giải Pháp Cho Các Thách Thức Kỹ Thuật

### 1. Chiến Lược Mô Phỏng IPN Callback

#### Vấn Đề
VNPAY Sandbox không thể gửi IPN callback tới `http://localhost:3101` vì:
- Localhost không publicly accessible từ Internet
- VNPAY yêu cầu HTTPS URL cho IPN endpoint
- Không thể test IPN callback logic với VNPAY thật

#### Giải Pháp: Test-Only IPN Simulation Endpoint

**Quyết định kiến trúc**: Tạo endpoint `/test/vnpay/simulate-ipn` chỉ available trong test environment

**Rationale**:
- ✅ **Security**: Endpoint chỉ active khi `NODE_ENV=test`, không expose trong production
- ✅ **Realism**: Sử dụng chính logic IPN handler thật (`handleVnpayIpn`), đảm bảo test đúng behavior
- ✅ **CI/CD simplicity**: Không cần ngrok/localtunnel, test chạy offline
- ✅ **Deterministic**: Test control được timing của IPN callback
- ❌ **Trade-off**: Không test được network path từ VNPAY → server (nhưng đây là VNPAY's responsibility)

**Implementation Plan**:

```typescript
// apps/api/src/modules/payments/controllers/payments.controller.ts

@Post('test/vnpay/simulate-ipn')
@HttpCode(HttpStatus.OK)
async testSimulateVnpayIpn(@Query() query: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'test') {
    throw new ForbiddenException('This endpoint is only available in test environment');
  }
  // Gọi chính logic IPN handler production
  return this.paymentsService.handleVnpayIpn(query);
}
```

**Security Considerations**:
- Endpoint protected bởi environment check
- Test phải tự generate signed parameters giống VNPAY
- Không bypass signature verification (test đúng end-to-end security)

### 2. VNPAY Sandbox Integration Architecture

#### Payment URL Generation (Tích hợp thật)

Test sẽ gọi API endpoint `POST /payments` với `method=VNPAY` để nhận payment URL thật từ VNPAY Sandbox:

```typescript
// Test flow
const response = await request.post(`${api}/payments`, {
  data: { orderId, method: 'VNPAY' },
  headers: { 
    'Authorization': `Bearer ${accessToken}`,
    'Idempotency-Key': idempotencyKey 
  }
});
const { paymentUrl, gatewayReference } = response.data;
```

**Các điểm xác thực**:
- ✓ Payment URL phải bắt đầu với `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`
- ✓ Query params phải chứa `vnp_TmnCode`, `vnp_Amount`, `vnp_SecureHash`
- ✓ Signature phải được tính đúng theo HMACSHA512
- ✓ `vnp_ReturnUrl` phải trỏ về application

#### IPN Callback Simulation (Test-only)

Test sẽ gọi test endpoint với signed parameters giả lập VNPAY response:

```typescript
// Test helper: simulateVnpayIpn()
const ipnParams = {
  vnp_TxnRef: gatewayReference,
  vnp_Amount: (amount * 100n).toString(),
  vnp_ResponseCode: '00', // Success
  vnp_TransactionStatus: '00',
  vnp_TransactionNo: 'VNPAY_' + Date.now(),
  // ... other required fields
};
const signature = computeVnpaySignature(ipnParams, VNPAY_HASH_SECRET);
ipnParams.vnp_SecureHash = signature;

await request.post(`${api}/payments/test/vnpay/simulate-ipn`, {
  params: ipnParams
});
```

### 3. Test Isolation & Idempotency Strategy

#### Database Strategy: Shared DB với UUID Isolation

**Quyết định kiến trúc**: Sử dụng chung một test database, rely on UUID uniqueness để tránh conflicts

**Rationale**:
- ✅ **Simplicity**: Không cần setup/teardown complex database per test
- ✅ **Speed**: Tránh overhead của database recreation
- ✅ **Audit trail**: Giữ lại toàn bộ test data để investigation
- ✅ **Real-world**: Test trên database state giống production (có nhiều records)

**Isolation Mechanisms**:

1. **Username Uniqueness**:
```typescript
const username = `e2e_vnpay_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
```

2. **Idempotency Key Uniqueness**:
```typescript
const idempotencyKey = randomUUID(); // Full UUID format
```

3. **Sequential Execution**:
```typescript
// playwright.config.ts
export default defineConfig({
  workers: 1, // Force sequential execution
  // Ngăn race conditions trong shared database
});
```

#### No Cleanup Policy

**Quyết định**: Test data không bị xóa sau khi chạy

**Benefits**:
- Audit trail cho compliance và debugging
- Không risk xóa nhầm production data
- Simplify test logic (no teardown phase)
- Test database có thể grow tự nhiên mà không ảnh hưởng performance

**Database Growth Management**:
- Test database periodically reset manually (không phải mỗi lần chạy test)
- Use separate test database, never share với dev/prod

### 4. Credentials Management Strategy

#### Environment Variables Structure

**File: `.env.test`** (gitignored):
```bash
# VNPAY Sandbox Credentials
VNPAY_ENABLED=true
VNPAY_TMN_CODE=QEZXV06S
VNPAY_HASH_SECRET=<32-character-secret>
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_QUERY_URL=https://sandbox.vnpayment.vn/merchant_webapi/api/transaction
VNPAY_RETURN_URL=https://your-tunnel-url.ngrok.io/api/v1/payments/vnpay/return
VNPAY_IPN_URL=https://your-tunnel-url.ngrok.io/api/v1/payments/vnpay/ipn

# Test-specific overrides
NODE_ENV=test
E2E_API_URL=http://localhost:3101/api/v1
E2E_WEB_PORT=3100
E2E_API_PORT=3101
```

**File: `.env.test.example`** (committed):
```bash
# Copy this to .env.test and fill in real values

VNPAY_ENABLED=true
VNPAY_TMN_CODE=QEZXV06S
VNPAY_HASH_SECRET=your_32_char_hash_secret_from_vnpay
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_QUERY_URL=https://sandbox.vnpayment.vn/merchant_webapi/api/transaction
VNPAY_RETURN_URL=http://localhost:3101/api/v1/payments/vnpay/return
VNPAY_IPN_URL=http://localhost:3101/api/v1/payments/vnpay/ipn

NODE_ENV=test
E2E_API_URL=http://localhost:3101/api/v1
E2E_WEB_PORT=3100
E2E_API_PORT=3101
```

#### CI/CD Secrets Configuration

**GitHub Actions Secrets** (Repository → Settings → Secrets):
- `VNPAY_TMN_CODE_SANDBOX`: `QEZXV06S`
- `VNPAY_HASH_SECRET_SANDBOX`: `<secret from VNPAY>`

**GitHub Actions Workflow**:
```yaml
# .github/workflows/vnpay-e2e.yml
name: VNPAY E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      VNPAY_ENABLED: true
      VNPAY_TMN_CODE: ${{ secrets.VNPAY_TMN_CODE_SANDBOX }}
      VNPAY_HASH_SECRET: ${{ secrets.VNPAY_HASH_SECRET_SANDBOX }}
      VNPAY_PAYMENT_URL: https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
      VNPAY_QUERY_URL: https://sandbox.vnpayment.vn/merchant_webapi/api/transaction
      VNPAY_RETURN_URL: http://localhost:3101/api/v1/payments/vnpay/return
      VNPAY_IPN_URL: http://localhost:3101/api/v1/payments/vnpay/ipn
      NODE_ENV: test
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/brewlite_test

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: brewlite_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run database migrations
        run: npm --prefix apps/api run prisma:migrate:deploy
      
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      
      - name: Run VNPAY E2E tests
        run: npm --prefix apps/web run test:e2e:vnpay
      
      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: apps/web/playwright-report/
          retention-days: 7
```

#### Validation Logic

Test suite sẽ validate credentials trước khi chạy:

```typescript
// tests/e2e/helpers/vnpay-env-validator.ts
export function validateVnpayEnv() {
  const required = {
    VNPAY_TMN_CODE: process.env.VNPAY_TMN_CODE,
    VNPAY_HASH_SECRET: process.env.VNPAY_HASH_SECRET,
  };
  
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required VNPAY credentials: ${missing.join(', ')}.\n` +
      `Copy .env.test.example to .env.test and fill in values from VNPAY Sandbox.`
    );
  }
  
  if (required.VNPAY_HASH_SECRET!.length !== 32) {
    throw new Error('VNPAY_HASH_SECRET must be exactly 32 characters');
  }
}
```

### 5. Error Handling & Debugging Strategy

#### Error Classification

Test suite phân biệt 3 loại lỗi:

1. **VNPAY Infrastructure Error**: Sandbox không khả dụng
   - Detection: HTTP timeout hoặc 5xx từ VNPAY
   - Handling: Skip test với warning (không fail CI)
   - Message: "VNPAY Sandbox không khả dụng, bỏ qua test"

2. **Application Bug**: Logic lỗi trong BrewLite code
   - Detection: Assertion failures, wrong status, missing data
   - Handling: Fail test với chi tiết đầy đủ
   - Message: "Lỗi ứng dụng: [chi tiết]"

3. **Test Infrastructure Error**: Configuration sai, credentials thiếu
   - Detection: Validation failures trước khi chạy test
   - Handling: Fail fast với hướng dẫn fix
   - Message: "Lỗi cấu hình test: [hướng dẫn]"

#### Debugging Artifacts

Playwright tự động capture khi test fail:

- **Screenshots**: Trạng thái UI tại thời điểm fail
- **Video**: Recording toàn bộ test run (optional)
- **Network trace**: API requests/responses
- **Console logs**: Frontend console.log/error

Configuration:
```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

## Thiết Kế Chi Tiết Các Components

### Test Structure & Organization

#### File Structure

```
apps/web/tests/e2e/
├── vnpay/
│   ├── vnpay-happy-path.spec.ts          # Req 1: Success flow
│   ├── vnpay-timeout-recovery.spec.ts    # Req 2: Timeout & recovery
│   ├── vnpay-ipn-race.spec.ts            # Req 3: IPN arrives first
│   ├── vnpay-network-loss.spec.ts        # Req 4: Network disconnection
│   ├── vnpay-signature.spec.ts           # Req 5: Signature validation
│   ├── vnpay-idempotency.spec.ts         # Req 6: Retry safety
│   ├── vnpay-double-click.spec.ts        # Req 11: Double click protection
│   └── vnpay-error-messages.spec.ts      # Req 14: Vietnamese error messages
├── helpers/
│   ├── vnpay-test-helper.ts              # VNPAY-specific utilities
│   ├── auth-helper.ts                    # User registration
│   ├── cart-helper.ts                    # Cart setup
│   └── assertion-helper.ts               # Custom assertions
└── fixtures/
    └── vnpay-fixtures.ts                 # Reusable test fixtures
```

#### Grouping Strategy

**Mỗi file test = 1 requirement** cho dễ trace requirements → test coverage

**Shared logic**: Extract vào helpers để tránh duplication

### Test Helpers Design

#### 1. VNPAY Test Helper

```typescript
// tests/e2e/helpers/vnpay-test-helper.ts
import { createHmac } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';

export interface VnpayIpnParams {
  gatewayReference: string;
  amount: bigint;
  responseCode: string; // '00' = success, '07' = suspicious, etc.
  transactionStatus: string;
  transactionNo?: string;
  tmnCode?: string;
}

export class VnpayTestHelper {
  constructor(
    private readonly apiUrl: string,
    private readonly hashSecret: string,
    private readonly tmnCode: string,
  ) {}

  /**
   * Tính chữ ký VNPAY theo chuẩn HMACSHA512
   */
  computeSignature(params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort();
    const query = new URLSearchParams();
    for (const key of sortedKeys) {
      query.append(key, params[key]);
    }
    const data = query.toString();
    return createHmac('sha512', this.hashSecret)
      .update(data, 'utf8')
      .digest('hex');
  }

  /**
   * Giả lập IPN callback từ VNPAY với chữ ký hợp lệ
   */
  async simulateIpn(
    request: APIRequestContext,
    params: VnpayIpnParams,
  ): Promise<{ RspCode: string; Message: string }> {
    const ipnParams: Record<string, string> = {
      vnp_TxnRef: params.gatewayReference,
      vnp_Amount: (params.amount * 100n).toString(),
      vnp_TmnCode: params.tmnCode ?? this.tmnCode,
      vnp_ResponseCode: params.responseCode,
      vnp_TransactionStatus: params.transactionStatus,
      vnp_TransactionNo: params.transactionNo ?? `VNPAY_${Date.now()}`,
      vnp_BankCode: 'NCB',
      vnp_PayDate: this.formatVnpayDate(new Date()),
      vnp_OrderInfo: 'BrewLite order test',
      vnp_CurrCode: 'VND',
    };

    const signature = this.computeSignature(ipnParams);
    ipnParams.vnp_SecureHash = signature;

    const response = await request.post(
      `${this.apiUrl}/payments/test/vnpay/simulate-ipn`,
      { params: ipnParams }
    );
    return response.json();
  }

  /**
   * Verify payment URL có signature hợp lệ
   */
  verifyPaymentUrl(paymentUrl: string): boolean {
    const url = new URL(paymentUrl);
    const params: Record<string, string> = {};
    const secureHash = url.searchParams.get('vnp_SecureHash');
    
    if (!secureHash) return false;

    for (const [key, value] of url.searchParams.entries()) {
      if (key !== 'vnp_SecureHash') {
        params[key] = value;
      }
    }

    const expectedSignature = this.computeSignature(params);
    return secureHash === expectedSignature;
  }

  private formatVnpayDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return values.year + values.month + values.day + 
           values.hour + values.minute + values.second;
  }
}
```

#### 2. Auth Helper

```typescript
// tests/e2e/helpers/auth-helper.ts
import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';

export interface TestUser {
  username: string;
  password: string;
  accessToken: string;
  userId: string;
}

export async function createTestUser(
  request: APIRequestContext,
  apiUrl: string,
  prefix: string = 'e2e_vnpay',
): Promise<TestUser> {
  const username = `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const password = 'E2e-vnpay-password-123';

  const response = await request.post(`${apiUrl}/auth/register`, {
    data: { username, password },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create test user: ${response.status()}`);
  }

  const body = await response.json();
  return {
    username,
    password,
    accessToken: body.data.accessToken,
    userId: body.data.userId,
  };
}
```

#### 3. Cart Helper

```typescript
// tests/e2e/helpers/cart-helper.ts
import type { Page } from '@playwright/test';

export async function setupCartWithProduct(
  page: Page,
  accessToken: string,
): Promise<void> {
  await page.goto('/menu');
  await page.evaluate(
    (token) => localStorage.setItem('brewlite_token', token),
    accessToken,
  );
  await page.reload();

  // Chọn sản phẩm available đầu tiên bằng nút "Tùy chọn"
  await page
    .locator('button:not(:disabled)')
    .filter({ hasText: 'Tùy chọn' })
    .first()
    .click();

  // Thêm vào giỏ hàng
  const addButton = page.getByRole('button', { name: /Thêm vào giỏ/ });
  await addButton.click();
}

export async function proceedToCheckout(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Tiến hành đặt & thanh toán' })
    .click();
  await page.waitForURL(/\/checkout/);
}
```

#### 4. Assertion Helper

```typescript
// tests/e2e/helpers/assertion-helper.ts
import { expect, type Page } from '@playwright/test';

export async function assertCountdownVisible(
  page: Page,
  expectedState: 'normal' | 'urgent' | 'expired',
): Promise<void> {
  const timer = page.locator('[role="status"]').filter({ hasText: /\d{2}:\d{2}/ });
  
  if (expectedState === 'expired') {
    await expect(
      page.getByText('Đã hết thời gian giữ chỗ')
    ).toBeVisible();
  } else if (expectedState === 'urgent') {
    await expect(timer).toHaveClass(/text-rose-600/);
    await expect(timer).toHaveClass(/animate-pulse/);
  } else {
    await expect(timer).toBeVisible();
    await expect(timer).not.toHaveClass(/text-rose-600/);
  }
}

export async function assertPaymentStatus(
  orderId: string,
  expectedStatus: 'PENDING' | 'PAID',
  apiUrl: string,
  accessToken: string,
): Promise<void> {
  const response = await fetch(`${apiUrl}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(response.ok).toBeTruthy();
  const body = await response.json();
  expect(body.data.status).toBe(expectedStatus);
}
```

### Test Fixtures

```typescript
// tests/e2e/fixtures/vnpay-fixtures.ts
import { test as base } from '@playwright/test';
import { VnpayTestHelper } from '../helpers/vnpay-test-helper.js';
import { createTestUser, type TestUser } from '../helpers/auth-helper.js';

interface VnpayFixtures {
  vnpayHelper: VnpayTestHelper;
  testUser: TestUser;
  apiUrl: string;
}

export const test = base.extend<VnpayFixtures>({
  apiUrl: async ({}, use) => {
    const url = process.env.E2E_API_URL ?? 'http://localhost:3101/api/v1';
    await use(url);
  },

  vnpayHelper: async ({ apiUrl }, use) => {
    const hashSecret = process.env.VNPAY_HASH_SECRET;
    const tmnCode = process.env.VNPAY_TMN_CODE;
    
    if (!hashSecret || !tmnCode) {
      throw new Error('VNPAY credentials not configured');
    }

    const helper = new VnpayTestHelper(apiUrl, hashSecret, tmnCode);
    await use(helper);
  },

  testUser: async ({ request, apiUrl }, use) => {
    const user = await createTestUser(request, apiUrl);
    await use(user);
    // No cleanup - preserve audit trail
  },
});

export { expect } from '@playwright/test';
```

## API Extensions

### Test-Only Endpoints

#### 1. IPN Simulation Endpoint

**Endpoint**: `POST /payments/test/vnpay/simulate-ipn`

**Purpose**: Cho phép test trigger IPN callback logic mà không cần VNPAY thật gửi callback

**Request**:
```http
POST /api/v1/payments/test/vnpay/simulate-ipn?vnp_TxnRef=xxx&vnp_Amount=xxx&vnp_SecureHash=xxx
```

**Query Parameters** (giống IPN thật từ VNPAY):
- `vnp_TxnRef`: Gateway reference (UUID without dashes)
- `vnp_Amount`: Số tiền (VND * 100)
- `vnp_TmnCode`: Merchant code
- `vnp_ResponseCode`: `'00'` (success) hoặc error codes
- `vnp_TransactionStatus`: `'00'` (success) hoặc `'02'` (failed)
- `vnp_TransactionNo`: VNPAY transaction number
- `vnp_SecureHash`: HMACSHA512 signature
- (và các tham số khác theo VNPAY spec)

**Response**:
```json
{
  "RspCode": "00",
  "Message": "Confirm Success"
}
```

**Error Cases**:
- `RspCode: '97'`: Invalid signature
- `RspCode: '04'`: Amount mismatch
- `RspCode: '02'`: Duplicate callback
- `RspCode: '99'`: Internal error

**Security**:
```typescript
@Post('test/vnpay/simulate-ipn')
@HttpCode(HttpStatus.OK)
async testSimulateVnpayIpn(@Query() query: Record<string, unknown>) {
  // Security: Only available in test environment
  if (process.env.NODE_ENV !== 'test') {
    throw new ForbiddenException(
      'This endpoint is only available in test environment'
    );
  }
  
  // Reuse production IPN handler để test đúng logic
  return this.paymentsService.handleVnpayIpn(query);
}
```

## Testing Strategy

### Test Coverage Mapping

| Requirement | Test File | Test Cases |
|------------|-----------|------------|
| Req 1: Success flow | `vnpay-happy-path.spec.ts` | 1. Complete payment flow end-to-end |
| Req 2: Timeout recovery | `vnpay-timeout-recovery.spec.ts` | 1. Countdown expires → Manual recovery button<br>2. Recovery calls Payment Inquiry<br>3. Success after expiry updates status |
| Req 3: IPN race | `vnpay-ipn-race.spec.ts` | 1. IPN arrives before user returns<br>2. User sees success immediately<br>3. Duplicate IPN rejected |
| Req 4: Network loss | `vnpay-network-loss.spec.ts` | 1. User returns after hours<br>2. Manual check button works<br>3. Recovery with delayed inquiry |
| Req 5: Signature | `vnpay-signature.spec.ts` | 1. Valid signature accepted<br>2. Invalid signature rejected<br>3. Modified params rejected |
| Req 6: Idempotency | `vnpay-idempotency.spec.ts` | 1. Retry after FAILED works<br>2. Retry during PROCESSING blocked<br>3. Same orderId different keys |
| Req 7: Environment | `vnpay-env.spec.ts` | 1. Credentials validation<br>2. Unique username generation<br>3. Test isolation |
| Req 8: Polling | `vnpay-polling.spec.ts` | 1. Poll every 5 seconds<br>2. Stop on SUCCEEDED<br>3. Stop after 3 failures |
| Req 9: Countdown | `vnpay-countdown.spec.ts` | 1. Displays mm:ss format<br>2. Urgent state at 30s<br>3. Expired state at 00:00<br>4. Resume after reload |
| Req 10: Performance | All specs | 1. Suite completes < 5 min<br>2. Trace & screenshots on fail<br>3. Stable selectors |
| Req 11: Double click | `vnpay-double-click.spec.ts` | 1. One POST only<br>2. 409 on second click<br>3. Status query before replay |
| Req 12: Payment method | `vnpay-payment-method.spec.ts` | 1. VNPAY option visible<br>2. Real payment URL returned<br>3. No mock for VNPAY |
| Req 13: Audit trail | `vnpay-audit.spec.ts` | 1. Payment record created<br>2. Timestamps preserved<br>3. Retry flag set correctly |
| Req 14: Localization | `vnpay-error-messages.spec.ts` | 1. Vietnamese error messages<br>2. VND currency format<br>3. Instructions in Vietnamese |
| Req 15: Test data | All specs | 1. UUID username<br>2. UUID idempotency key<br>3. No cleanup required |

### Example Test Case

```typescript
// tests/e2e/vnpay/vnpay-happy-path.spec.ts
import { test, expect } from '../fixtures/vnpay-fixtures.js';
import { setupCartWithProduct, proceedToCheckout } from '../helpers/cart-helper.js';
import { assertPaymentStatus } from '../helpers/assertion-helper.js';
import { randomUUID } from 'node:crypto';

test.describe('VNPAY Happy Path (Req 1)', () => {
  test('User completes payment successfully via VNPAY QR', async ({
    page,
    request,
    testUser,
    vnpayHelper,
    apiUrl,
  }) => {
    // Setup: Add product to cart
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);

    // Select VNPAY payment method
    await page.getByRole('button', { name: /VNPAY/ }).click();
    
    // Create payment
    const idempotencyKey = randomUUID();
    const createPaymentResponse = page.waitForResponse(
      (r) => r.url().includes('/payments') && r.request().method() === 'POST'
    );
    
    await page.getByRole('button', { name: /^Thanh toán / }).click();
    const response = await createPaymentResponse;
    
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.data.status).toBe('PROCESSING');
    expect(body.data.paymentUrl).toMatch(/^https:\/\/sandbox\.vnpayment\.vn/);
    
    // Verify signature in payment URL
    const isValidSignature = vnpayHelper.verifyPaymentUrl(body.data.paymentUrl);
    expect(isValidSignature).toBeTruthy();

    const orderId = body.data.orderId;
    const gatewayReference = body.data.gatewayReference;

    // Simulate successful IPN callback
    const ipnResponse = await vnpayHelper.simulateIpn(request, {
      gatewayReference,
      amount: body.data.amount,
      responseCode: '00',
      transactionStatus: '00',
    });

    expect(ipnResponse.RspCode).toBe('00');
    expect(ipnResponse.Message).toContain('Success');

    // Wait for polling to pick up the success
    await page.waitForURL(/\/orders\/confirmation\?orderId=/);
    
    // Verify confirmation page
    await expect(
      page.getByRole('heading', { name: 'Cảm ơn bạn đã chọn BrewLite' })
    ).toBeVisible();

    // Verify order status persisted
    await assertPaymentStatus(orderId, 'PAID', apiUrl, testUser.accessToken);

    // Verify cart cleared
    await page.goto('/checkout');
    await expect(
      page.getByRole('heading', { name: 'Giỏ hàng đang trống' })
    ).toBeVisible();
  });
});
```

## CI/CD Integration

### GitHub Actions Workflow

**File: `.github/workflows/vnpay-e2e.yml`**

```yaml
name: VNPAY E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    # Chạy daily để phát hiện VNPAY sandbox issues
    - cron: '0 2 * * *'

jobs:
  vnpay-e2e:
    name: VNPAY E2E Test Suite
    runs-on: ubuntu-latest
    timeout-minutes: 15

    env:
      # VNPAY Credentials từ GitHub Secrets
      VNPAY_ENABLED: true
      VNPAY_TMN_CODE: ${{ secrets.VNPAY_TMN_CODE_SANDBOX }}
      VNPAY_HASH_SECRET: ${{ secrets.VNPAY_HASH_SECRET_SANDBOX }}
      VNPAY_PAYMENT_URL: https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
      VNPAY_QUERY_URL: https://sandbox.vnpayment.vn/merchant_webapi/api/transaction
      VNPAY_RETURN_URL: http://localhost:3101/api/v1/payments/vnpay/return
      VNPAY_IPN_URL: http://localhost:3101/api/v1/payments/vnpay/ipn
      
      # Test Environment
      NODE_ENV: test
      E2E_API_URL: http://localhost:3101/api/v1
      E2E_WEB_PORT: 3100
      E2E_API_PORT: 3101
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/brewlite_test
      JWT_SECRET: test-jwt-secret-for-e2e
      WEB_ORIGIN: http://localhost:3100

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: brewlite_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install root dependencies
        run: npm ci

      - name: Install API dependencies
        run: npm ci --prefix apps/api

      - name: Install Web dependencies
        run: npm ci --prefix apps/web

      - name: Run database migrations
        run: npm --prefix apps/api run prisma:migrate:deploy

      - name: Seed test database
        run: npm --prefix apps/api run prisma:seed

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run VNPAY E2E tests
        run: npm --prefix apps/web run test:e2e:vnpay
        continue-on-error: false

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-vnpay-report
          path: apps/web/playwright-report/
          retention-days: 14

      - name: Upload test videos
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-vnpay-videos
          path: apps/web/test-results/
          retention-days: 7

      - name: Comment PR with test results
        if: github.event_name == 'pull_request' && failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '❌ VNPAY E2E tests failed. Check the [test report](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}) for details.'
            })
```

### Package.json Scripts

**File: `apps/web/package.json`**

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:vnpay": "playwright test tests/e2e/vnpay --reporter=html,list",
    "test:e2e:vnpay:ui": "playwright test tests/e2e/vnpay --ui",
    "test:e2e:vnpay:debug": "playwright test tests/e2e/vnpay --debug"
  }
}
```

## Implementation Plan

### Phase 1: Foundation (Week 1)

**Tasks**:
1. ✅ Create test-only IPN simulation endpoint
   - Add `POST /payments/test/vnpay/simulate-ipn` controller
   - Add environment guard (`NODE_ENV=test`)
   - Unit test the endpoint

2. ✅ Setup test infrastructure
   - Create `.env.test.example`
   - Document VNPAY Sandbox credentials retrieval
   - Add credentials validation helper

3. ✅ Create test helpers
   - `vnpay-test-helper.ts`: Signature computation, IPN simulation
   - `auth-helper.ts`: User registration
   - `cart-helper.ts`: Cart setup
   - `assertion-helper.ts`: Custom assertions

4. ✅ Setup test fixtures
   - Playwright fixtures with VNPAY helper injection
   - Auto-create test user per test

**Deliverables**:
- Test infrastructure ready
- Helpers tested and documented
- Can run first "hello world" VNPAY test

### Phase 2: Core Test Cases (Week 2)

**Tasks**:
1. ✅ Implement Req 1: Happy path
   - Test file: `vnpay-happy-path.spec.ts`
   - Verify complete success flow
   - Validate signature, status updates, redirect

2. ✅ Implement Req 5: Signature validation
   - Test file: `vnpay-signature.spec.ts`
   - Test valid signature accepted
   - Test invalid signature rejected
   - Test tampered params rejected

3. ✅ Implement Req 6: Idempotency
   - Test file: `vnpay-idempotency.spec.ts`
   - Retry after FAILED
   - Block retry during PROCESSING
   - Multiple keys same order

**Deliverables**:
- 3 core test files passing
- Coverage for most critical paths

### Phase 3: Edge Cases (Week 3)

**Tasks**:
1. ✅ Implement Req 2: Timeout & recovery
2. ✅ Implement Req 3: IPN race conditions
3. ✅ Implement Req 4: Network loss recovery
4. ✅ Implement Req 8: Polling behavior
5. ✅ Implement Req 9: Countdown timer
6. ✅ Implement Req 11: Double click protection

**Deliverables**:
- All edge case tests passing
- Comprehensive coverage

### Phase 4: UX & Polish (Week 4)

**Tasks**:
1. ✅ Implement Req 10: Performance & reliability
2. ✅ Implement Req 12: Payment method selection
3. ✅ Implement Req 13: Audit trail verification
4. ✅ Implement Req 14: Vietnamese localization
5. ✅ Setup CI/CD workflow
6. ✅ Documentation final review

**Deliverables**:
- Complete test suite passing
- CI/CD running successfully
- Documentation complete

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

**Note**: Bộ kiểm thử E2E này KHÔNG sử dụng property-based testing vì:

1. **IaC-like nature**: E2E tests giống Infrastructure-as-Code, test các kịch bản cụ thể không phải thuộc tính toán học
2. **External dependencies**: Dựa vào VNPAY Sandbox bên ngoài, không phải pure functions
3. **Deterministic scenarios**: Test các luồng nghiệp vụ cụ thể (success, timeout, failure) không phải input space vô hạn

**Testing Strategy**: Sử dụng **example-based E2E testing** với:
- Concrete test scenarios cho mỗi requirement
- Mock VNPAY responses để test edge cases
- Assertion-based verification thay vì property generators

**Alternative validation**: Unit tests cho VNPAY signature computation (`vnpay.gateway.spec.ts`) đã có property-based tests phù hợp hơn.

## Error Handling

### VNPAY Sandbox Outage

**Detection**:
```typescript
test('handles VNPAY sandbox unavailability gracefully', async ({ page, request }) => {
  // Cố gắng create payment
  const response = await request.post(`${api}/payments`, {
    data: { orderId, method: 'VNPAY' },
    headers: { 'Authorization': `Bearer ${token}`, 'Idempotency-Key': key }
  });

  if (!response.ok() && response.status() >= 500) {
    test.skip('VNPAY Sandbox không khả dụng');
  }
});
```

**Handling**: Skip test với warning, không fail CI để tránh false negatives

### Application Errors

**Detection**: Assertion failures, unexpected status codes

**Handling**: 
- Fail test với detailed error message
- Capture screenshot + trace
- Include API response body trong error message

**Example**:
```typescript
const response = await request.post(`${api}/payments`, { ... });
expect(response.ok(), `Failed to create payment: ${await response.text()}`).toBeTruthy();
```

### Configuration Errors

**Detection**: Missing env vars, invalid credentials

**Handling**: Fail fast trước khi chạy tests

```typescript
test.beforeAll(() => {
  validateVnpayEnv(); // Throws if invalid
});
```

## Testing Strategy

### Unit Tests vs Integration Tests vs E2E Tests

**Unit Tests** (existing):
- VNPAY signature computation: `vnpay.gateway.spec.ts`
- Payment service logic: `payments.service.spec.ts`
- Property-based tests cho pure functions

**Integration Tests** (existing):
- API endpoints với mocked VNPAY: `checkout.spec.ts`
- Database interactions

**E2E Tests** (this design):
- Full user journey từ frontend → backend → VNPAY
- Real browser automation với Playwright
- Test IPN callback flow end-to-end

### Coverage Goals

- **Requirements coverage**: 100% (all 16 requirements tested)
- **Line coverage**: Not primary goal (focus on behavior)
- **Critical paths**: 100% (success, failure, retry, timeout)
- **Edge cases**: Representative scenarios (không cần exhaustive)

## Deployment Strategy

### Local Development

**Setup**:
```bash
# 1. Copy env template
cp apps/web/.env.test.example apps/web/.env.test

# 2. Fill in VNPAY credentials
# Edit .env.test: Add VNPAY_TMN_CODE and VNPAY_HASH_SECRET

# 3. Start test database
docker-compose -f docker-compose.test.yml up -d postgres

# 4. Run migrations
npm --prefix apps/api run prisma:migrate:deploy

# 5. Run VNPAY E2E tests
npm --prefix apps/web run test:e2e:vnpay
```

**Debugging**:
```bash
# UI mode để debug interactively
npm --prefix apps/web run test:e2e:vnpay:ui

# Debug mode với breakpoints
npm --prefix apps/web run test:e2e:vnpay:debug
```

### CI/CD

**Pre-requisites**:
1. Add GitHub Secrets:
   - `VNPAY_TMN_CODE_SANDBOX`
   - `VNPAY_HASH_SECRET_SANDBOX`

2. Workflow triggers:
   - Every push to `main` và `develop`
   - Every PR
   - Daily scheduled run để catch sandbox issues

**Monitoring**:
- GitHub Actions status badge trong README
- Slack notification on failures (optional)
- Playwright HTML report uploaded as artifact

## Success Criteria

### Definition of Done

Bộ kiểm thử được coi là hoàn thành khi:

1. ✅ **All 16 requirements** có ít nhất 1 test case passing
2. ✅ **CI/CD pipeline** chạy successfully trên GitHub Actions
3. ✅ **Test suite** chạy < 5 phút end-to-end
4. ✅ **Documentation** đầy đủ để developer mới có thể run local tests
5. ✅ **Zero flaky tests**: Test deterministic, không fail ngẫu nhiên
6. ✅ **Trace & screenshots** automatically captured on failures
7. ✅ **Secrets management** properly configured cho local và CI/CD

### Quality Gates

**Before merging to main**:
- All VNPAY E2E tests must pass
- No skipped tests (trừ khi VNPAY sandbox down)
- No TODO comments trong test code
- All test helpers documented

## Risks & Mitigations

### Risk 1: VNPAY Sandbox Instability

**Likelihood**: Medium
**Impact**: High (tests fail không phải lỗi app)

**Mitigation**:
- Implement retry mechanism cho network calls
- Skip tests with warning nếu sandbox unavailable
- Daily scheduled runs để detect sandbox issues early
- Fallback to mock-only tests trong emergency

### Risk 2: Test Flakiness

**Likelihood**: Medium
**Impact**: Medium (giảm tin tưởng vào tests)

**Mitigation**:
- Use stable selectors (role, text) không phải CSS classes
- Explicit waits thay vì arbitrary timeouts
- Sequential execution (workers=1) để tránh race conditions
- Comprehensive logging để debug flaky tests

### Risk 3: Credentials Leak

**Likelihood**: Low
**Impact**: Critical (security breach)

**Mitigation**:
- `.env.test` in `.gitignore`
- GitHub Secrets cho CI/CD
- Regular rotation of test credentials
- Audit logs cho credential access

### Risk 4: Test Maintenance Burden

**Likelihood**: Medium
**Impact**: Medium (tests become outdated)

**Mitigation**:
- DRY principle: Extract helpers để tránh duplication
- Clear documentation và inline comments
- Regular refactoring khi UI changes
- Test ownership assigned to team members

## Appendix

### VNPAY Sandbox Credentials

**Lấy credentials**:
1. Đăng ký tài khoản VNPAY Sandbox tại: https://sandbox.vnpayment.vn/devreg
2. Sau khi approved, vào dashboard lấy:
   - `VNPAY_TMN_CODE`: Merchant Terminal Code
   - `VNPAY_HASH_SECRET`: 32-character hash secret

**Test Cards** (không cần thật, dùng cho UI testing nếu cần):
- Card Number: `9704 0000 0000 0018`
- Expiry: `07/25`
- CVV: `123`

### Reference Links

- [VNPAY Sandbox Documentation](https://sandbox.vnpayment.vn/apis/docs/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [NestJS Testing Guide](https://docs.nestjs.com/fundamentals/testing)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)

### Glossary

- **E2E**: End-to-End testing
- **IPN**: Instant Payment Notification - VNPAY's callback mechanism
- **Idempotency Key**: Unique identifier để prevent duplicate payments
- **Sandbox**: Test environment của VNPAY
- **TmnCode**: Terminal Merchant Code - merchant identifier
- **Hash Secret**: Secret key cho HMAC signature
- **QR Code**: Quick Response code for payment
- **Playwright**: Browser automation framework

# Implementation Plan: Bộ Kiểm Thử E2E VNPAY

## Overview

Tài liệu này trình bày kế hoạch triển khai chi tiết cho bộ kiểm thử end-to-end (E2E) xác thực tích hợp thanh toán QR VNPAY với môi trường Sandbox thực tế. Bộ kiểm thử sẽ cover 16 requirements từ luồng thành công đến các edge cases phức tạp như timeout recovery, IPN race conditions, và double-click protection.

### Cấu Trúc Triển Khai

**Phase 1 (Tuần 1)**: Xây dựng hạ tầng kiểm thử cơ bản - test endpoints, helpers, fixtures  
**Phase 2 (Tuần 2)**: Triển khai 3 test cases quan trọng nhất - happy path, signature, idempotency  
**Phase 3 (Tuần 3)**: Bổ sung các edge cases - timeout, race conditions, network issues  
**Phase 4 (Tuần 4)**: CI/CD integration, error handling, documentation  

### Chỉ Tiêu Thành Công

- ✅ 16/16 requirements có ít nhất 1 test case passing
- ✅ Test suite chạy < 5 phút end-to-end
- ✅ Zero flaky tests, 100% deterministic
- ✅ CI/CD workflow chạy thành công trên GitHub Actions
- ✅ Documentation đầy đủ cho developer onboarding

---

## Tasks

### Phase 1: Xây Dựng Hạ Tầng Kiểm Thử

- [x] 1. Tạo test-only IPN simulation endpoint
  - **Mô tả**: Thêm endpoint cho phép test mô phỏng IPN callback từ VNPAY mà không cần public-accessible URL
  - **Files**:
    - `apps/api/src/modules/payments/controllers/payments.controller.ts`
  - **Implementation**:
    ```typescript
    @Post('test/vnpay/simulate-ipn')
    @HttpCode(HttpStatus.OK)
    async testSimulateVnpayIpn(@Query() query: Record<string, unknown>) {
      if (process.env.NODE_ENV !== 'test') {
        throw new ForbiddenException(
          'Endpoint này chỉ khả dụng trong môi trường test'
        );
      }
      // Reuse production IPN handler
      return this.paymentsService.handleVnpayIpn(query);
    }
    ```
  - **Acceptance Criteria**:
    - Endpoint chỉ khả dụng khi `NODE_ENV=test`
    - Throw `403 Forbidden` khi gọi từ production
    - Sử dụng chính logic `handleVnpayIpn` của production
    - Validate signature giống production endpoint
    - Trả về response format giống VNPAY IPN: `{RspCode, Message}`
  - **Requirements**: Req 1, Req 3, Req 4
  - **Effort**: M

- [x] 2. Tạo VnpayTestHelper class
  - **Mô tả**: Tạo utility class cung cấp các helper methods cho VNPAY testing (signature computation, IPN simulation, URL verification)
  - **Files**:
    - `apps/web/tests/e2e/helpers/vnpay-test-helper.ts` (new)
  - **Implementation**:
    - Method `computeSignature(params)`: Tính HMACSHA512 signature
    - Method `simulateIpn(request, params)`: Gọi test endpoint với signed params
    - Method `verifyPaymentUrl(url)`: Verify signature trong payment URL
    - Method `formatVnpayDate(date)`: Format timestamp theo VNPAY spec (yyyyMMddHHmmss)
  - **Acceptance Criteria**:
    - `computeSignature()` tính chính xác HMACSHA512 với sorted params
    - `simulateIpn()` tạo IPN request với đầy đủ required fields
    - `verifyPaymentUrl()` extract và validate signature từ URL
    - `formatVnpayDate()` format date đúng timezone Asia/Ho_Chi_Minh
    - Tất cả methods có TypeScript interfaces rõ ràng
  - **Requirements**: Req 1, Req 5, Req 6
  - **Effort**: M

- [x] 3. Tạo Auth helper
  - **Mô tả**: Tạo helper function để tạo test user với username duy nhất
  - **Files**:
    - `apps/web/tests/e2e/helpers/auth-helper.ts` (new)
  - **Implementation**:
    ```typescript
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
      // POST /auth/register...
    }
    ```
  - **Acceptance Criteria**:
    - Username có format `e2e_vnpay_[16-char-uuid]`
    - Password fixed để simplify testing
    - Function trả về TestUser object với accessToken
    - Throw error rõ ràng nếu registration fails
    - No cleanup logic (giữ audit trail)
  - **Requirements**: Req 7, Req 15
  - **Effort**: S

- [x] 4. Tạo Cart helper
  - **Mô tả**: Tạo helper functions để setup cart với sản phẩm và tiến hành checkout
  - **Files**:
    - `apps/web/tests/e2e/helpers/cart-helper.ts` (new)
  - **Implementation**:
    - Function `setupCartWithProduct(page, accessToken)`: Navigate menu, add product
    - Function `proceedToCheckout(page)`: Click checkout button, wait for /checkout URL
  - **Acceptance Criteria**:
    - `setupCartWithProduct()` thêm ít nhất 1 sản phẩm available
    - Function chọn sản phẩm bằng selector ổn định (role="button")
    - `proceedToCheckout()` verify URL chuyển sang /checkout
    - Handle cart drawer tự động mở sau khi add product
    - Clear, descriptive errors khi sản phẩm không available
  - **Requirements**: Req 1, Req 12
  - **Effort**: S

- [x] 5. Tạo Assertion helper
  - **Mô tả**: Tạo custom assertion helpers cho các trạng thái VNPAY-specific
  - **Files**:
    - `apps/web/tests/e2e/helpers/assertion-helper.ts` (new)
  - **Implementation**:
    - Function `assertCountdownVisible(page, state)`: Verify countdown timer
    - Function `assertPaymentStatus(orderId, status, apiUrl, token)`: Query API và verify status
  - **Acceptance Criteria**:
    - `assertCountdownVisible()` verify format mm:ss, urgent state, expired state
    - `assertPaymentStatus()` fetch từ API và compare status
    - Tất cả assertions throw descriptive errors khi fail
    - Use Playwright expect() với custom messages
  - **Requirements**: Req 2, Req 9, Req 13
  - **Effort**: S

- [x] 6. Tạo Playwright fixtures
  - **Mô tả**: Setup fixtures để auto-inject vnpayHelper, testUser, apiUrl vào mỗi test
  - **Files**:
    - `apps/web/tests/e2e/fixtures/vnpay-fixtures.ts` (new)
  - **Implementation**:
    ```typescript
    interface VnpayFixtures {
      vnpayHelper: VnpayTestHelper;
      testUser: TestUser;
      apiUrl: string;
    }

    export const test = base.extend<VnpayFixtures>({
      apiUrl: async ({}, use) => { ... },
      vnpayHelper: async ({ apiUrl }, use) => { ... },
      testUser: async ({ request, apiUrl }, use) => { ... },
    });
    ```
  - **Acceptance Criteria**:
    - Fixtures tự động inject vào mỗi test case
    - `vnpayHelper` được initialize với env vars (TMN_CODE, HASH_SECRET)
    - `testUser` được tạo mới cho mỗi test
    - No cleanup logic trong fixtures
    - Throw clear error nếu env vars missing
  - **Requirements**: Req 7, Req 15
  - **Effort**: M

- [x] 7. Setup environment configuration
  - **Mô tả**: Tạo .env.test.example template và validation logic cho VNPAY credentials
  - **Files**:
    - `.env.test.example` (new, committed)
    - `apps/web/tests/e2e/helpers/vnpay-env-validator.ts` (new)
  - **Implementation**:
    - `.env.test.example` với hướng dẫn lấy credentials từ VNPAY
    - Validator function check required env vars trước khi chạy tests
    - Validate HASH_SECRET có đúng 32 characters
  - **Acceptance Criteria**:
    - `.env.test.example` có template đầy đủ với comments Tiếng Việt
    - Validator throw error rõ ràng nếu credentials thiếu
    - Error message hướng dẫn copy .env.test.example → .env.test
    - Validate TMN_CODE, HASH_SECRET, PAYMENT_URL, QUERY_URL
    - Document cách lấy credentials từ VNPAY Sandbox
  - **Requirements**: Req 7
  - **Effort**: S

- [x] 8. Checkpoint - Infrastructure foundation complete
  - Đảm bảo tất cả helpers và fixtures hoạt động
  - Verify có thể import và sử dụng trong test files
  - Test endpoint `/test/vnpay/simulate-ipn` trả về đúng format
  - Environment validation hoạt động chính xác

### Phase 2: Core Test Cases

- [x] 9. Implement Happy Path test
  - **Mô tả**: Test luồng thanh toán thành công từ đầu đến cuối (Req 1)
  - **Files**:
    - `apps/web/tests/e2e/vnpay/vnpay-happy-path.spec.ts` (new)
  - **Implementation**:
    1. Create test user, setup cart với 1 product
    2. Navigate to checkout, select VNPAY payment method
    3. Click thanh toán, capture POST /payments response
    4. Verify payment URL có signature hợp lệ
    5. Simulate successful IPN callback với vnpayHelper
    6. Wait for polling to detect success → redirect /orders/confirmation
    7. Verify order status PAID qua API
    8. Verify cart cleared (navigate /checkout → empty cart message)
  - **Acceptance Criteria**:
    - Test pass với real VNPAY Sandbox credentials
    - Payment URL starts with `https://sandbox.vnpayment.vn`
    - IPN callback trả về `{RspCode: '00', Message: 'Confirm Success'}`
    - Order status updated to PAID
    - User redirected to confirmation page với correct orderId
    - Cart cleared sau successful payment
    - No flakiness, test chạy deterministic
  - **Requirements**: Req 1, Req 12
  - **Effort**: L
  - **Dependencies**: Tasks 1-7

- [x] 10. Implement Signature Validation test
  - **Mô tả**: Test xác thực chữ ký VNPAY trong payment URL, IPN callback, và inquiry (Req 5)
  - **Files**:
    - `apps/web/tests/e2e/vnpay/vnpay-signature.spec.ts` (new)
  - **Implementation**:
    - **Test case 1**: Valid signature accepted
      - Create payment, verify signature trong URL
      - Simulate IPN với valid signature → success
    - **Test case 2**: Invalid signature rejected
      - Simulate IPN với wrong signature
      - Verify backend trả về RspCode='97' (invalid signature)
      - Verify payment status không thay đổi
    - **Test case 3**: Tampered params rejected
      - Create payment URL, modify amount parameter
      - Verify signature no longer matches
  - **Acceptance Criteria**:
    - Valid signature được accept và payment succeeds
    - Invalid signature rejected với RspCode='97'
    - Tampered params fail signature verification
    - Test cover cả payment URL, IPN, và inquiry signatures
    - Security logs ghi nhận invalid signature attempts
  - **Requirements**: Req 5
  - **Effort**: M
  - **Dependencies**: Tasks 1-7

- [x] 11. Implement Idempotency & Retry test
  - **Mô tả**: Test chống nhấn đúp và retry safety (Req 6)
  - **Files**:
    - `apps/web/tests/e2e/vnpay/vnpay-idempotency.spec.ts` (new)
  - **Implementation**:
    - **Test case 1**: Retry after FAILED
      - Create payment, simulate failure (responseCode='07')
      - Verify payment status = FAILED
      - Click thanh toán lại với new Idempotency-Key
      - Simulate success → verify new payment SUCCEEDED
      - Verify old payment vẫn FAILED
    - **Test case 2**: Block retry during PROCESSING
      - Create payment (status PROCESSING)
      - Attempt retry với same orderId
      - Verify error 409 PAYMENT_IN_PROGRESS
    - **Test case 3**: Multiple keys same order
      - Create payment với key1 → FAILED
      - Create payment với key2 → SUCCEEDED
      - Verify 2 separate payment records
  - **Acceptance Criteria**:
    - Retry sau FAILED tạo payment record mới
    - Retry trong PROCESSING bị block với 409
    - Multiple keys same orderId được phép (sau FAILED)
    - `isRetried` flag được set correctly
    - Database constraint `(orderId, status=PROCESSING)` unique được enforce
  - **Requirements**: Req 6, Req 13
  - **Effort**: M
  - **Dependencies**: Tasks 1-7

- [x] 12. Checkpoint - Core scenarios complete
  - 3 core test files passing consistently
  - No flaky tests, deterministic execution
  - Clear error messages phân biệt VNPAY vs app errors
  - Test coverage cho critical paths đạt 100%

### Phase 3: Edge Cases

- [x] 13. Implement Timeout Recovery test
  - **Mô tả**: Test countdown timer hết hạn và manual recovery flow (Req 2, Req 9)
  - **Files**:
    - `apps/web/tests/e2e/vnpay/vnpay-timeout-recovery.spec.ts` (new)
  - **Implementation**:
    - **Test case 1**: Countdown displays correctly
      - Create payment với reservationExpiresAt = now + 2 minutes
      - Verify countdown timer displays mm:ss format
      - Wait until < 30 seconds → verify urgent state (red, pulsing)
      - Wait until 00:00 → verify expired state
    - **Test case 2**: Manual recovery after timeout
      - Create payment, wait for expiry
      - Verify "Kiểm tra trạng thái giao dịch" button visible
      - Simulate late payment success on VNPAY side
      - Click recovery button
      - Verify inquiry called, status updated, redirect to confirmation
    - **Test case 3**: Recovery with failure
      - Timeout happens, user clicks recovery
      - Inquiry returns FAILED
      - Verify error message displayed với errorCode
  - **Acceptance Criteria**:
    - Countdown format mm:ss với leading zeros
    - Urgent state at ≤30 seconds (red + pulse animation)
    - Expired callback fired exactly once at 00:00
    - Recovery button visible after expiry
    - Recovery calls Payment Inquiry API
    - Success after expiry updates order status
    - Failure shows appropriate Vietnamese error message
  - **Requirements**: Req 2, Req 9, Req 14
  - **Effort**: L
  - **Dependencies**: Tasks 1-7

- [x] 14. Implement IPN Race Condition test
  - **Mô tả**: Test trường hợp IPN đến trước khi user quay lại app (Req 3)
  - **Files**:
    - `apps/web/tests/e2e/vnpay/vnpay-ipn-race.spec.ts` (new)
  - **Implementation**:
    - **Test case 1**: IPN arrives first
      - Create payment (status PROCESSING)
      - Simulate IPN callback immediately (không đợi user return)
      - Verify payment status updated to SUCCEEDED trong DB
      - Navigate user trở lại checkout page
      - Verify status displayed SUCCEEDED ngay lập tức (no polling needed)
      - Verify redirect to confirmation
    - **Test case 2**: Duplicate IPN handling
      - IPN đến lần đầu → success
      - IPN đến lần 2 với same params
      - Verify lần 2 bị reject với RspCode='02' (duplicate)
      - Verify payment status không thay đổi
  - **Acceptance Criteria**:
    - IPN callback update DB trước khi user returns
    - User thấy success status ngay khi quay lại (no loading)
    - Duplicate IPN rejected properly
    - No race condition between IPN và polling
    - Signature validation vẫn được enforce
  - **Requirements**: Req 3, Req 5
  - **Effort**: M
  - **Dependencies**: Tasks 1-7

- [x] 15. Implement Double-Click Protection test
  - **Mô tả**: Test chống nhấn đúp nút thanh toán và status query logic (Req 11)
  - **Files**:
    - `apps/web/tests/e2e/vnpay/vnpay-double-click.spec.ts` (new)
  - **Implementation**:
    - **Test case 1**: Double click sends only one POST
      - Setup cart, navigate to checkout
      - Use `button.click(); button.click()` với 250ms gap
      - Verify chỉ 1 POST /payments được gửi
      - Verify second click trả về 409 PAYMENT_IN_PROGRESS
    - **Test case 2**: Reload triggers status query before replay
      - Create payment (PROCESSING)
      - Reload page
      - Verify "Kiểm tra trạng thái giao dịch" button visible
      - Click button
      - Verify GET /payments/status called first
      - If 404 → replay POST with same key
      - If PROCESSING → continue polling, no replay
      - If SUCCEEDED → redirect, no replay
  - **Acceptance Criteria**:
    - Button disabled hoặc debounced để prevent double submission
    - 409 Conflict returned khi payment already PROCESSING
    - Status query happens before replay decision
    - 404 triggers replay với same Idempotency-Key
    - PROCESSING/SUCCEEDED không trigger replay
  - **Requirements**: Req 11
  - **Effort**: M
  - **Dependencies**: Tasks 1-7

- [x] 16. Implement Network Loss Recovery test
  - **Mô tả**: Test recovery khi user mất connection trong quá trình thanh toán (Req 4)
  - **Files**:
    - `apps/web/tests/e2e/vnpay/vnpay-network-loss.spec.ts` (new)
  - **Implementation**:
    - **Test case 1**: User returns after hours
      - Create payment, simulate payment completed on VNPAY
      - User đóng app, mở lại sau nhiều giờ
      - Payment vẫn PROCESSING (IPN lost)
      - User clicks "Kiểm tra lại"
      - Inquiry discovers success → update status
      - Redirect to confirmation
    - **Test case 2**: Inquiry reveals failure
      - Payment created, network lost
      - Inquiry returns DEFINITIVE_FAILURE
      - Verify payment marked FAILED
      - Offer retry or cancel option
    - **Test case 3**: Inquiry still pending
      - Inquiry returns PENDING
      - Verify manual review message displayed
      - Payment remains PROCESSING
  - **Acceptance Criteria**:
    - PROCESSING state persists across sessions
    - Recovery button visible for stale payments
    - Inquiry discovers delayed success correctly
    - DEFINITIVE_FAILURE updates status properly
    - PENDING shows manual review message
    - Audit trail preserved (Order_Reservation data)
  - **Requirements**: Req 4, Req 13
  - **Effort**: M
  - **Dependencies**: Tasks 1-7

- [x] 17. Implement Polling Behavior test
  - **Mô tả**: Test logic polling trạng thái thanh toán (Req 8)
  - **Files**:
    - `apps/web/tests/e2e/vnpay/vnpay-polling.spec.ts` (new)
  - **Implementation**:
    - **Test case 1**: Polling interval 5 seconds
      - Create payment (PROCESSING)
      - Monitor GET /payments/status requests
      - Verify interval ~5 seconds between requests
    - **Test case 2**: Stop on SUCCEEDED
      - Start polling, simulate IPN success sau 10s
      - Verify polling stops, onSucceeded callback fired
    - **Test case 3**: Stop on FAILED
      - Polling detects FAILED status
      - Verify polling stops, onFailed callback với errorCode
    - **Test case 4**: Stop after 3 network failures
      - Mock network errors cho 3 requests liên tiếp
      - Verify polling stops, error state displayed
    - **Test case 5**: Abort on navigation
      - Start polling, user navigates away
      - Verify AbortController cancels pending requests
  - **Acceptance Criteria**:
    - Polling interval 5 seconds ±1 second tolerance
    - SUCCEEDED stops polling immediately
    - FAILED stops polling với error code
    - 3 consecutive failures stop polling
    - Navigation cancels polling (no memory leak)
    - Idempotency-Key consistent across polling requests
  - **Requirements**: Req 8
  - **Effort**: M
  - **Dependencies**: Tasks 1-7

- [x] 18. Checkpoint - Edge cases complete
  - Tất cả edge case tests passing
  - Timeout recovery hoạt động chính xác
  - Race conditions được handle properly
  - Network loss recovery robust
  - Test coverage comprehensive

### Phase 4: CI/CD & Polish

- [x] 19. Setup GitHub Actions workflow
  - **Mô tả**: Tạo CI/CD workflow cho VNPAY E2E tests trên GitHub Actions (Req 7)
  - **Files**:
    - `.github/workflows/vnpay-e2e.yml` (new)
  - **Implementation**:
    ```yaml
    name: VNPAY E2E Tests
    on:
      push:
        branches: [main, develop]
      pull_request:
        branches: [main]
      schedule:
        - cron: '0 2 * * *' # Daily at 2 AM

    jobs:
      vnpay-e2e:
        runs-on: ubuntu-latest
        env:
          VNPAY_ENABLED: true
          VNPAY_TMN_CODE: ${{ secrets.VNPAY_TMN_CODE_SANDBOX }}
          VNPAY_HASH_SECRET: ${{ secrets.VNPAY_HASH_SECRET_SANDBOX }}
          # ... other env vars
        
        services:
          postgres:
            image: postgres:15-alpine
            # ... postgres config

        steps:
          - Checkout code
          - Setup Node.js 20 với npm cache
          - Install dependencies (root, api, web)
          - Run database migrations
          - Seed test database
          - Install Playwright browsers
          - Run VNPAY E2E tests
          - Upload test report on failure
    ```
  - **Acceptance Criteria**:
    - Workflow triggers on push to main/develop
    - Triggers on pull requests
    - Daily scheduled run để catch sandbox issues
    - PostgreSQL service container configured
    - Secrets loaded from GitHub repository secrets
    - Playwright report uploaded as artifact
    - Test videos uploaded on failure
    - Workflow timeout set to 15 minutes
  - **Requirements**: Req 7, Req 10
  - **Effort**: M
  - **Dependencies**: Tasks 1-18

- [x] 20. Add npm script for VNPAY tests
  - **Mô tả**: Thêm dedicated npm script để chạy chỉ VNPAY tests
  - **Files**:
    - `apps/web/package.json`
  - **Implementation**:
    ```json
    {
      "scripts": {
        "test:e2e:vnpay": "playwright test tests/e2e/vnpay --reporter=html,list",
        "test:e2e:vnpay:ui": "playwright test tests/e2e/vnpay --ui",
        "test:e2e:vnpay:debug": "playwright test tests/e2e/vnpay --debug"
      }
    }
    ```
  - **Acceptance Criteria**:
    - `test:e2e:vnpay` chạy tất cả tests trong vnpay folder
    - HTML reporter generated sau mỗi lần chạy
    - UI mode cho interactive debugging
    - Debug mode với breakpoint support
    - Scripts documented trong README
  - **Requirements**: Req 10
  - **Effort**: S
  - **Dependencies**: None

- [x] 21. Enhance error handling và debugging
  - **Mô tả**: Improve error messages để phân biệt VNPAY outage vs app bugs (Req 10)
  - **Files**:
    - `apps/web/tests/e2e/helpers/assertion-helper.ts`
    - Tất cả test spec files
  - **Implementation**:
    - Catch VNPAY sandbox timeout → skip test với warning
    - Catch 5xx từ VNPAY → skip, không fail CI
    - Application errors → fail với detailed message
    - Configuration errors → fail fast với fix instructions
    - Add helper `detectVnpayOutage(error)` để classify errors
  - **Acceptance Criteria**:
    - VNPAY outage skips test, không fail CI
    - App bugs fail test với clear assertion messages
    - Config errors show fix instructions
    - Error messages distinguish 3 categories: VNPAY, app, config
    - Screenshots captured on all failures
    - Network traces available for debugging
  - **Requirements**: Req 10
  - **Effort**: M
  - **Dependencies**: Tasks 9-18

- [x] 22. Implement Vietnamese Error Messages test
  - **Mô tả**: Test tất cả error messages hiển thị bằng Tiếng Việt (Req 14)
  - **Files**:
    - `apps/web/tests/e2e/vnpay/vnpay-error-messages.spec.ts` (new)
  - **Implementation**:
    - **Test case 1**: Insufficient balance error
      - Simulate payment failure với responseCode='07'
      - Verify message "Số dư hoặc hạn mức thanh toán không đủ"
    - **Test case 2**: Network error during polling
      - Mock network failure
      - Verify "Không thể kiểm tra trạng thái thanh toán"
    - **Test case 3**: Timeout expired
      - Wait for countdown to reach 00:00
      - Verify "Đã hết thời gian giữ chỗ"
    - **Test case 4**: Amount formatting
      - Verify amount displayed với thousand separators
      - Example: 50000 → "50.000 ₫"
    - **Test case 5**: Instructions in Vietnamese
      - Verify QR scan instructions in Vietnamese
      - Verify all buttons labeled in Vietnamese
  - **Acceptance Criteria**:
    - All error messages in Vietnamese
    - Amount formatting với thousand separators + ₫ symbol
    - Instructions và labels consistent Vietnamese
    - No English messages visible to users
    - Screen reader announcements in Vietnamese (aria-live)
  - **Requirements**: Req 14
  - **Effort**: M
  - **Dependencies**: Tasks 1-7

- [x] 23. Write test documentation
  - **Mô tả**: Viết documentation cho developer onboarding và CI/CD setup
  - **Files**:
    - `apps/web/tests/e2e/vnpay/README.md` (new)
    - `.env.test.example` (enhance comments)
  - **Implementation**:
    - **README sections**:
      - Overview: Bộ test làm gì
      - Prerequisites: Node.js, credentials
      - Local Setup: Copy .env, install deps, run tests
      - Running Tests: npm scripts available
      - CI/CD Setup: GitHub secrets configuration
      - Troubleshooting: Common issues và fixes
      - Architecture: Test structure, helpers, fixtures
    - **Credentials Guide**:
      - How to get VNPAY Sandbox account
      - Where to find TMN_CODE và HASH_SECRET
      - How to configure in local và CI/CD
  - **Acceptance Criteria**:
    - README covers setup từ đầu đến cuối
    - Clear instructions cho lấy VNPAY credentials
    - Troubleshooting section có common errors
    - Code examples cho running tests
    - Architecture diagram included
    - CI/CD setup documented với screenshots
    - Vietnamese comments trong .env.test.example
  - **Requirements**: Tất cả requirements
  - **Effort**: M
  - **Dependencies**: Tasks 1-22

- [x] 24. Final checkpoint - Production ready
  - Tất cả 16 requirements có test coverage
  - Test suite chạy < 5 phút consistently
  - CI/CD pipeline passing trên GitHub Actions
  - Documentation complete và clear
  - Zero flaky tests, deterministic execution
  - Error messages helpful và actionable
  - Onboarding guide tested với developer mới

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "5.1", "7.1", "20.1"] },
    { "id": 1, "tasks": ["6.1"] },
    { "id": 2, "tasks": ["9.1", "10.1", "11.1"] },
    { "id": 3, "tasks": ["13.1", "14.1", "15.1", "16.1", "17.1", "22.1"] },
    { "id": 4, "tasks": ["19.1", "21.1"] },
    { "id": 5, "tasks": ["23.1"] }
  ]
}
```

**Giải thích Dependency Graph**:

- **Wave 0** (Parallel): Infrastructure foundation - tất cả helpers, test endpoint, env config có thể tạo song song
- **Wave 1**: Fixtures (depends on helpers hoàn thành)
- **Wave 2**: Core test cases (depends on fixtures)
- **Wave 3**: Edge case tests (can run parallel, all depend on infrastructure)
- **Wave 4**: CI/CD và error handling improvements
- **Wave 5**: Documentation (cuối cùng, sau khi tất cả tests stable)

**Critical Path**: Tasks 1 → 6 → 9 → 19 → 23 (IPN endpoint → Fixtures → Happy path → CI/CD → Docs)

---

## Notes

### Test Data Strategy
- Username format: `e2e_vnpay_[16-char-uuid]` để avoid collisions
- Idempotency Key: Full UUID format, generated mới cho mỗi payment
- No cleanup: Test data giữ lại cho audit trail
- Sequential execution: `workers: 1` trong playwright.config.ts để tránh race conditions

### VNPAY Sandbox Credentials
**From email Nov 4, 2026**:
- **TmnCode**: `QEZXV06S`
- **HashSecret**: `TLRYXIRSJMLVRLZAENLXJGHWWJJMORDO` (32 chars)
- **Payment URL**: `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`
- **Inquiry URL**: `https://sandbox.vnpayment.vn/merchant_webapi/api/transaction`

### Performance Targets
- **Toàn bộ test suite**: < 5 phút
- **Single test case**: < 30 giây (average)
- **Test startup**: < 2 phút (database + servers)
- **Playwright browser**: Chromium only (faster than multi-browser)

### Debugging Tips
- Use `test:e2e:vnpay:ui` cho interactive debugging
- Use `test:e2e:vnpay:debug` cho breakpoint debugging
- Check `playwright-report/` folder sau mỗi lần chạy
- Video recordings trong `test-results/` khi test fails
- Network traces có trong HTML report

### Testing Philosophy
- **Example-based testing**: Concrete scenarios, không phải property-based (vì external dependency)
- **Integration focus**: Test real VNPAY Sandbox, không mock gateway
- **Deterministic**: Test outcomes predictable, no randomness
- **Isolated**: Each test independent, shared database nhưng unique identifiers
- **Comprehensive**: Cover happy path + edge cases + error scenarios

### Known Limitations
- Không test được network path từ VNPAY → server (đó là VNPAY's responsibility)
- Không test được actual QR code scanning (user interaction không tự động hóa được)
- Không test được concurrent payments với scale lớn (performance testing out of scope)
- Sandbox có thể unstable → tests có mechanism skip khi sandbox down

### Maintenance Guidelines
- Update tests khi UI thay đổi (prefer role-based selectors)
- Rotate test credentials định kỳ (quarterly)
- Review test data growth monthly (có thể reset test DB)
- Monitor test execution time (alert nếu > 5 phút)
- Keep documentation in sync với code changes

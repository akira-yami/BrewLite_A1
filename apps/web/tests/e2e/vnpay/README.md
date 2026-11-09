# VNPAY E2E Test Suite

Bộ kiểm thử end-to-end toàn diện cho tích hợp thanh toán QR VNPAY với môi trường Sandbox thực tế.

## Tổng Quan

Bộ test này xác thực toàn bộ vòng đời thanh toán VNPAY, bao gồm:
- Tạo thanh toán và hiển thị mã QR
- Xử lý IPN callback bất đồng bộ
- Truy vấn trạng thái thanh toán (inquiry)
- Timeout và recovery flows
- Xác thực chữ ký HMACSHA512
- Idempotency và retry safety

## Prerequisites

### 1. Node.js và Dependencies
```bash
node >= 24.0.0
npm >= 10.0.0
```

### 2. VNPAY Sandbox Credentials

Tạo file `.env.test` từ template:
```bash
cp .env.test.example .env.test
```

Điền thông tin từ VNPAY Sandbox:
- **TmnCode**: Mã merchant (ví dụ: QEZXV06S)
- **HashSecret**: Khóa bí mật 32 ký tự
- **Payment URL**: https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
- **Query URL**: https://sandbox.vnpayment.vn/merchant_webapi/api/transaction

### 3. Database
Test cần PostgreSQL database:
```bash
# Tạo test database
createdb brewlite_test

# Run migrations
npm run prisma:migrate:deploy --prefix apps/api
```

## Cài Đặt

```bash
# Install dependencies
npm ci
npm ci --prefix apps/api
npm ci --prefix apps/web

# Install Playwright browsers
npx playwright install --with-deps chromium
```

## Chạy Tests

### Local Development
```bash
# Chạy tất cả VNPAY tests
npm run test:e2e:vnpay --prefix apps/web

# Chạy với UI mode (interactive)
npm run test:e2e:vnpay:ui --prefix apps/web

# Chạy với debug mode (breakpoints)
npm run test:e2e:vnpay:debug --prefix apps/web

# Chạy một test file cụ thể
npx playwright test tests/e2e/vnpay/vnpay-happy-path.spec.ts
```

### CI/CD (GitHub Actions)
Workflow tự động chạy khi:
- Push to main/develop branches
- Pull requests to main
- Daily at 2 AM UTC
- Manual trigger (workflow_dispatch)

## Cấu Trúc Test Suite

### Test Files (9 specs, ~35 test cases)

1. **vnpay-happy-path.spec.ts** - Luồng thành công cơ bản
   - Checkout → VNPAY QR → IPN → Confirmation

2. **vnpay-signature.spec.ts** - Xác thực chữ ký
   - Valid signature accepted
   - Invalid signature rejected
   - Tampered params detection

3. **vnpay-idempotency.spec.ts** - Retry safety
   - Retry after FAILED
   - Block during PROCESSING (409)
   - Multiple keys per order

4. **vnpay-timeout-recovery.spec.ts** - Checkout khi VNPay chưa trả kết quả
   - Kiểm tra trạng thái hoặc hủy đơn ngay tại checkout
   - Nhận kết quả đến muộn và hủy đơn sau khi tải lại trang
   - Thanh toán giỏ mới sau khi thay thế đơn cũ

5. **vnpay-ipn-race.spec.ts** - Race conditions
   - IPN arrives before user return
   - Duplicate IPN handling
   - Status reflects IPN update

6. **vnpay-double-click.spec.ts** - Click protection
   - Double click sends only one POST
   - Status query before replay
   - Concurrent attempts blocked

7. **vnpay-network-loss.spec.ts** - Network issues
   - User returns after hours
   - PROCESSING state persists
   - Inquiry discovers delayed success

8. **vnpay-polling.spec.ts** - Polling behavior
   - 5-second interval polling
   - Stop on SUCCEEDED/FAILED
   - Correct Idempotency-Key header

9. **vnpay-error-messages.spec.ts** - Vietnamese UX
   - Error messages in Vietnamese
   - Amount formatting
   - Instructions và button labels

### Helpers & Utilities

**VnpayTestHelper** (`helpers/vnpay-test-helper.ts`):
- `computeSignature()`: HMACSHA512 signature calculation
- `simulateIpn()`: Trigger test IPN endpoint
- `verifyPaymentUrl()`: Validate payment URL signatures

**Auth Helper** (`helpers/auth-helper.ts`):
- `createTestUser()`: Generate unique test users (e2e_vnpay_xxx)

**Cart Helper** (`helpers/cart-helper.ts`):
- `setupCartWithProduct()`: Add product to cart
- `proceedToCheckout()`: Navigate to checkout

**Assertion Helper** (`helpers/assertion-helper.ts`):
- `assertPaymentStatus()`: Query API và verify order status

**Fixtures** (`fixtures/vnpay-fixtures.ts`):
- Auto-inject: vnpayHelper, testUser, apiUrl
- Load credentials từ environment variables

## Test Data Strategy

### User Generation
- Format: `e2e_vnpay_[16-char-uuid]`
- Mỗi test tạo user mới
- Password fixed: `E2e-vnpay-password-123`

### Idempotency Keys
- Unique UUID per payment attempt
- Preserved across retries for same payment

### No Cleanup
- Test data không bị xóa sau khi chạy
- Preserve audit trail cho investigation
- Test database có thể reset manually khi cần

## Troubleshooting

### Test Fails với "Missing VNPAY credentials"
```bash
# Kiểm tra .env.test exists và có đầy đủ credentials
cat .env.test

# Verify VNPAY_TMN_CODE và VNPAY_HASH_SECRET được set
echo $VNPAY_TMN_CODE
echo $VNPAY_HASH_SECRET
```

### VNPAY Sandbox Unavailable
Tests tự động skip nếu sandbox down. Check logs:
```bash
# View HTML report
npx playwright show-report
```

### Database Connection Issues
```bash
# Verify database exists
psql -l | grep brewlite_test

# Check migrations
npm run prisma:migrate:status --prefix apps/api
```

### Flaky Tests
- Tests designed to be deterministic
- Nếu gặp flakiness, check network latency
- Có thể increase timeout trong playwright.config.ts

## CI/CD Setup

### GitHub Repository Secrets
Add secrets tại Repository Settings → Secrets:

- `VNPAY_TMN_CODE_SANDBOX`: Merchant code từ VNPAY
- `VNPAY_HASH_SECRET_SANDBOX`: 32-character secret key

### Workflow Configuration
File: `.github/workflows/vnpay-e2e.yml`

Features:
- PostgreSQL service container
- Playwright browser installation
- Test artifacts upload (reports, videos)
- 15-minute timeout
- Daily scheduled runs

## Performance Targets

- **Full suite**: < 5 phút
- **Single test**: < 30 giây (average)
- **Test startup**: < 2 phút (servers + database)

## Best Practices

### Writing New Tests
1. Import từ fixtures để auto-inject dependencies
2. Use stable role-based selectors, không CSS selectors
3. Include descriptive error messages
4. Test một scenario per test case
5. Cleanup không cần thiết (audit trail)

### Debugging
```bash
# Run with UI mode
npm run test:e2e:vnpay:ui --prefix apps/web

# Run với headed browser
npx playwright test --headed

# Run với debug console
npm run test:e2e:vnpay:debug --prefix apps/web
```

### Maintenance
- Update credentials quarterly
- Review test data growth monthly
- Monitor test execution time
- Keep documentation in sync với code changes

## Architecture

### Test-Only IPN Endpoint
Location: `apps/api/src/modules/payments/controllers/payments.controller.ts`

Endpoint `POST /payments/test/vnpay/simulate-ipn`:
- Chỉ active khi NODE_ENV=test
- Reuse production IPN handler logic
- Allows tests without public URL

### Real VNPAY Integration
- Tests gọi real VNPAY Sandbox API
- Verify signature computation accuracy
- Detect configuration errors early

### Sequential Execution
- Workers=1 trong playwright.config.ts
- Tránh race conditions trong shared database
- Predictable test execution order

## Contact

Để câu hỏi hoặc issues về test suite:
- Check existing tests làm reference
- Review this README
- Check Playwright documentation: https://playwright.dev

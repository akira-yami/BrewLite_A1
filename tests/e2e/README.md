# Checkout E2E gate

Test: `apps/web/tests/e2e/checkout.spec.ts`. Browser Chromium gọi API thật,
database PostgreSQL thật và mock gateway deterministic; không chặn HTTP bằng route mock.

## Chạy local

1. Tạo database riêng có tên kết thúc bằng `_e2e`. Đặt `DATABASE_URL` tới database này,
   `JWT_SECRET` tối thiểu 32 ký tự và `NEXT_PUBLIC_API_URL=http://localhost:3101/api/v1`.
2. Trong `apps/api`: `npm ci`, `npm run prisma:generate`, `npm run prisma:deploy`,
   `node --import=tsx prisma/seed-e2e.ts`, `npm run build`.
3. Trong `apps/web`: `npm ci`, `npm run build`, `npx playwright install chromium`,
   `npm run test:e2e`. Trên Windows nếu Turbopack lỗi xử lý CSS, build bằng
   `npm run build -- --webpack`.

Playwright tự mở API cổng 3101 và web cổng 3100, từ chối dùng server có sẵn.
Mock gateway bật `MOCK_PAYMENT_MODE=deterministic`: CARD trả FAILED,
E_WALLET trả SUCCEEDED. Không bật mode này cho kịch bản mô phỏng random.
Test tạo tài khoản riêng mỗi lần và giữ dữ liệu để chẩn đoán; dùng DB riêng có thể bỏ sau test.

## Điều kiện đạt

- Menu → thêm món bằng UI → cart → checkout → payment → confirmation.
- CARD thất bại, giỏ còn nguyên, chọn E_WALLET và retry **cùng order** thành công.
- API lưu order PAID và giỏ hàng trống sau thành công.
- Bất kỳ assertion nào thất bại đều làm job `Checkout E2E gate` thất bại;
  trace và HTML report được upload khi chạy CI.

Để chặn merge trên GitHub, thêm check `Checkout E2E gate` vào required status checks
trong branch protection/ruleset. Workflow chỉ tạo check; không tự thay đổi ruleset.

Phạm vi retry: key cũ replay kết quả; key mới cho phép PAYMENT_FAILED → PENDING
trước gateway, khi reservation còn hạn. Chống hai key khác nhau cùng gọi gateway
trên order PENDING và reconciliation PROCESSING là các hạng mục payment riêng.

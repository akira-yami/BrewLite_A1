# Hướng dẫn chạy Test và Xuất Log (Quick Test & Logging Guide)

> Tài liệu hướng dẫn công thức chạy một bài test bất kỳ và lưu kết quả vào thư mục log tùy chọn.

---

## 1. Công thức tổng quát (PowerShell)

```powershell
<Lệnh_chạy_test> *>&1 | Tee-Object -FilePath "<Thư_mục_lưu>/<tên_file>.log"
```

* `*>&1`: Gom cả luồng thông báo tiêu chuẩn (stdout) và cảnh báo/lỗi (stderr) vào chung file.
* `Tee-Object`: Vừa in kết quả trực tiếp ra màn hình terminal, vừa ghi vào file log.

---

## 2. Công thức theo từng loại Test

### A. Chạy 1 file Unit Test Backend (`apps/api`)
```powershell
# Chạy 1 file bất kỳ và lưu log vào thư mục logs/
npm --prefix apps/api run test -- <tên_file.spec.ts> *>&1 | Tee-Object -FilePath "logs/<tên_log>.log"

# Ví dụ cụ thể:
npm --prefix apps/api run test -- order-state-machine.spec.ts *>&1 | Tee-Object -FilePath "logs/order-state-machine.log"
npm --prefix apps/api run test -- payments.service.spec.ts *>&1 | Tee-Object -FilePath "logs/payments.service.log"
npm --prefix apps/api run test -- jwt.spec.ts *>&1 | Tee-Object -FilePath "logs/jwt-test.log"
```

### B. Chạy 1 file Integration Test Backend (Chạy với PostgreSQL)
```powershell
# Chạy 1 file integration test và lưu log:
npm --prefix apps/api run test:integration -- <tên_file.integration-spec.ts> *>&1 | Tee-Object -FilePath "logs/<tên_log>.log"

# Ví dụ cụ thể:
npm --prefix apps/api run test:integration -- inventory-concurrency.integration-spec.ts *>&1 | Tee-Object -FilePath "logs/inventory-concurrency.log"
npm --prefix apps/api run test:integration -- order-state-machine.integration-spec.ts *>&1 | Tee-Object -FilePath "logs/order-state-machine-db.log"
npm --prefix apps/api run test:integration -- orders.integration-spec.ts *>&1 | Tee-Object -FilePath "logs/orders-db.log"
```

### C. Chạy 1 file Test Web Frontend (`apps/web`)
```powershell
# Chạy 1 file test giao diện web và lưu log:
node --test apps/web/tests/<tên_file.test.mjs> *>&1 | Tee-Object -FilePath "logs/<tên_log>.log"

# Ví dụ cụ thể:
node --test apps/web/tests/cart.test.mjs *>&1 | Tee-Object -FilePath "logs/cart-test.log"
node --test apps/web/tests/menu.test.mjs *>&1 | Tee-Object -FilePath "logs/menu-test.log"
node --test apps/web/tests/auth-session.test.mjs *>&1 | Tee-Object -FilePath "logs/auth-session.log"
```

---

## 3. Cách chỉ định thư mục lưu log khác

Nếu muốn lưu vào thư mục khác (ví dụ: `my-logs/` hoặc `docs/testing/evidence/`):

```powershell
# 1. Đảm bảo thư mục tồn tại (tạo nếu chưa có)
New-Item -ItemType Directory -Force -Path "my-logs" | Out-Null

# 2. Ghi log vào thư mục đó
npm --prefix apps/api run test -- orders.service.spec.ts *>&1 | Tee-Object -FilePath "my-logs/orders.log"
```

---

## 4. Chạy lọc theo từ khóa tên Test Case (`-t`)
```powershell
# Chỉ chạy các ca có chứa từ khóa 'Idempotency' và lưu log:
npm --prefix apps/api run test -- -t "Idempotency" *>&1 | Tee-Object -FilePath "logs/idempotency.log"
```

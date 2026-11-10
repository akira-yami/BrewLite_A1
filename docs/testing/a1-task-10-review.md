# BrewLite · Bằng chứng kiểm thử Assignment 1

**Kết quả ngày 10/11/2026 lúc 20:30 (UTC+7)** — 41/41 integration test PASS trên PostgreSQL thử nghiệm. Lần chạy dùng commit nền `100d2d7` và có thêm ca thanh toán lặp trong mã nguồn local.

[Mở log chạy test](evidence/a1-task-10-test-run.txt)

## Ba ca cần trình bày

| Ca | Thao tác | Kết quả đã kiểm chứng | Mã nguồn |
|---|---|---|---|
| A1-10-A · Chuyển trạng thái sai | Dùng tài khoản barista gửi `PATCH /api/v1/staff/orders/{id}/status` để chuyển đơn từ `PAID` thẳng sang `READY`. | **PASS.** API trả `409 INVALID_ORDER_TRANSITION`. Trạng thái và lịch sử đơn trong database giữ nguyên. | [Test chuyển trạng thái](../../apps/api/test/order-state-machine.integration-spec.ts#L207) |
| A1-10-B · Thanh toán lặp | Tạo một đơn. Gửi `POST /api/v1/payments` hai lần với cùng đơn, cùng phương thức và cùng `Idempotency-Key`. | **PASS.** Lần hai trả kết quả cũ với `isRetried: true` và cùng mã giao dịch. Tổng số đơn của tài khoản chỉ tăng 1, đơn chỉ có 1 bản ghi thanh toán và cổng mô phỏng chỉ được gọi 1 lần. | [Test thanh toán lặp](../../apps/api/test/orders.integration-spec.ts#L743) |
| A1-10-C · Tranh ly cuối | Chuẩn bị nguyên liệu đủ 1 ly. Gửi hai yêu cầu `POST /api/v1/orders` đồng thời, mỗi yêu cầu đặt 1 ly. | **PASS.** Một yêu cầu trả `201`, yêu cầu còn lại trả `409`. Tồn cuối bằng 0, chỉ có 1 lượt giữ kho và 1 dòng món được đặt. | [Test đặt đồng thời](../../apps/api/test/orders.integration-spec.ts#L529) |

1. Mở log, chỉ dòng `Tests  41 passed (41)`. Tìm `PAID: đặt READY`, `keeps one order and one payment` hoặc `reserve the last drink` để thấy từng ca đã chạy.
2. Nếu cần giải thích một ca, mở ca A1-10-C. Chỉ `Promise.all` để thấy hai yêu cầu chồng lấn, rồi chỉ các dòng `expect` kiểm tra mã phản hồi và dữ liệu trong PostgreSQL. Ca này dùng cùng một tài khoản thử nghiệm cho cả hai yêu cầu.
3. Nếu thầy hỏi về thanh toán, mở ca A1-10-B và chỉ hai dòng đếm `Order` và `Payment`. API, xử lý nghiệp vụ và PostgreSQL chạy thật. Cổng thanh toán trả kết quả thành công giả lập.

> Dạ, nhóm đã chạy 41 integration test trên PostgreSQL và tất cả đều pass. Em mở ca hai yêu cầu tranh ly cuối. Kho chỉ đủ một ly. API nhận một đơn và từ chối yêu cầu còn lại. Test kiểm tra cả trong database và xác nhận tồn cuối bằng 0, chỉ có một lượt giữ kho.

## Lệnh chạy lại

Chạy từ thư mục gốc của repo. Đặt `DATABASE_URL` và `SMOKE_DATABASE_URL` trỏ cùng một database PostgreSQL thử nghiệm có tên bắt đầu bằng `brewlite_foundation_smoke`, rồi dùng cấu hình JWT local dành cho test.

```powershell
git rev-parse --short HEAD
npm.cmd --prefix apps/api run prisma:deploy
npm.cmd --prefix apps/api run test:integration -- order-state-machine.integration-spec.ts inventory-concurrency.integration-spec.ts orders.integration-spec.ts --reporter=verbose
```

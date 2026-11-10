# 📋 Tổng Hợp Bằng Chứng Kiểm Thử (Test Evidence Summary) - BrewLite

Tài liệu này tổng hợp toàn bộ bằng chứng thực nghiệm chứng minh hệ thống BrewLite vượt qua đầy đủ 3 tiêu chí chấm điểm kỹ thuật cốt lõi:

| Tiêu chí chấm điểm | Trạng thái | Số test case | File log chi tiết |
| :--- | :---: | :---: | :--- |
| **(a) Chặn chuyển trạng thái sai** |  **PASS** | 16 tests | [`test-case-a-state-machine.log`](./test-case-a-state-machine.log) |
| **(b) 2 lần Idempotency-Key chỉ tạo 1 lần thanh toán** |  **PASS** | 3 tests | [`test-case-b-idempotency.log`](./test-case-b-idempotency.log) |
| **(c) Đặt đồng thời không vượt tồn kho** |  **PASS** | 7 tests | [`test-case-c-inventory-concurrency.log`](./test-case-c-inventory-concurrency.log) |
| **Master Demo (Chạy toàn bộ 3 bài trên PostgreSQL)** |  **PASS** | **41 tests** | [`test-all-demo.log`](./test-all-demo.log) |

---

## 📂 Danh mục các file log trong thư mục `logs/`

1. **[`test-case-a-state-machine.log`](./test-case-a-state-machine.log)**
   * **Mục tiêu:** Kiểm chứng máy trạng thái đơn hàng (Order State Machine).
   * **Chứng minh:** Barista gửi API `PATCH /staff/orders/:id/status` để nhảy cóc từ `PAID` sang `READY` bị trả về mã lỗi HTTP `409 Conflict` (`INVALID_ORDER_TRANSITION`). Dữ liệu trạng thái và bảng lịch sử trong PostgreSQL không hề bị thay đổi.
   * **File mã nguồn test:** `apps/api/test/order-state-machine.integration-spec.ts`

2. **[`test-case-b-idempotency.log`](./test-case-b-idempotency.log)**
   * **Mục tiêu:** Kiểm chứng cơ chế chống thanh toán trùng lặp khi người dùng double-click hoặc do mạng chậm.
   * **Chứng minh:** Gửi liên tiếp 2 request `POST /api/v1/payments` với cùng một `Idempotency-Key`. Lần 1 xử lý thanh toán thật; lần 2 trả lại kết quả cũ (`isRetried: true`), cổng thanh toán bên thứ ba chỉ bị gọi đúng 1 lần, và database chỉ ghi nhận duy nhất 1 bản ghi thanh toán. Đồng thời ném lỗi `409 PAYMENT_IN_PROGRESS` nếu request thứ 2 gửi đến khi request 1 chưa hoàn tất.
   * **File mã nguồn test:** `apps/api/test/orders.integration-spec.ts#L743` & `apps/api/src/modules/payments/payments-idempotency.integration.spec.ts`

3. **[`test-case-c-inventory-concurrency.log`](./test-case-c-inventory-concurrency.log)**
   * **Mục tiêu:** Kiểm chứng hiện tượng tranh mua ly cuối cùng (Race Condition / Overselling).
   * **Chứng minh:** Khi kho chỉ còn đủ đúng 1 ly duy nhất, 2 khách hàng gửi `POST /api/v1/orders` tại cùng một mili-giây. Nhờ Khóa Lạc Quan (OCC) với `version: Int` và câu lệnh Atomic `UPDATE ... WHERE stock_quantity >= :qty`, chỉ có đúng 1 khách đặt thành công (`HTTP 201`), khách còn lại nhận `HTTP 409 Conflict`. Tồn kho cuối cùng chạm đúng 0g, không bao giờ bị âm.
   * **File mã nguồn test:** `apps/api/test/inventory-concurrency.integration-spec.ts#L364` & `apps/api/test/orders.integration-spec.ts#L529`

4. **[`test-all-demo.log`](./test-all-demo.log)**
   * Toàn bộ log console khi chạy lệnh `npm run test:demo`.
   * Chạy song song 41 bài test tích hợp trên database PostgreSQL thật và đạt tỷ lệ thành công 100%.

---

## 🚀 Cách tự chạy lại để xác minh bất kỳ lúc nào:

Chỉ cần mở PowerShell tại thư mục gốc và gõ:
```powershell
npm run test:demo
```

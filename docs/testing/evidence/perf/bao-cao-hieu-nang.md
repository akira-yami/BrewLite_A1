# Báo cáo Đo lường Hiệu năng Hệ thống BrewLite (Mục 4.2)

> **Căn cứ đề bài Bài tập lớn BrewLite — Môn Công nghệ Phần mềm:**  
> **Mục 4.2 Yêu cầu phi chức năng (Non-functional Requirements):**  
> *"Thời gian phản hồi API < 500ms với dữ liệu mẫu."*  
> Dưới đây là biên bản kết quả đo lường tải thực tế được thực hiện trên môi trường máy trạm cục bộ với 20 client đồng thời.

---

## 1. Thông số môi trường kiểm thử (Test Environment)

| Thông số | Giá trị thực tế |
| :--- | :--- |
| **Hệ điều hành** | Windows 11 Home Single Language (Build 26200, 64-bit) |
| **Bộ vi xử lý (CPU)** | 13th Gen Intel(R) Core(TM) i7-13620H (16 vCPUs @ 4.90 GHz) |
| **Bộ nhớ RAM** | 16 GB DDR5 |
| **Nền tảng thực thi** | Node.js v24.21.0 / NestJS v12.0.1 / Prisma ORM v7.10.0 |
| **Cơ sở dữ liệu** | PostgreSQL (kết nối nội bộ `localhost:5432`, database `brewlite`) |
| **Địa chỉ API đo tải** | `http://localhost:3001/api/v1` |
| **Công cụ đo tải** | Script chuẩn [scripts/run-load-test-nfr01.mjs](../../../../scripts/run-load-test-nfr01.mjs) |

---

## 2. Dữ liệu mẫu đo tải (Benchmark Dataset)

Bộ dữ liệu mẫu được khởi tạo tự động qua script [scripts/seed-perf-nfr01.mjs](../../../../scripts/seed-perf-nfr01.mjs) nhằm đảm bảo hệ thống chịu tải trên cơ sở dữ liệu lớn thực tế:

* **Sản phẩm (Products):** **100** sản phẩm đồ uống đang kinh doanh (`is_active = true`).
* **Biến thể kích cỡ (Variants):** **300** biến thể (Size S, M, L) có công thức cấu thành từ nguyên liệu.
* **Topping:** **30** loại topping đi kèm.
* **Lịch sử đơn hàng (Orders):** **6.768+** đơn hàng mẫu đã ghi nhận trong cơ sở dữ liệu.
* **Tài khoản kiểm thử:** 6 tài khoản (`customer01`, `perf_user_01` → `perf_user_05`) được cấp phát JWT token để thực thi đồng thời.

---

## 3. Điều kiện và Phương pháp đo tải

* **Số lượng tác nhân đồng thời (Concurrency):** **20 clients** gửi request song song liên tục.
* **Thời gian làm nóng (Warm-up):** 30 giây (đưa CPU cache, connection pool vào trạng thái ổn định).
* **Thời gian đo chính thức:** 60 giây liên tục cho từng API endpoint.
* **Chỉ số đo lường:**
  * **Thông lượng (Throughput):** Số lượng request xử lý thành công trên mỗi giây (req/sec).
  * **Độ trễ phân vị (Latency Percentiles):** Min, Avg, p50 (trung vị), p90, **p95 (ngưỡng đối soát)**, p99, Max.
  * **Tỷ lệ lỗi:** Tỷ lệ mã lỗi 5xx hoặc timeout (yêu cầu < 1.0%).

---

## 4. Bảng tổng hợp kết quả đo tải thực tế

Dữ liệu được trích xuất từ kết quả đo thực tế [docs/testing/evidence/perf/nfr-01-results.json](nfr-01-results.json):

| API Endpoint | Phương thức | Tổng request | Thông lượng (RPS) | p50 (ms) | p90 (ms) | **p95 thực tế** | Ngưỡng đề bài A1 | Tỷ lệ lỗi 5xx | Đánh giá |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Danh sách Menu** (`/products`) | `GET` | 7.162 | 119,1 req/s | 166,24 ms | 190,31 ms | **199,12 ms** | < 500 ms | 0% | **ĐẠT** |
| **Chi tiết món** (`/products/:id`) | `GET` | 47.185 | 786,3 req/s | 19,58 ms | 46,12 ms | **52,68 ms** | < 500 ms | 0% | **ĐẠT** |
| **Lịch sử đơn** (`/orders/me`) | `GET` | 59.597 | 993,1 req/s | 18,78 ms | 26,64 ms | **28,92 ms** | < 500 ms | 0% | **ĐẠT** |
| **Tạo đơn hàng** (`/orders`) | `POST` | 9.833 | 163,6 req/s | 118,93 ms | 147,71 ms | **189,08 ms** | < 500 ms | 0% | **ĐẠT** |
| **Khởi tạo VNPay** (`/payments`) | `POST` | 100 | — | 4,12 ms | 4,73 ms | **5,02 ms** | < 500 ms | 0% | **ĐẠT** |

> **Nhận xét tiêu chuẩn:** Tất cả 5 API trọng yếu đều có độ trễ **p95 < 200 ms**, vượt xa yêu cầu của đề bài A1 (ngưỡng tối đa cho phép là 500 ms).

---

## 5. Phân tích chi tiết theo từng nghiệp vụ

### 5.1. Nhóm API đọc dữ liệu (`GET /products`, `GET /products/:id`, `GET /orders/me`)
* **Hiệu năng:** Đạt thông lượng cực cao (từ 119 req/s đến gần 1.000 req/s). 
* **Độ trễ:** Thời gian phản hồi p95 chỉ dao động từ **28 ms đến 199 ms**.
* **Nguyên nhân tối ưu:**
  * Bảng `products` và `orders` được đánh chỉ mục (Index) đầy đủ trên các trường `is_active`, `userId`, `createdAt`.
  * Truy vấn Prisma sử dụng projection gọn gàng, không tải dữ liệu thừa.

### 5.2. Nghiệp vụ tạo đơn hàng đồng thời (`POST /orders` - Task 6 & Task 10.3)
* **Thử thách:** Khi 20 client đồng thời đặt các món nước cùng lúc, hệ thống phải vừa tính giá, kiểm tra công thức nguyên liệu, vừa bảo đảm không bị bán âm tồn kho (chống overselling).
* **Cơ chế:** Áp dụng **Optimistic Locking + Serializable Transaction** kết hợp retry tự động.
* **Kết quả:** Độ trễ p95 đạt **189,08 ms** (dưới 500 ms). Tồn kho nguyên liệu luôn được bảo toàn chính xác, không xảy ra sai lệch số lượng.

### 5.3. Nghiệp vụ thanh toán idempotent (`POST /payments` - Task 8 & Task 10.2)
* **Kết quả:** Chuỗi 100 giao dịch thanh toán mẫu đều đạt HTTP 200 thành công 100%.
* **Độ trễ p95:** Chỉ **5,02 ms** cho bước sinh liên kết thanh toán VNPay và lưu trạng thái `PENDING` / `PROCESSING`.
* **Cơ chế Idempotency:** Header `Idempotency-Key` bảo vệ tuyệt đối, đảm bảo cùng một yêu cầu thanh toán không bao giờ trừ tiền 2 lần.

---

## 6. Hướng dẫn tái hiện kiểm thử (Reproduction Steps)

Để tự kiểm chứng và lấy lại số liệu thực tế bất cứ lúc nào trên máy:

```bash
# Bước 1: Khởi tạo dữ liệu mẫu hiệu năng
npm run perf:seed

# Bước 2: Bật API server (Terminal 1)
npm --prefix apps/api run start:dev

# Bước 3: Chạy kịch bản đo tải 20 clients (Terminal 2)
npm run perf:test
```

*File kết quả thô định dạng JSON được cập nhật tự động tại:* [docs/testing/evidence/perf/nfr-01-results.json](nfr-01-results.json).

---

## 7. Kết luận

Hệ thống **BrewLite** đáp ứng toàn diện và vượt mức yêu cầu phi chức năng tại **Mục 4.2 của Đề bài Bài tập lớn (Công nghệ Phần mềm)**:
1. **Thời gian phản hồi:** p95 toàn bộ các API từ **5 ms đến 199 ms**, thấp hơn nhiều so với giới hạn **< 500 ms**.
2. **Khả năng chịu tải:** Hoạt động ổn định, không nghẽn cổ chai với 20 client gửi yêu cầu đồng thời liên tục.
3. **Độ tin cậy dữ liệu:** Đảm bảo toàn vẹn giao dịch và kiểm soát tồn kho chính xác theo tiêu chí của Task 10.

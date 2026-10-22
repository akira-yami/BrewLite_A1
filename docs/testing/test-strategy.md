# Chiến lược kiểm thử BrewLite

## 1. Mục tiêu

Kiểm thử tập trung vào Acceptance Criteria của 10 task và các rủi ro nghiệp vụ của Task 10. Test không chỉ chứng minh endpoint trả 2xx mà phải chứng minh state, transaction và dữ liệu sau xử lý là đúng.

## 2. Bố trí test

```text
apps/api/src/**/**.spec.ts        # unit test đặt gần code
apps/api/test/*.integration-spec.ts # PostgreSQL thật: foundation, catalog seed, S1 HTTP
apps/api/test/*.e2e-spec.ts         # HTTP readiness/Auth với provider mock
apps/web/tests/*.test.mjs           # Node test cho logic/store/API và cấu trúc UI
tests/e2e/                         # chỗ dự kiến cho browser E2E toàn hệ thống; chưa có suite
```

## 3. Ma trận kiểm thử tối thiểu

Các TC dưới đây là yêu cầu kiểm chứng, không phải danh sách đều đã PASS. Snapshot 22/10/2026: có test Catalog/Auth, cart/session, DTO/pricing/mapper, mock gateway, DB constraints và seed. TC-03..10 chưa có đầy đủ service/API tích hợp. Foundation test chứng minh CHECK/unique/FK hoặc rollback SQL, chưa chứng minh state machine, payment orchestration và chống oversell qua request đồng thời. Xem [mapping từng test](../traceability-matrix.md).

| ID | Phạm vi | Test chính | Kết quả mong đợi |
|---|---|---|---|
| TC-01 | Catalog | `GET /products`, detail, size/topping active | Response đúng contract; loading/empty/error được xử lý ở UI |
| TC-02 | Auth | register/login, username trùng, password sai | bcrypt hash; JWT hợp lệ; lỗi không lộ passwordHash |
| TC-03 | Order | tạo order từ cart hợp lệ | Backend tính lại giá, tạo `PENDING`, item snapshot và reservation |
| TC-04 | State Machine | thử transition không có trong sơ đồ | Bị chặn với `ORDER_INVALID_TRANSITION`; state DB không đổi |
| TC-05 | Payment Idempotency | gửi đồng thời/lặp cùng Idempotency-Key | Chỉ một payment attempt theo key; không gọi gateway/làm side effect lần hai |
| TC-06 | Payment Retry | payment fail rồi retry bằng key mới | Có `PAYMENT_FAILED -> PENDING`; attempt mới độc lập; order chỉ có tối đa một payment `SUCCEEDED` |
| TC-07 | Concurrent Stock | nhiều request mua cùng variant | Không có stock âm; request vượt tồn trả `OUT_OF_STOCK`/`INVENTORY_CONFLICT` |
| TC-08 | Coupon | dùng coupon, fail/cancel/expire | `RESERVED` không bị tính vĩnh viễn; success -> `CONSUMED`; cancel/expire -> release |
| TC-09 | Loyalty | order thanh toán thành công và request lặp | Mỗi order chỉ cộng `EARN` một lần |
| TC-10 | E2E | menu -> cart -> login -> order -> payment -> history | Luồng MVP hoàn thành và lịch sử chứa đúng order |
| TC-11 | Đường/đá | null/thiếu, 0/100, -1/101, số thập phân/chuỗi; reload giỏ cũ/mới và tách/gộp dòng | DTO và CHECK từ chối dữ liệu sai; 0 được giữ; response phản ánh snapshot; tùy chọn không đổi giá |
| TC-12 | Ghi chú món | thiếu/null/trắng, trim, 500/501 ký tự, sai kiểu; reload và tách/gộp dòng theo note | DTO chuẩn hóa/validate; VARCHAR(500) bảo vệ giới hạn; mapper trả snapshot; giỏ giữ note và không đổi giá |

Đã có test DTO/mapper trong module orders, integration CHECK/nullable trên PostgreSQL và `apps/web/tests/cart-store.test.mjs` (`npm test` trong web). Test giỏ kiểm tra payload không chứa giá client, giữ 0 khi reload, chuyển giỏ cũ sang null, tách/gộp dòng và tổng tiền. Khi triển khai OrdersService/checkout/barista, thêm E2E để chứng minh đường/đá đi từ UI qua POST/GET đến màn pha chế và reservation cộng đúng quantity của các dòng cùng variant.

## 4. Ba test bắt buộc của Task 10

### 4.1 Invalid transition

Ví dụ order `PENDING` gọi thẳng `READY`. Assert HTTP `409`, error code đúng và không xuất hiện status history giả.

### 4.2 Idempotency concurrent

Gửi hai request cùng `Idempotency-Key` và cùng payload gần như đồng thời. Assert cùng kết quả nghiệp vụ, một record payment theo key và side effect chỉ xảy ra một lần.

### 4.3 Concurrent inventory

Tạo stock nhỏ hơn tổng quantity của nhiều request đồng thời. Assert tổng quantity được chấp nhận không vượt stock ban đầu và stock cuối `>= 0`.

## 5. Definition of Done liên quan test

- Business rule mới/sửa có unit test.
- Transaction/repository quan trọng có integration test.
- Luồng acceptance được kiểm tra thủ công hoặc e2e.
- Test phải độc lập, seed/fixture xác định được và không phụ thuộc thứ tự chạy.

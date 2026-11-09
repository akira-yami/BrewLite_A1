# Bảng Nghiệm Thu — MockGateway Config & VNPAY QueryServerIP
**Cập nhật:** 2026-11-09 · Branch: `Kiet-Payment-Idempotency-PaymentUI`  
**Bằng chứng:** chạy trực tiếp trên máy local, không tự suy luận

---

## 1. Quyết Định Kiến Trúc & Hướng Đi Kỹ Thuật (Architectural Decisions)

### 1.1 Xóa `MOCK_PAYMENT_MODE=deterministic` khỏi cấu hình mặc định

**Hướng đi được lựa chọn:**  
Loại bỏ `MOCK_PAYMENT_MODE=deterministic` khỏi `.env.example` (root) và đổi default trong `compose.yaml` từ `deterministic` → `random`. Biến này chỉ tồn tại trong CI (`ci.yml` job `API E2E tests`) nơi nó được set đúng mục đích.

**Lý do lựa chọn:**  
- Comment trong `mock-gateway.service.ts` ghi rõ: *"Chỉ bật trong môi trường smoke/E2E của mock gateway"*.
- Khi `deterministic` được set trên Railway Production: CARD luôn thất bại bất kể số dư thực, E_WALLET luôn thành công với `gatewayTransactionId = MOCK_<UUID>` — không phản ánh hành vi thực tế.
- Mode `random` (80% thành công, delay 1-2 giây) mô phỏng latency và failure rate thực tế hơn cho demo và staging.
- VNPAY gateway đi qua path riêng biệt (`vnpayGateway.createPaymentUrl`), không bị ảnh hưởng bởi `MOCK_PAYMENT_MODE`.

**Phân tích giải pháp thay thế (Trade-off Analysis):**

| Giải pháp | Lý do loại bỏ |
|---|---|
| Giữ `deterministic` trên production | E_WALLET đánh dấu PAID không có giao dịch thật; CARD luôn fail gây nhầm lẫn khi demo |
| Xóa hoàn toàn MockGateway | Phá vỡ CI pipeline hiện tại đang dùng `deterministic` mode; cần refactor lớn không cần thiết |
| Thêm biến mới `MOCK_GATEWAY_MODE` | Naming không nhất quán với code hiện tại; tạo confusion giữa 2 biến |

**Giá trị mang lại:**  
- Ngắn hạn: Demo environment hoạt động thực tế hơn — 20% giao dịch sẽ fail ngẫu nhiên, cho phép nhóm demo flow lỗi tự nhiên.
- Dài hạn: Khi deploy production thật, behavior đã gần với thực tế; không cần nhớ xóa biến CI khỏi production config.

---

### 1.2 Không điền `VNPAY_QUERY_SERVER_IP` trên Railway Hobby Plan

**Hướng đi được lựa chọn:**  
Để `VNPAY_QUERY_SERVER_IP` trống trên Railway. Code đã xử lý gracefully: khi thiếu biến này, `payment-recovery.service.ts` trả về `finalizeUnknown(..., 'VNPAY_QUERY_SERVER_IP_NOT_CONFIGURED')` thay vì crash hoặc gọi với IP sai.

**Lý do lựa chọn:**  
Railway Hobby Plan không cấp Static Outbound IP (xác nhận qua Settings → Networking — không có mục "Static Outbound IP"). VNPAY yêu cầu IP của server gửi QueryDr request phải khớp với IP đã đăng ký trên Merchant Portal. Điền IP ngẫu nhiên/sai sẽ khiến tất cả QueryDr calls bị VNPAY từ chối với lỗi xác thực, tệ hơn là để trống.

**Tác động thực tế:**  
- ✅ IPN settlement (`GET /payments/vnpay/ipn`) hoạt động bình thường — không liên quan đến biến này.
- ✅ Tạo Payment URL (`POST /payments`) hoạt động bình thường.
- ⚠️ Operator recovery (`POST /:paymentId/recovery`) trả về `UNKNOWN` với code `VNPAY_QUERY_SERVER_IP_NOT_CONFIGURED` — operator cần xử lý manual review thay vì QueryDr tự động.

**Điều kiện để bật QueryDr trong tương lai:**  
Upgrade Railway lên Pro/Team plan để có Static Outbound IP, hoặc chuyển sang hosting provider cung cấp Static IP, sau đó điền IP đó vào `VNPAY_QUERY_SERVER_IP`.

---

## 2. Hướng Dẫn Vận Hành & Khởi Chạy File Đặc Biệt (Execution Guide)

### Danh sách file thay đổi

| File | Loại thay đổi | Mục đích |
|---|---|---|
| `.env.example` | Cấu hình môi trường | Xóa `MOCK_PAYMENT_MODE=deterministic`, thêm ghi chú `VNPAY_QUERY_SERVER_IP` |
| `apps/api/.env.example` | Cấu hình môi trường API | Thêm ghi chú Railway Hobby Plan không hỗ trợ Static IP |
| `compose.yaml` | Docker Compose | Đổi default `MOCK_PAYMENT_MODE` từ `deterministic` → `random` |

### Điều kiện tiên quyết

Không cần migration database, không cần cài thêm dependency. Thay đổi chỉ ảnh hưởng đến:
1. Local dev (`.env.example`): developer copy lại `.env` từ example sẽ không còn có `deterministic` mode.
2. Docker Compose (`compose.yaml`): chạy `docker compose up` mà không set `MOCK_PAYMENT_MODE` trong `.env` sẽ dùng `random` mode.
3. Railway Production: không thay đổi gì — Railway không đọc file `.env.example`; cần tự tay xóa biến trên Railway dashboard.

### Lệnh khởi chạy

```bash
# Kiểm tra mock gateway đang chạy mode nào trong logs:
docker compose logs backend | grep -i "mock\|payment\|gateway"

# Hoặc chạy local với mode random (không set biến):
cd apps/api
npm run start:dev

# Chạy local với mode deterministic (CI):
MOCK_PAYMENT_MODE=deterministic npm run start:dev
```

### Thao tác cần làm thủ công trên Railway Dashboard

```
Railway API service → Variables → Tìm MOCK_PAYMENT_MODE → Xóa biến này
(hoặc đổi giá trị thành "random" nếu muốn giữ rõ ràng)
```

Sau khi xóa, Railway tự động redeploy. Behavior mới:
- E_WALLET: 80% SUCCEEDED, 20% FAILED, delay 1-2 giây
- CARD: 80% SUCCEEDED, 20% FAILED, delay 1-2 giây
- VNPAY: không thay đổi — đi qua real gateway

### Kết quả mong đợi (Expected Output)

Sau khi xóa `MOCK_PAYMENT_MODE` trên Railway và redeploy:
```
[MockGatewayService] Bắt đầu giả lập thanh toán E_WALLET với số tiền 50000...
[MockGatewayService] [+] Thanh toán THÀNH CÔNG. Mã giao dịch Gateway: MOCK_E_WALLET_A1B2C3D4
```
hoặc (20% trường hợp):
```
[MockGatewayService] [-] Thanh toán THẤT BẠI. Mã lỗi: INSUFFICIENT_FUNDS
```

---

## 3. Kết quả Tests (Bằng chứng nghiệm thu)

| Hạng mục | Kết quả | Lệnh kiểm tra |
|---|---|---|
| TypeScript API | ✅ 0 errors | `npm run typecheck --prefix apps/api` |
| TypeScript Web | ✅ 0 errors | `npm run typecheck --prefix apps/web` |
| Unit tests API | ✅ 393/393 passed (36 files) | `npx vitest run` tại `apps/api` |
| Unit tests Web | ✅ 87/87 passed | `npm test --prefix apps/web` |
| Lint API | ✅ 0 errors (warnings pre-existing) | `npm run lint --prefix apps/api` |
| Lint Web | ✅ 0 errors (8 warnings pre-existing) | `npm run lint --prefix apps/web` |
| env-config tests | ✅ 5/5 passed | `node --test scripts/env-config.test.mjs` |
| compose-config tests | ✅ 4/4 passed | `node --test scripts/compose-config.test.mjs` |
| check-docs | ✅ 27 files, 138 links OK | `node scripts/check-docs.mjs` |

---

## 4. Trạng thái Railway Production (Tại thời điểm bàn giao)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| API service | ✅ Online | `api-production-1be6.up.railway.app` |
| Web service | ✅ Online | Railway web domain |
| `MOCK_PAYMENT_MODE` | ⚠️ Còn `deterministic` | **Cần xóa thủ công trên Railway dashboard** |
| `VNPAY_ENABLED` | ✅ `true` | Sandbox credentials đã set |
| `NEXT_PUBLIC_VNPAY_ENABLED` | ⚠️ `false` | Chờ VNPAY xác nhận IPN registration → đổi thành `true` |
| `VNPAY_QUERY_SERVER_IP` | ⚠️ Trống | Railway Hobby Plan không có Static Outbound IP — QueryDr bị skip, IPN vẫn OK |
| IPN URL đã đăng ký với VNPAY | ⚠️ Chưa xác nhận | URL: `https://api-production-1be6.up.railway.app/api/v1/payments/vnpay/ipn` |

---

## 5. Checklist Bàn Giao

- ✅ Code: Xóa `MOCK_PAYMENT_MODE=deterministic` khỏi `.env.example` (root)
- ✅ Code: Thêm ghi chú `VNPAY_QUERY_SERVER_IP` Railway limitation vào cả 2 `.env.example`
- ✅ Code: Đổi `compose.yaml` default từ `deterministic` → `random`
- ✅ Tests: 393 API + 87 Web + 5 env-config + 4 compose-config pass
- ✅ TypeScript: 0 errors API + Web
- ✅ Docs: Biên bản bàn giao cập nhật
- ⚠️ **Việc còn lại (tay):** Xóa `MOCK_PAYMENT_MODE` khỏi Railway API Variables
- ⚠️ **Việc còn lại (tay):** Đăng ký IPN URL với VNPAY Merchant Portal
- ⚠️ **Việc còn lại (tay):** Sau khi IPN xác nhận → đổi `NEXT_PUBLIC_VNPAY_ENABLED=true` → redeploy web

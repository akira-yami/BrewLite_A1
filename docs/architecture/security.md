# Thiết kế bảo mật BrewLite

## 1. Mục tiêu

- Bảo vệ tài khoản và dữ liệu đơn hàng của khách.
- Không để client sửa giá, tổng tiền, điểm thưởng hoặc trạng thái tùy ý.
- Chống thanh toán lặp, dò tài nguyên và lạm dụng endpoint auth/payment.
- Không đưa bí mật hoặc dữ liệu nhạy cảm vào source code, log và response.

## 2. Xác thực

- Mật khẩu băm bằng bcrypt theo yêu cầu đề bài; chọn cost phù hợp với môi trường và đo thời gian hash. Mỗi hash tự chứa salt ngẫu nhiên.
- Không log password, token, cookie, Authorization header hoặc dữ liệu thẻ.
- Access token JWT sống ngắn (gợi ý 15 phút), ký bằng secret/key lấy từ secret store hoặc biến môi trường.
- Claim tối thiểu: `sub`, `role`, `iat`, `exp`, `iss`, `aud`, `jti`.
- Xác minh đầy đủ signature, issuer, audience và expiration; không chấp nhận thuật toán từ header một cách tùy ý.
- Nếu có refresh token: lưu trong cookie `HttpOnly`, `Secure`, `SameSite=Lax/Strict`; lưu hash refresh token ở server, rotate sau mỗi lần dùng và thu hồi cả token family khi phát hiện reuse.
- Chi tiết biểu đồ luồng thực thi: xem [SD-05 & SD-06 Sequence Diagrams](./sequence-diagrams-auth.md).
- Thông báo login sai dùng chung `INVALID_CREDENTIALS` để không lộ username tồn tại.

## 3. Phân quyền

RBAC:

| Role | Quyền chính |
|---|---|
| `CUSTOMER` | Tạo/thanh toán/hủy đơn hợp lệ và xem tài nguyên của chính mình |
| `BARISTA` | Xem hàng đợi và chuyển `PAID -> PREPARING -> READY -> COMPLETED` |

`CUSTOMER` là user/khách hàng. Mock Payment Gateway là tác nhân tích hợp, không có role/JWT của người dùng. Đăng ký công khai luôn cấp CUSTOMER; tài khoản BARISTA được cấp qua quy trình nội bộ của nhóm, không nhận role từ form đăng ký. Cả khách hàng và barista dùng UC-02 để đăng nhập.

RBAC chưa đủ: API dành cho khách còn phải kiểm tra ownership theo `userId` từ JWT. Không lấy `userId` do client gửi làm căn cứ. Với order không thuộc khách, trả `404` thay vì `403` để hạn chế dò UUID. Endpoint vận hành chỉ cho BARISTA và chỉ chấp nhận transition của UC-10, không dùng quyền barista để thanh toán/hủy thay khách.

## 4. Bảo vệ dữ liệu đầu vào

- NestJS `ValidationPipe`: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- DTO giới hạn độ dài chuỗi, số item, quantity và enum.
- URL ảnh chỉ chấp nhận scheme/host cho phép; không fetch URL tùy ý từ backend để tránh SSRF.
- Prisma parameterizes query; không ghép SQL từ input. Raw SQL chỉ dùng placeholder.
- Backend tra lại variant/topping/coupon/giá; client chỉ gửi ID và số lượng.
- Cấu hình giới hạn body và timeout request để giảm DoS.

## 5. Bảo vệ phiên web

Phương án ưu tiên là refresh token trong cookie HttpOnly và access token giữ trong memory. Nếu auth hoàn toàn dựa trên cookie, bật CSRF token cho request thay đổi trạng thái. Nếu dùng Bearer token do JavaScript đọc được, CSP và chống XSS càng quan trọng.

Header tối thiểu:

- `Content-Security-Policy` phù hợp với asset thực tế.
- `Strict-Transport-Security` trên môi trường HTTPS.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `frame-ancestors 'none'` trong CSP hoặc `X-Frame-Options: DENY`.

CORS dùng allowlist chính xác theo origin môi trường, không dùng `*` khi có credentials.

## 6. Thanh toán và idempotency

- Bắt buộc `Idempotency-Key` cho `POST /payments`.
- Gắn key với user, endpoint và hash payload; cùng key khác payload trả `409`.
- Unique constraint chống race; không chỉ dựa vào check-then-insert trong Service.
- Amount lấy từ order trong database, không lấy từ request.
- Chỉ một payment thành công cho mỗi order bằng partial unique index.
- Không lưu PAN/CVV/thông tin thẻ thật. Mock gateway chỉ nhận token/phương thức giả lập.
- Không đánh dấu order `PAID` nếu kết quả gateway không xác định; lưu trạng thái có thể đối soát trong bản mở rộng.

## 7. Rate limit và chống lạm dụng

| Endpoint | Gợi ý giới hạn ban đầu |
|---|---|
| Register/Login | 5 lần/phút/IP và giới hạn theo username đã hash |
| Refresh token | 10 lần/phút/session |
| Create order | 20 lần/phút/user |
| Payment | 10 lần/phút/user, idempotency vẫn bắt buộc |
| Public catalog | Cache và giới hạn rộng hơn |

Không khóa tài khoản vĩnh viễn chỉ vì nhiều login sai; dùng backoff/rate limit để tránh kẻ xấu khóa tài khoản người khác.

## 8. Secrets và cấu hình

- `.env` nằm trong `.gitignore`; chỉ commit `.env.example` không chứa giá trị thật.
- Tách secret theo môi trường; không dùng secret mặc định trong production/demo public.
- Validate biến môi trường lúc boot và fail fast khi thiếu.
- Database user của ứng dụng chỉ có quyền cần thiết; migration có thể dùng credential riêng.
- Rotate JWT/payment/database secret khi rò rỉ; không in connection string trong log.

## 9. Logging và audit

- Mỗi request có `requestId`, log JSON gồm route, method, status, duration, userId đã pseudonymize khi cần.
- `OrderStatusHistory` ghi actor, transition, reason và timestamp.
- Payment log chỉ ghi payment ID, order ID, trạng thái, gateway reference; không ghi token bí mật.
- Sanitize exception; client nhận error code ổn định, server giữ stack trace ở môi trường tin cậy.
- Cảnh báo cho nhiều login thất bại, nhiều payment failed bất thường và transition bị từ chối.

## 10. Bảo vệ dữ liệu và quyền riêng tư

- TLS cho mọi lưu lượng ngoài local.
- Backup database được mã hóa và kiểm thử khôi phục.
- Chỉ thu thập username và dữ liệu cần thiết; chưa cần tên/địa chỉ cho pickup tại quầy.
- Không cascade delete order/payment. Khi đáp ứng yêu cầu xóa tài khoản, ẩn danh hóa thông tin định danh và giữ ledger giao dịch theo chính sách.
- Không trả `passwordHash`, `requestHash`, internal failure detail hoặc metadata gateway qua API.

## 11. Checklist kiểm thử bảo mật

- Login sai không tiết lộ username tồn tại.
- JWT hết hạn/sai issuer/sai audience bị từ chối.
- Customer không đọc/cập nhật order của user khác.
- Customer không gọi endpoint barista.
- Field thừa như `total`, `role`, `userId`, `status` bị DTO từ chối.
- Dùng cùng idempotency key khác payload bị chặn.
- Race hai payment không tạo hai bản ghi thành công.
- CORS, cookie và security headers đúng theo môi trường.
- Dependency scan và secret scan chạy trong CI.

# ADR-003: Xác thực JWT và RBAC

- Trạng thái: Chấp nhận
- Ngày: 2026-09-23

## Bối cảnh

Next.js gọi NestJS qua REST. Đề bài yêu cầu đăng ký/đăng nhập JWT, đồng thời Task 10 cần phân biệt khách hàng với Barista. Phạm vi được xác nhận lại theo sơ đồ gốc của nhóm ngày 09/10/2026: khách hàng, nhân viên quầy và Mock Payment Gateway.

## Quyết định

- Access token JWT sống ngắn, có `sub`, `role`, `iss`, `aud`, `exp`, `jti`.
- Mật khẩu băm bằng bcrypt theo yêu cầu đề bài, với cost được cấu hình và kiểm tra trên môi trường chạy.
- RBAC chỉ dùng `CUSTOMER` (user/khách hàng) và `BARISTA`; ownership check áp dụng thêm cho tài nguyên order. Mock Payment Gateway là tác nhân tích hợp, không phải role tài khoản.
- Khách và barista dùng cùng luồng đăng nhập; đăng ký công khai chỉ cấp `CUSTOMER`.
- Refresh token/cookie HttpOnly là phần khuyến nghị nếu triển khai phiên dài.

## Lý do

- JWT phù hợp frontend/backend tách riêng và guard của NestJS.
- Token sống ngắn giảm tác động khi access token bị lộ.
- RBAC cộng ownership rõ hơn việc đặt điều kiện rải rác trong controller.

## Hệ quả

- Cần quản lý secret/key, issuer/audience và thời gian hết hạn chính xác.
- Nếu cần logout/thu hồi tức thời, phải có refresh-token store hoặc denylist phù hợp.
- Không lưu token dài hạn trong localStorage nếu có thể dùng cookie HttpOnly/memory.

## Phương án loại bỏ

- Session server-side: an toàn và hợp lệ, nhưng không khớp yêu cầu JWT của đề bài.
- JWT sống dài không refresh: đơn giản nhưng rủi ro cao khi token bị lấy cắp.

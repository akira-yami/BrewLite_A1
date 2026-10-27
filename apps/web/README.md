# BrewLite Web

Frontend BrewLite sử dụng Next.js App Router, React, TypeScript và Tailwind CSS.

## Chạy local

```bash
npm ci
npm run dev
```

Ứng dụng chạy tại `http://localhost:3000`. Khi chạy ngoài Docker, tạo `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
API_INTERNAL_URL=http://localhost:3001/api/v1
```

`NEXT_PUBLIC_API_URL` được đóng vào client bundle tại thời điểm build. Khi build Docker cho môi trường khác, truyền biến này qua build argument.

## Kiểm tra

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Build production dùng `output: "standalone"` để Docker image chỉ chứa các file runtime cần thiết.

## Phiên đăng nhập (Huy S1-W2)

- `/login` và `/register` thiết lập phiên dùng chung rồi chuyển sang `/menu`.
- Menu có liên kết Đăng nhập cho khách, tên tài khoản và nút Đăng xuất khi đã đăng nhập.
- Tải lại trang kiểm tra token qua `GET /auth/me`, không tin role/user cũ trong localStorage. Phiên cũ dùng `brewlite_token` vẫn được đọc.
- Token hết hạn hoặc API có xác thực trả 401: xóa `brewlite_token`/`brewlite_user`, hủy cache truy vấn và chuyển về Login kèm thông báo. Đăng xuất ở tab khác cũng đồng bộ; giỏ hàng được giữ nguyên.
- Lỗi mạng/5xx khi kiểm tra phiên không tự xóa token; Menu có nút thử lại. Sai mật khẩu ở form Login chỉ hiển thị lỗi đăng nhập.
- Request nghiệp vụ cần đăng nhập dùng `authenticatedRequest` tại `src/features/auth/api.ts` để gửi Bearer token và xử lý 401 nhất quán.

Logout ở MVP là kết thúc phiên trên trình duyệt. JWT không được thu hồi ở server trước `exp`; không có endpoint logout/refresh mới trong phần này. Giải mã `exp` phía client chỉ phục vụ UX, backend vẫn xác minh JWT bằng signature/issuer/audience/expiration.

Kiểm tra riêng auth: `node --test tests/auth-*.test.mjs`. [Bằng chứng bàn giao](../../docs/scrum/huy-week-02-handover.md).

## Tùy chọn đường/đá

Chi tiết món cho chọn độc lập mức đường/đá: công thức chuẩn (null) hoặc 0/25/50/75/100%. Giỏ hiển thị và persist cả hai trường, giữ 0% và tự đọc giỏ cũ thiếu trường thành null. Dòng chỉ gộp khi cùng variant, tập topping và đường/đá; tùy chọn không thay đổi giá.

Chi tiết món có ô ghi chú tối đa 500 ký tự. Giỏ hiển thị văn bản thuần, trim ghi chú và chuyển rỗng thành null, persist khi reload và tách dòng khác note. Giỏ cũ thiếu note được đọc với null.

`cartStore.getOrderItems()` cung cấp payload cho checkout gồm `productVariantId`, `quantity`, `toppingIds`, `sugarLevel`, `iceLevel`, `note`, không gửi giá từ client. Luồng `/checkout` tạo order, gọi `POST /payments` với `Idempotency-Key`, chỉ xóa giỏ sau `SUCCEEDED`, rồi chuyển đến confirmation. Lịch sử/chi tiết đơn nằm ở `/orders` và `/orders/:id`; các màn có loading, empty và error/retry. `npm test` chạy test giỏ bằng Node.js 24.


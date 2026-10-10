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

## Tùy chọn đường/đá

Chi tiết món cho chọn độc lập mức đường/đá: công thức chuẩn (null) hoặc 0/25/50/75/100%. Giỏ hiển thị và persist cả hai trường, giữ 0% và tự đọc giỏ cũ thiếu trường thành null. Dòng chỉ gộp khi cùng variant, tập topping và đường/đá; tùy chọn không thay đổi giá.

`cartStore.getOrderItems()` cung cấp payload cho checkout gồm `productVariantId`, `quantity`, `toppingIds`, `sugarLevel`, `iceLevel`, không gửi giá từ client. Type tạo đơn và item response nằm ở `src/features/orders/types.ts`; checkout/API tạo đơn chưa triển khai. `npm test` chạy test giỏ bằng Node.js 24.


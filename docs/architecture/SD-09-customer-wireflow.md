# SD-09 — Luồng màn hình khách hàng

Wireflow cho Task 5.1. Client không gửi giá lên server; order và payment luôn được server xác nhận lại.

```mermaid
flowchart TD
  Menu[Menu / Product Detail] -->|Thêm món| Cart[Giỏ hàng]
  Cart -->|Sửa số lượng hoặc tùy chọn| Cart
  Cart -->|Giỏ trống| Menu
  Cart -->|Tiến hành đặt & thanh toán| Checkout[Checkout]
  Checkout -->|Chọn Ví hoặc Thẻ| CreateOrder[POST /orders]
  CreateOrder -->|Tạo đơn lỗi| KeepCart[Hiện lỗi, giữ giỏ]
  CreateOrder -->|Tạo đơn thành công| Payment[POST /payments + Idempotency-Key]
  Payment -->|Gateway / API lỗi| KeepCart
  Payment -->|paymentStatus FAILED| KeepCart
  Payment -->|paymentStatus SUCCEEDED| ClearCart[Xóa giỏ]
  ClearCart --> Confirmation[Confirmation: GET /orders/:id]
  Confirmation --> History[History: GET /orders/me]
  History --> Detail[Detail: GET /orders/:id]
  Detail --> History
```

| Màn hình | Loading | Empty | Error |
| --- | --- | --- | --- |
| Cart | Đồng bộ state giỏ | Điều hướng chọn món | Giới hạn số lượng được kiểm tra tại store |
| Checkout | Khóa CTA khi tạo order/payment | Trả về menu | Giữ giỏ, nêu lý do và cho thử lại |
| Confirmation | Tải chi tiết đơn | Thiếu mã đơn là lỗi | Retry hoặc về lịch sử đơn |
| History | Tải `/orders/me` | CTA về menu | Retry |
| Detail | Tải `/orders/:id` | Không tìm thấy/không có quyền | Retry hoặc về history |

Quy tắc giỏ: chỉ clear sau khi server trả `paymentStatus = SUCCEEDED`. Các lỗi tạo đơn, lỗi gateway hoặc `paymentStatus = FAILED` đều không xóa state đã persist.

# UC-08 — Thực hiện thanh toán (Mock Gateway & Idempotency)

Hợp đồng thống nhất với [REST API](../architecture/api-spec.md), [ERD](../architecture/erd.md) và [Order State Machine](../architecture/order-state-machine.md). Đây là đặc tả để triển khai; DTO/interface hiện chưa có PaymentsService thực thi luồng này.

| Tên mục | Nội dung chi tiết |
|---|---|
| **Actor** | Khách hàng, Mock Payment Gateway |
| **Tóm tắt** | Khách hàng thanh toán đơn đã tạo qua gateway giả lập. Một `Payment` lưu một attempt; Idempotency-Key và hash do backend tính bảo đảm gửi lại cùng request không gọi gateway lần nữa. |
| **Tiền điều kiện** | Khách hàng đã đăng nhập, sở hữu đơn; đơn `PENDING`, reservation còn hiệu lực và chưa có payment thành công. Request body chỉ chứa `orderId` và `method` (`E_WALLET` hoặc `CARD`); header `Idempotency-Key` bắt buộc. Backend lấy amount từ `Order.total`, không nhận amount/hash từ client. |
| **Luồng chính** | 1. Kiểm tra quyền sở hữu, trạng thái và reservation.<br>2. Chuẩn hóa `orderId`, `method`, amount từ order; tính SHA-256 `requestHash`.<br>3. Kiểm tra/tạo Payment `PROCESSING` với key unique.<br>4. Gọi Mock Gateway ngoài transaction database.<br>5. Khi gateway thành công, transaction cập nhật Payment `SUCCEEDED`, Order `PAID`, consume inventory/coupon reservation, ghi history và cộng loyalty `EARN` đúng một lần.<br>6. Trả HTTP 200 với `paymentStatus=SUCCEEDED`, `orderStatus=PAID` và các trường theo API spec. |
| **Gửi lại cùng request** | Cùng key/cùng hash và attempt đã hoàn tất: trả kết quả đã lưu, không gọi gateway lần hai. Attempt còn `PROCESSING`: trả `409 PAYMENT_IN_PROGRESS`, client chờ rồi gửi lại cùng key. Unique key trong DB xử lý race khi request đồng thời. |
| **Gateway từ chối** | Lưu Payment `FAILED`, chuyển Order `PAYMENT_FAILED`, giữ reservation trong thời hạn retry. Trả HTTP 200 với `paymentStatus=FAILED`, `orderStatus=PAYMENT_FAILED`; đây là kết quả xử lý thanh toán, không phải lỗi cú pháp request. |
| **Thử thanh toán lại sau thất bại** | Client tạo key mới. PaymentsService khóa/kiểm tra đơn, chuyển `PAYMENT_FAILED -> PENDING` và ghi history trước attempt mới. Không cho retry nếu reservation hết hạn hoặc order đã hủy. |
| **Ngoại lệ** | Cùng key/khác payload: `409 IDEMPOTENCY_KEY_REUSED`. Đơn đã paid: `409 ORDER_ALREADY_PAID`. Gateway không xác định/lỗi hạ tầng: `503 PAYMENT_GATEWAY_UNAVAILABLE`; không tự kết luận thành công hoặc thất bại, giữ attempt để đối soát. |
| **Hậu điều kiện** | Kết quả Payment dùng enum `PROCESSING / SUCCEEDED / FAILED`; trạng thái Order dùng enum riêng. DB giữ key/hash/kết quả attempt và tối đa một payment `SUCCEEDED` mỗi đơn. Các cập nhật liên quan thành công được commit cùng transaction. |

Mock Payment Gateway là tác nhân tích hợp, không phải role tài khoản. Tài khoản chỉ có `CUSTOMER` và `BARISTA`.

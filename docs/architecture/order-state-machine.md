# SD-04 — Vòng đời đơn hàng

Owner thiết kế: Dev Khang. Reviewer thiết kế: Dev Kiệt. Owner implementation Task 10-A: Dev Kiệt, reviewer implementation: Dev Khang. Trạng thái thiết kế: chờ review độc lập.

Tuần 1 bàn giao luật nền và contract; việc triển khai transition service thuộc Task 10-A ở Sprint 2. Enum dưới đây khớp `OrderStatus` trong Prisma và migration nền.

```mermaid
stateDiagram-v2
    [*] --> PENDING: tạo đơn và giữ tồn
    PENDING --> PAID: payment thành công
    PENDING --> PAYMENT_FAILED: gateway từ chối
    PAYMENT_FAILED --> PENDING: retry bằng key mới, còn thời hạn giữ
    PENDING --> CANCELLED: hủy hoặc hết hạn
    PAYMENT_FAILED --> CANCELLED: hủy hoặc hết hạn
    PAID --> CANCELLED: hủy trước khi nhận pha
    PAID --> PREPARING: nhân viên nhận pha
    PREPARING --> READY: pha xong
    READY --> COMPLETED: giao khách
    COMPLETED --> [*]
    CANCELLED --> [*]
```

| Từ → tới | Người gọi | Điều kiện và tác động trong cùng transaction |
|---|---|---|
| Khởi tạo → PENDING | OrdersService | User hợp lệ; giá/snapshot từ DB; trừ stock và tạo reservation ACTIVE; coupon RESERVED nếu có; history `null → PENDING` |
| PENDING → PAID | PaymentsService qua OrdersService | Payment SUCCEEDED, amount khớp total, giữ tồn còn hiệu lực; inventory CONSUMED, coupon CONSUMED, loyalty EARN tối đa một lần |
| PENDING → PAYMENT_FAILED | PaymentsService qua OrdersService | Payment FAILED; giữ reservation/coupon đến thời hạn retry; không cộng loyalty |
| PAYMENT_FAILED → PENDING | PaymentsService qua OrdersService | Key mới, giữ tồn còn hiệu lực, không có payment PROCESSING/SUCCEEDED; ghi history trước attempt mới; không trừ tồn lần nữa |
| PENDING/PAYMENT_FAILED → CANCELLED | Chủ đơn hoặc job hết hạn | Không có payment đang PROCESSING; hoàn inventory ACTIVE và giải phóng coupon RESERVED đúng một lần |
| PAID → CANCELLED | Chủ đơn | Chưa nhận pha; giữ Payment SUCCEEDED, coupon CONSUMED và loyalty EARN; hoàn stock từ inventory CONSUMED → RELEASED và tăng version đúng một lần; ghi history |
| PAID → PREPARING | BARISTA | Đã thanh toán; ghi người thao tác và history |
| PREPARING → READY | BARISTA | Đúng trạng thái trước; ghi history |
| READY → COMPLETED | BARISTA | Đúng trạng thái trước; ghi history; không cộng loyalty lần hai |

Chủ đơn được hủy từ PENDING, PAYMENT_FAILED hoặc PAID khi hợp lệ; job chỉ hủy đơn chưa thanh toán đã hết hạn. Hủy từ PAID giữ giao dịch thanh toán thành công và không hoàn tiền giả lập theo lựa chọn của nhóm. Barista đăng nhập theo UC-02 và chỉ cập nhật tiến độ pha chế theo UC-10; Mock Payment Gateway trả kết quả cho PaymentsService, không có tài khoản/RBAC.

Mọi cập nhật đi qua một public `OrdersService.transition(...)`, kiểm tra quyền/ownership và trạng thái hiện tại dưới lock hoặc compare-and-set. Module Payments không tự ghi order/stock; Orders không gọi ngược Payments. History và tác động dữ liệu phải commit/rollback cùng nhau. Job hết hạn phải tránh đua với payment đang xử lý và kiểm tra lại trạng thái trong transaction.

PAID → CANCELLED phải đua an toàn với PAID → PREPARING: chỉ một transition được commit. Request còn lại nhận `409 ORDER_INVALID_TRANSITION`; không hoàn stock hoặc ghi history lần hai. Coupon/điểm đã ghi được giữ vì giao dịch thanh toán thành công vẫn được giữ.

Transition ngoài bảng, bao gồm tự chuyển về chính trạng thái hoặc chuyển ra khỏi trạng thái cuối, trả `409 ORDER_INVALID_TRANSITION` và không thay đổi dữ liệu. Request thiếu JWT/sai quyền lần lượt trả 401/403. Replay cùng idempotency key trả kết quả đã lưu, không gọi transition lần nữa.

Contract nền cho payment: enum `E_WALLET | CARD`; key từ header `Idempotency-Key`; hash do backend tính từ payload chuẩn hóa và amount thật của order. Cùng key khác hash trả `409 IDEMPOTENCY_KEY_REUSED`. Chỉ request mới sau FAILED được chuyển `PAYMENT_FAILED → PENDING`.

Acceptance tests để Kiệt triển khai: happy path đầy đủ; reject `PENDING → COMPLETED`; trạng thái cuối bất biến; retry không reserve hai lần; cancel/timeout không hoàn tồn hai lần; payment trùng không cộng điểm/lượt coupon hai lần; payment và timeout concurrent không tạo PAID sau khi hoàn tồn; PAID → CANCELLED giữ payment/coupon/loyalty và hoàn tồn một lần; race giữa hủy PAID và nhận pha chỉ có một bên thành công.

Ràng buộc SQL nền: một payment SUCCEEDED/order, một EARN/order, stock không âm và tổng tiền nhất quán. Ràng buộc này hỗ trợ transition service; không thay thế validation/RBAC/transaction ở Service.

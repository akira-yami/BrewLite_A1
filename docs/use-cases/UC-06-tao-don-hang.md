# UC-06 — Tạo đơn hàng

| Thuộc tính | Nội dung |
|---|---|
| Tác nhân chính | Khách hàng (`CUSTOMER`) |
| Owner / reviewer | Dev Khang / Dev Hoàng |
| Truy vết | Task 6, PBI-06, S1-10 (thiết kế), S2-W3 (triển khai) |
| API đích | `POST /api/v1/orders` |
| Sơ đồ | [SD-10 PlantUML](../architecture/diagrams/SD-10-create-order.puml) |
| Hợp đồng | [Orders contract](../architecture/orders-contract.md), [OpenAPI](../api/orders.openapi.yaml) |

Trạng thái: bản thiết kế tuần 2, chờ Dev Hoàng review. Không phải bằng chứng API đã triển khai.

## Tiền điều kiện

- Khách hàng đã đăng nhập, token hợp lệ và tài khoản còn active.
- Giỏ có 1..20 dòng; mỗi dòng có variant, quantity và tùy chọn hợp lệ.
- Backend có thể truy cập PostgreSQL. Giá/tồn hiển thị ở giỏ chỉ để tham khảo; server kiểm tra lại khi tạo đơn.

## Luồng chính

1. Khách hàng xác nhận giỏ hàng; có thể nhập coupon qua UC-07 mở rộng UC-06.
2. UI gửi variant, quantity, tập topping, đường/đá/ghi chú và coupon tùy chọn; không gửi giá, userId hoặc status.
3. Backend kiểm tra JWT, role, DTO; chuẩn hóa tùy chọn và gộp dòng đúng quy tắc. Các dòng khác ghi chú hoặc đường/đá được giữ riêng.
4. OrdersService mở một transaction; đọc lại user, catalog và giá, kiểm tra tùy chọn active/liên kết product.
5. Nếu có coupon, PromotionsService khóa và kiểm tra điều kiện, giới hạn; backend tính subtotal, discountAmount, total.
6. Backend lưu Order ở `PENDING`, item/topping snapshot, lượt coupon `RESERVED` nếu có; sau đó giữ tồn theo tổng quantity mỗi variant và tạo reservation `ACTIVE` hết hạn sau 15 phút.
7. Backend ghi lịch sử `null -> PENDING`, commit cùng toàn bộ dữ liệu/stock/version.
8. Backend trả 201 với snapshot, tổng tiền và hạn giữ tồn; UI chuyển sang bước thanh toán UC-08 bằng orderId đã tạo.

## Luồng thay thế và ngoại lệ

| Mã | Tình huống | Kết quả |
|---|---|---|
| A1 | Không dùng coupon hoặc couponCode=null | discountAmount=0; không tạo redemption |
| A2 | Hai dòng cùng variant nhưng khác tùy chọn | Lưu item riêng; gộp quantity khi giữ tồn |
| A3 | Version thay đổi nhưng còn hàng / serialization / deadlock | Rollback, thử lại toàn transaction tối đa 3 lần tổng cộng |
| E1 | JWT thiếu/sai/hết hạn; user không còn hợp lệ | 401; không tạo đơn |
| E2 | Role không phải CUSTOMER | 403; không tạo đơn |
| E3 | Sai DTO, field giả mạo, sau gộp quantity >20 | 400 VALIDATION_ERROR |
| E4 | Product/variant/topping không tồn tại/không active hoặc topping sai product | 400 INVALID_OPTION |
| E5 | Không đủ tồn theo tổng variant | 409 OUT_OF_STOCK, không giữ một phần |
| E6 | Hết lượt retry cạnh tranh dữ liệu | 409 INVENTORY_CONFLICT |
| E7 | Coupon không hợp lệ/hết lượt/không đủ điều kiện | 422 COUPON_NOT_APPLICABLE; không tự bỏ coupon để tạo đơn giá khác |
| E8 | Lỗi DB khi đang ghi | Rollback tất cả; 500 với requestId, không lộ lỗi nội bộ |
| E9 | UI timeout/mất kết nối sau khi gửi | Kết quả có thể đã commit; không tự gửi lại, đối chiếu lịch sử đơn trước khi tạo lại |

## Hậu điều kiện

Thành công: đúng một order cho lần xử lý thành công, `PENDING`, snapshot bất biến, tổng tiền server, một reservation mỗi variant và history ban đầu. Coupon nếu có được giữ lượt cùng transaction. Chưa thu tiền, chưa consume stock reservation, chưa cộng loyalty.

Thất bại trước commit: không để lại order/item/history, reservation/redemption, stock/version dở dang. Sau commit, hủy/hết hạn/thanh toán sử dụng state machine và cơ chế release/consume riêng; không sửa snapshot của đơn.

## Tiêu chí chấp nhận để triển khai S2

- Giá và userId/status luôn do server quyết định; từ chối trường giả mạo.
- Null/0 đường đá, note trắng/500 ký tự, topping không đúng product được xử lý đúng hợp đồng.
- Cùng variant qua nhiều dòng không vượt tồn và chỉ có một reservation tổng.
- Lỗi ở bất kỳ bước ghi nào rollback toàn bộ, kể cả version và lượt coupon.
- Test cạnh tranh stock/coupon chạy trên PostgreSQL thật.
- Hoàng approve SD-10 trước khi nhóm ghi nhận design gate đạt; PR implementation có reviewer khác owner.

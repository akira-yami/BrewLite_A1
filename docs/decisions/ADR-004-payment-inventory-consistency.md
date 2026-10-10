# ADR-004: Nhất quán thanh toán và tồn kho

- Trạng thái: Chấp nhận
- Ngày: 2026-09-23

## Bối cảnh

Task 10 yêu cầu thanh toán idempotent và không bán quá tồn khi nhiều khách đặt đồng thời. Gọi payment gateway trong transaction database sẽ giữ lock lâu; chỉ kiểm tra stock trước rồi trừ sau lại gây race.

## Quyết định

- Tạo order và giữ tồn trong một transaction ngắn bằng cập nhật nguyên tử có điều kiện `version = expectedVersion AND stock >= quantity`, đồng thời tăng version. Xung đột version được đọc lại/retry có giới hạn.
- Lưu `InventoryReservation` để consume/release/expire đúng một lần.
- Mỗi lần thử thanh toán là một `Payment`; `idempotency_key` unique và gắn `request_hash`.
- Không giữ database transaction trong lúc gọi gateway.
- Sau kết quả gateway, transaction thứ hai cập nhật Payment, Order, reservation, history và loyalty.
- Partial unique index bảo đảm tối đa một payment thành công/order và một lần cộng loyalty/order.

## Lý do

- Unique constraint giải quyết race đáng tin cậy hơn kiểm tra ở bộ nhớ.
- Reservation tránh oversell và cho phép hoàn tồn khi checkout bị bỏ dở.
- Transaction ngắn giảm lock contention và deadlock.

## Hệ quả

- Cần job giải phóng reservation hết hạn.
- Kết quả gateway không xác định phải được lưu/đối soát, không đoán thành công.
- Integration test concurrency là bắt buộc; unit test không đủ chứng minh.

## Phương án loại bỏ

- Trừ stock sau thanh toán: hai khách có thể cùng trả tiền cho lượng hàng cuối.
- Giữ transaction khi gọi gateway: lock dài, dễ timeout và giảm throughput.
- Chỉ cache idempotency trong memory: mất dữ liệu khi restart và không an toàn khi có nhiều instance.

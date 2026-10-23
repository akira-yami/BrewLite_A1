# Orders tuần 3 — triển khai và kiểm chứng

Cập nhật 23/10/2026. Phạm vi backend của Khang: tạo đơn và đọc lịch sử/chi tiết của CUSTOMER. Test đạt không thay thế xác nhận review của Hoàng/Huy hoặc approval sơ đồ SD-10/SD-14.

## API đang có

Base URL: `http://localhost:3001/api/v1`. Các route dưới đây cần `Authorization: Bearer <accessToken>` của CUSTOMER.

| Method | Route | Kết quả |
|---|---|---|
| POST | `/orders` | 201, snapshot đơn PENDING; giữ tồn và lượt coupon 15 phút |
| GET | `/orders/me?limit=20&status=PENDING` | 200, đơn của user hiện tại, mới nhất trước |
| GET | `/orders/me?limit=20&cursor=<meta.nextCursor>` | Trang tiếp theo; đổi status thì xóa cursor |
| GET | `/orders/<orderId>` | 200, snapshot item, paymentSummary, timeline; 404 nếu không có hoặc không thuộc user |

`limit` từ 1 đến 100. Cursor là UUID của bản ghi cuối; truy vấn luôn giới hạn theo user, kể cả cursor. Response thành công gồm `{ data, meta: { requestId, ... } }`; lịch sử có thêm `meta.nextCursor` hoặc `null`. Header `X-Request-Id` trùng request ID trong body. Lỗi gồm `{ error: { code, message, details, requestId } }`.

## Thử tạo đơn

1. Chạy PostgreSQL và apply migrations theo README; khởi động API.
2. Đăng nhập bằng `POST /auth/login`, lấy `data.accessToken`.
3. Gọi `GET /products`, lấy **UUID variant thật**, không dùng ID sản phẩm thay variant.
4. Gọi `POST /orders` với token và body dưới đây; thay placeholder bằng UUID thật.

```json
{
  "items": [
    {
      "productVariantId": "<variant UUID>",
      "quantity": 2,
      "toppingIds": [],
      "sugarLevel": 0,
      "iceLevel": 50,
      "note": "Để topping riêng"
    }
  ]
}
```

Không gửi giá, tổng tiền, trạng thái hay userId. Server đọc giá/catalog trong cùng transaction `Serializable`, kiểm tra tài khoản còn active, lưu snapshot rồi giữ tồn qua Inventory/Catalog. Các biến thể được xử lý theo UUID tăng dần; lệnh trừ tồn kiểm tra `version` và `stock >= quantity`. Khi tranh chấp, toàn transaction được thử lại tối đa 3 lần tổng cộng với giá/version đọc lại. Không retry lỗi dữ liệu, thiếu hàng hoặc coupon không hợp lệ.

Hai dòng cùng variant, cùng topping (không phụ thuộc thứ tự), đường, đá và ghi chú đã trim được gộp; quantity sau gộp tối đa 20. Khác đường/đá vẫn là hai dòng, nhưng chỉ tạo một reservation tổng theo variant. Tất cả tiền được kiểm tra trong miền số nguyên an toàn trước khi ghi.

Sau khi tạo, dùng GET detail/history để đối chiếu tổng tiền, tùy chọn và timeline `null → PENDING`. Đăng nhập tài khoản khác và đọc lại cùng orderId phải nhận `404 ORDER_NOT_FOUND`. Không tự gửi lại POST khi mất kết nối: hãy xem lịch sử trước vì tạo đơn chưa có idempotency.

## Đường/đá ở frontend và backend

Đã có sẵn cả hai phía, không cần migration mới:

- `ProductDetailModal.tsx`: chọn đường/đá và sửa tùy chọn món trong giỏ.
- `cart-store.ts`: lưu qua reload, phân biệt cấu hình, `getOrderItems()` tạo payload với `sugarLevel`, `iceLevel`, `note`.
- `CartDrawer.tsx`: hiển thị đường/đá của từng dòng.
- DTO backend và CHECK constraint PostgreSQL: nhận số nguyên 0..100 hoặc null/bỏ qua. `0` là không đường/đá; `null` là theo công thức chuẩn và khác với `100`.
- `OrderItem` và mapper: lưu/trả các giá trị từ snapshot, kể cả số 0 và ghi chú.

**Giới hạn giao diện:** nút “Tiến hành đặt & thanh toán” trong giỏ chưa nối vào checkout; chưa có trang lịch sử/chi tiết đơn. Việc này thuộc tích hợp UI, không phải bằng chứng rằng API Orders chưa có. Payload giỏ hàng đã sẵn sàng cho người phụ trách checkout sử dụng.

## Kiểm thử và bằng chứng

Trong `apps/api`:

```sh
npm test
npm run typecheck
npm run test:e2e
npm run test:integration -- test/orders.integration-spec.ts
```

Integration chỉ được chạy với `SMOKE_DATABASE_URL` trỏ tới database kiểm thử đã migrate, tên bắt đầu bằng `brewlite_foundation_smoke`. Đặt `JWT_SECRET` cho test, không dùng database làm việc của nhóm. File test tạo fixture riêng, không xóa dữ liệu hiện có; có thể chạy lại với dữ liệu fixture mới.

`test/orders.integration-spec.ts` kiểm tra HTTP và PostgreSQL thật: snapshot/đường/đá, gộp dòng, auth/role/ownership, dữ liệu không hợp lệ, rollback sau ghi stock và coupon, hai request tranh ly cuối, tranh coupon giới hạn, tiền vượt giới hạn, phân trang khi trùng timestamp. `order-retry.spec.ts` kiểm tra thêm retry/version/orderNumber và thứ tự reserve. Trong `apps/web`, `npm test` kiểm tra tùy chọn, lưu/sửa giỏ và hiển thị modal.

Khi báo cáo, lưu log test, commit/PR triển khai, ảnh Postman cùng request ID, kết quả detail của chủ đơn và 404 của tài khoản khác. Người review xác nhận trên PR/task; không tự ghi đã review khi chưa có xác nhận thật.

Bản đối chiếu có commit, ngày giờ thực tế, kết quả và log: [Bàn giao Khang tuần 3](../scrum/khang-week3-handoff.md).

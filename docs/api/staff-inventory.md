# API xem kho nguyên liệu cho Barista

Barista chỉ được **xem, tìm kiếm và lọc** kho. Không được thay đổi số lượng tồn.

| Endpoint | Quyền BARISTA |
|---|---|
| `GET /api/v1/staff/inventory` | Xem danh sách; q, status, limit, cursor |
| `GET /api/v1/staff/inventory/:id` | Xem chi tiết |
| `PATCH /api/v1/staff/inventory/:id/stock` | Luôn trả 403 `FORBIDDEN_RESOURCE` |

Các endpoint đọc kiểm tra JWT, role BARISTA và tài khoản còn hoạt động trong database. Customer không đọc hoặc sửa kho. Endpoint PATCH được giữ để từ chối rõ ràng các client cũ, kể cả dùng JWT Barista hợp lệ hoặc tự gửi request bên ngoài giao diện.

UI tại `/barista` không có nút cập nhật hoặc form sửa số lượng. Chưa bổ sung vai trò quản lý hoặc endpoint nhập kho mới. Nghiệp vụ hệ thống reserve/consume/release cho đơn hàng tiếp tục hoạt động.

Ngưỡng sắp hết: ≤ 500 g, 1000 ml hoặc 10 cái và lớn hơn 0. Số lượng 0 là hết hàng. Danh sách có tìm tên/mã, lọc trạng thái và phân trang; response `{ data: Ingredient[], meta: { nextCursor } }`.

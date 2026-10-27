# User Story BrewLite

## US-01 - Xem menu

**Là** khách hàng, **tôi muốn** xem danh sách đồ uống kèm hình và giá, **để** chọn món phù hợp.

Tiêu chí chấp nhận:

- Chỉ hiển thị sản phẩm đang hoạt động.
- Có loading, empty và error state.
- Chọn một sản phẩm mở được trang chi tiết.

## US-02 - Tùy chọn sản phẩm

**Là** khách hàng, **tôi muốn** chọn size, topping, mức đường và đá, **để** cá nhân hóa đồ uống.

Tiêu chí chấp nhận:

- Phải chọn đúng một variant/size còn hàng.
- Chỉ chọn được topping hợp lệ và đang hoạt động.
- UI hiển thị giá tạm tính; backend vẫn tính lại khi tạo đơn.
- Đường/đá chọn độc lập: công thức chuẩn (null) hoặc 0/25/50/75/100%; 0% là không đường/đá, không phụ thu.
- Có ghi chú món tối đa 500 ký tự sau trim; rỗng thành null, không phụ thu.

## US-03 - Quản lý giỏ hàng

**Là** khách hàng, **tôi muốn** thêm, đổi số lượng và xóa món, **để** chuẩn bị đơn trước khi thanh toán.

Tiêu chí chấp nhận:

- Badge phản ánh tổng số lượng.
- Tổng tạm tính cập nhật khi item thay đổi.
- Giỏ được giữ khi reload và khi thanh toán thất bại.
- Persist cả đường/đá và note; giỏ cũ thiếu trường được đọc thành null. Chỉ gộp dòng khi cùng variant, tập topping, cả hai mức đường/đá và note đã trim.

## US-04 - Đăng ký/đăng nhập

**Là** khách hàng, **tôi muốn** đăng ký và đăng nhập, **để** tạo và theo dõi đơn của mình.

Tiêu chí chấp nhận:

- Username unique theo RegisterDto/schema hiện hành, input được validate, password không lưu rõ.
- Login thành công nhận phiên/token hợp lệ.
- User không truy cập được order của người khác.

## US-05 - Tạo đơn

**Là** khách hàng đã đăng nhập, **tôi muốn** tạo đơn từ giỏ, **để** hệ thống giữ món và xác nhận số tiền chính xác.

Tiêu chí chấp nhận:

- Order tạo ở `PENDING` với mã unique.
- Backend tự tính giá/coupon và snapshot item.
- Validate đường/đá là số nguyên 0..100 hoặc null, lưu nguyên lựa chọn cùng item và tổng hợp tồn kho theo variant qua mọi dòng.
- Validate note là chuỗi tối đa 500 ký tự sau trim hoặc null, lưu cùng item.
- Nếu không đủ tồn, không tạo order dở dang và trả item bị thiếu.
- Request đồng thời không làm stock âm.

## US-06 - Thanh toán không tiền mặt

**Là** khách hàng, **tôi muốn** thanh toán bằng ví hoặc thẻ, **để** không cần mang tiền mặt.

Tiêu chí chấp nhận:

- Nút thanh toán hiển thị tổng do backend xác nhận.
- Thành công chuyển order sang `PAID` và hiển thị mã đơn.
- Thất bại chuyển `PAYMENT_FAILED`, giỏ phía client vẫn còn để xử lý lại.
- Hai request cùng `Idempotency-Key` chỉ tạo một kết quả thanh toán.

## US-07 - Theo dõi và xem lịch sử

**Là** khách hàng, **tôi muốn** xem trạng thái và lịch sử đơn, **để** biết lúc nào nhận đồ uống.

Tiêu chí chấp nhận:

- Danh sách chỉ gồm order của user hiện tại, mới nhất trước.
- Chi tiết có item, tổng tiền, payment summary và timeline trạng thái.
- Dữ liệu lịch sử không đổi khi menu cập nhật giá/tên.
- Chi tiết trả đường/đá đã lưu; đơn cũ trả null, 0% hiển thị đúng.
- Chi tiết trả note đã lưu dưới dạng văn bản thuần; đơn cũ trả null.

## US-08 - Xử lý đơn tại quầy

**Là** Barista, **tôi muốn** cập nhật trạng thái pha chế, **để** khách biết tiến độ đơn.

Tiêu chí chấp nhận:

- Chỉ `BARISTA` gọi được API vận hành, sau khi đăng nhập bằng UC-02.
- Chỉ cho phép `PAID -> PREPARING -> READY -> COMPLETED`.
- Mọi transition ghi actor, thời gian và trạng thái trước/sau.
- Barista nhìn thấy mức đường/đá của từng dòng để pha đúng yêu cầu; null là công thức chuẩn.
- Barista đọc ghi chú của từng dòng để thực hiện yêu cầu riêng.

## US-09 - Khuyến mãi và điểm thưởng

**Là** khách hàng, **tôi muốn** dùng coupon và nhận điểm sau khi trả tiền, **để** được hưởng ưu đãi.

Tiêu chí chấp nhận:

- Coupon được kiểm tra thời gian, giá trị đơn và giới hạn sử dụng trong transaction.
- Discount không làm total âm.
- Mỗi order chỉ cộng điểm một lần sau `PAID`.
- Điều chỉnh điểm được ghi thành ledger, không sửa lịch sử cũ.

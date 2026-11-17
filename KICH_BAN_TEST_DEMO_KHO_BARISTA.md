# SỔ TAY TRA CỨU LỆNH TEST TỰ ĐỘNG: KHO & BARISTA (BREWLITE)
> **Tài liệu tra cứu nhanh khi bảo vệ đồ án trước Hội đồng phản biện**  
> **Phạm vi phụ trách:** Kho nguyên liệu (Inventory), Quầy pha chế (Barista) & Luồng đơn hàng (Orders)  
> **Môi trường chạy:** Chạy trực tiếp từ thư mục gốc `BrewLite` trên cơ sở dữ liệu **PostgreSQL thật**.

---

## ⚡ HƯỚNG DẪN THAO TÁC NHANH TRONG PHÒNG BÁO CÁO

1. Mở sẵn 1 cửa sổ **PowerShell** tại thư mục `BrewLite`.
2. Khi thầy hỏi kịch bản nào, **copy lệnh tương ứng bên dưới -> Paste vào Terminal -> Bấm Enter**.
3. Mỗi bài test chạy từ **1.5 giây đến 4 giây** là có kết quả ngay lập tức với dấu tích xanh `✓`.
4. Đọc to **Câu chốt hạ kỹ thuật** tương ứng để ghi điểm tuyệt đối.

---

## PHẦN 1: CÁC KỊCH BẢN KHO NGUYÊN LIỆU (INVENTORY - TRỌNG TÂM)

### 📌 Kịch bản 1: Hai khách tranh mua ly cà phê cuối cùng (Race Condition / Không âm kho)
* **Tình huống thầy hỏi:** *"Nếu trong kho chỉ còn đủ hạt cà phê để pha đúng 1 ly, mà 2 khách cùng bấm đặt hàng cùng một mili-giây thì sao? Kho có bị âm không?"*
* **Bản chất kỹ thuật:** Khóa bi quan và kiểm tra tồn kho theo công thức cấu thành. Chỉ 1 transaction trừ kho thành công, transaction thứ hai nhận lỗi tồn kho.
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- inventory-concurrency.integration-spec.ts -t "last cup"
  ```
* **Thời gian chạy:** ~2.0 giây.
* **Câu chốt với thầy:**  
  > *"Dạ thưa thầy, test kiểm chứng 2 request gửi đồng thời vào ly cuối. Đúng 1 người đặt thành công, người thứ hai bị từ chối và số lượng tồn kho dừng lại ở đúng số 0, tuyệt đối không bị bán khống hay âm kho."*

---

### 📌 Kịch bản 2: Giải phóng tồn kho đúng 1 lần duy nhất khi hủy đơn (Idempotent Release)
* **Tình huống thầy hỏi:** *"Khi một đơn hàng bị hủy, cơ chế hoàn trả nguyên liệu vào kho hoạt động thế nào? Có bị lỗi cộng dồn kho nhiều lần nếu bấm hủy lặp lại không?"*
* **Bản chất kỹ thuật:** Chuyển trạng thái reservation từ `ACTIVE` sang `RELEASED`. Kiểm tra cờ trạng thái để chỉ hoàn kho đúng 1 lần.
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- inventory-concurrency.integration-spec.ts -t "release restores the reserved ingredients exactly once"
  ```
* **Thời gian chạy:** ~2.5 giây.
* **Câu chốt với thầy:**  
  > *"Dạ test chứng minh khi gọi hàm hoàn kho, nguyên liệu được cộng trả chính xác về kho. Các lần gọi tiếp theo bị bỏ qua, không bao giờ có chuyện hoàn kho gấp đôi."*

---

### 📌 Kịch bản 3: Hai tiến trình cùng cố hoàn kho 1 đơn đồng thời (Concurrent Releases)
* **Tình huống thầy hỏi:** *"Nếu hệ thống gặp sự cố mạng hoặc 2 worker cronjob cùng quét và cố giải phóng kho của một đơn hàng cùng lúc thì sao?"*
* **Bản chất kỹ thuật:** Race condition giữa 2 luồng release. Optimistic version check chỉ cho phép đúng 1 luồng tăng tồn kho.
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- inventory-concurrency.integration-spec.ts -t "concurrent releases"
  ```
* **Thời gian chạy:** ~2.2 giây.
* **Câu chốt với thầy:**  
  > *"Dạ dù 2 tiến trình gọi hoàn kho cùng lúc, chỉ có đúng 1 tiến trình thực thi thành công; tồn kho chỉ tăng 1 lần và số version của nguyên liệu tăng đúng 1 đơn vị."*

---

### 📌 Kịch bản 4: Đơn hàng quá hạn 15 phút chưa thanh toán -> Tự động nhả kho (TTL Expiry)
* **Tình huống thầy hỏi:** *"Khách tạo đơn giữ kho xong không thanh toán mà bỏ đi thì kho có bị giam mãi mãi không?"*
* **Bản chất kỹ thuật:** `OrderExpiryJob` quét các đơn quá hạn `reservationExpiresAt`, tự động chuyển đơn sang `CANCELLED` và hoàn kho nguyên liệu.
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- inventory-expiry.integration-spec.ts -t "expires overdue reservations"
  ```
* **Thời gian chạy:** ~2.5 giây.
* **Câu chốt với thầy:**  
  > *"Dạ hệ thống cài đặt TTL 15 phút. Cronjob tự động phát hiện đơn quá hạn, giải phóng toàn bộ nguyên liệu đã giữ và nhả mã giảm giá cho khách khác sử dụng."*

---

### 📌 Kịch bản 5: Hoàn kho theo Snapshot công thức cũ dù menu vừa đổi công thức món
* **Tình huống thầy hỏi:** *"Khách đặt ly cà phê lúc công thức dùng 10g hạt. Sau đó quán đổi công thức thành 15g hạt rồi đơn cũ mới bị hủy, vậy kho được hoàn 10g hay 15g?"*
* **Bản chất kỹ thuật:** Hoàn kho dựa trên `InventoryReservationItem` đã snapshot lúc tạo đơn, không tính lại theo công thức mới trên menu.
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- inventory-concurrency.integration-spec.ts -t "even if the recipe changed"
  ```
* **Thời gian chạy:** ~2.0 giây.
* **Câu chốt với thầy:**  
  > *"Dạ kho được hoàn chính xác 10g theo snapshot lưu trữ tại thời điểm đặt đơn. Việc thay đổi công thức món sau đó hoàn toàn không ảnh hưởng đến số lượng hoàn kho của đơn cũ."*

---

### 📌 Kịch bản 6: Khách thanh toán thành công -> Đổi trạng thái kho sang CONSUMED
* **Tình huống thầy hỏi:** *"Khi khách trả tiền xong, kho có bị hoàn trả nhầm không?"*
* **Bản chất kỹ thuật:** Trạng thái reservation đổi từ `ACTIVE` sang `CONSUMED`. Đơn đã `CONSUMED` thì không thể bị cronjob hoàn kho nhầm.
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- inventory-concurrency.integration-spec.ts -t "consume changes ACTIVE reservation to CONSUMED"
  ```
* **Thời gian chạy:** ~2.0 giây.
* **Câu chốt với thầy:**  
  > *"Dạ khi chuyển sang CONSUMED, số lượng nguyên liệu chính thức bị tiêu trừ vĩnh viễn, các tiến trình kiểm tra sau đó không thể kích hoạt hoàn kho cho đơn này nữa."*

---

### 📌 Kịch bản 7: Barista chỉ có quyền XEM kho, CẤM TUYỆT ĐỐI sửa đè số lượng tồn
* **Tình huống thầy hỏi:** *"Barista có vào chỉnh sửa con số tồn kho tùy tiện được không? Có sợ nhân viên vào sửa kho để che giấu thất thoát không?"*
* **Bản chất kỹ thuật:** Endpoint `PATCH /staff/inventory/:id/stock` bị chặn cứng `403 FORBIDDEN_RESOURCE`. Barista chỉ có quyền đọc (`GET /staff/inventory`).
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- staff-inventory.integration-spec.ts -t "BARISTA can read stock but cannot change"
  ```
* **Thời gian chạy:** ~2.3 giây.
* **Câu chốt với thầy:**  
  > *"Dạ hệ thống phân quyền rạch ròi: Barista chỉ được đọc danh sách tồn kho theo ca làm việc. Mọi hành vi gọi API sửa trực tiếp số lượng tồn kho đều bị server từ chối thẳng với mã lỗi 403 Forbidden."*

---

## PHẦN 2: CÁC KỊCH BẢN QUẦY BARISTA & STATE MACHINE

### 📌 Kịch bản 8: Chặn Barista bấm nhảy cóc trạng thái đơn hàng (FSM Guard)
* **Tình huống thầy hỏi:** *"Nếu Barista bấm nhầm hoặc cố tình chuyển đơn từ PAID nhảy cóc sang READY/COMPLETED mà không qua bước PREPARING thì sao?"*
* **Bản chất kỹ thuật:** Máy trạng thái FSM (Finite State Machine) kiểm soát ma trận chuyển đổi hợp lệ. Chuyển sai luồng bị từ chối với `409 INVALID_ORDER_TRANSITION`.
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- order-state-machine.integration-spec.ts -t "409 INVALID_ORDER_TRANSITION"
  ```
* **Thời gian chạy:** ~2.8 giây (chạy đồng loạt 6 kịch bản nhảy cóc sai).
* **Câu chốt với thầy:**  
  > *"Dạ toàn bộ các thao tác nhảy cóc: PAID sang READY, PREPARING sang COMPLETED, hoặc lùi trạng thái từ READY về PREPARING đều bị chặn cứng với mã 409, giữ nguyên trạng thái đơn trong database."*

---

### 📌 Kịch bản 9: Hai Barista cùng bấm nhận làm 1 đơn đồng thời (Concurrent Pickup)
* **Tình huống thầy hỏi:** *"Tại quầy có 2 Barista cùng nhìn thấy 1 đơn PAID và bấm 'Bắt đầu pha' cùng lúc thì sao?"*
* **Bản chất kỹ thuật:** Khóa bi quan dòng đơn hàng `lockById` (`SELECT ... FOR UPDATE`). Chỉ 1 Barista chuyển đơn sang `PREPARING` thành công.
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- order-state-machine.integration-spec.ts -t "hai barista nhận cùng một đơn"
  ```
* **Thời gian chạy:** ~2.8 giây.
* **Câu chốt với thầy:**  
  > *"Dạ nhờ cơ chế khóa dòng tại tầng DB, đúng 1 Barista nhận đơn thành công, người bấm sau nhận thông báo lỗi xung đột, tránh trường hợp 2 Barista pha trùng 1 ly nước."*

---

### 📌 Kịch bản 10: Hàng đợi Barista chỉ lọc đơn PAID, PREPARING, READY (Không lọt đơn rác)
* **Tình huống thầy hỏi:** *"Màn hình hàng đợi quầy Barista có bị lẫn các đơn chưa trả tiền (PENDING) hoặc đơn đã xong (COMPLETED) vào không?"*
* **Bản chất kỹ thuật:** API `GET /api/v1/staff/orders` lọc theo danh sách `STAFF_QUEUE_STATUSES` sắp xếp theo thời gian chờ lâu nhất (`updatedAt ASC`).
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- order-state-machine.integration-spec.ts -t "hàng đợi chỉ có PAID"
  ```
* **Thời gian chạy:** ~2.5 giây.
* **Câu chốt với thầy:**  
  > *"Dạ hàng đợi của Barista chỉ hiển thị các đơn đang cần xử lý (PAID, PREPARING, READY). Các đơn PENDING chưa thanh toán hoặc COMPLETED đã giao khách tuyệt đối không xuất hiện."*

---

### 📌 Kịch bản 11: Barista hủy đơn PAID khi hết nguyên liệu đột xuất -> Hoàn điểm Store Credit
* **Tình huống thầy hỏi:** *"Khách đã trả tiền rồi nhưng vào quầy thì phát hiện đổ vỡ hoặc hết nguyên liệu đột xuất, Barista xử lý thế nào?"*
* **Bản chất kỹ thuật:** Barista gọi `POST /staff/orders/:id/cancel-paid` kèm `reason`. Hệ thống hủy đơn, hoàn lại nguyên liệu đã giữ và hoàn $100\%$ tiền thành điểm Store Credit cho khách.
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- cancel-paid-refund.integration-spec.ts -t "barista hủy đơn PAID với lý do"
  ```
* **Thời gian chạy:** ~3.0 giây.
* **Câu chốt với thầy:**  
  > *"Dạ Barista có quyền hủy đơn kèm lý do giải trình. Hệ thống tự động chuyển đơn sang CANCELLED, hoàn trả số nguyên liệu còn lại và cộng 100% giá trị đơn thành điểm Store Credit vào ví tài khoản của khách ngay lập tức."*

---

### 📌 Kịch bản 12: Barista hủy đơn không nhập lý do -> Bị chặn 400 Validation
* **Tình huống thầy hỏi:** *"Nếu Barista bấm hủy đơn của khách mà không ghi lý do thì hệ thống có cho phép không?"*
* **Bản chất kỹ thuật:** DTO validation bắt buộc trường `reason` đối với vai trò Barista để lưu vết kiểm toán.
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- cancel-paid-refund.integration-spec.ts -t "barista hủy không có reason"
  ```
* **Thời gian chạy:** ~2.5 giây.
* **Câu chốt với thầy:**  
  > *"Dạ server từ chối ngay với mã lỗi 400 Validation Error. Barista bắt buộc phải ghi rõ lý do hủy (ví dụ: hết sữa, đổ vỡ ly) để phục vụ đối soát quản lý."*

---

### 📌 Kịch bản 13: Cả Khách và Barista cùng bấm hủy đơn PAID đồng thời
* **Tình huống thầy hỏi:** *"Khách đứng ở quầy bấm hủy trên app, cùng lúc Barista cũng bấm hủy trên POS thì có bị hoàn tiền 2 lần không?"*
* **Bản chất kỹ thuật:** Kiểm tra Idempotency Guard dựa trên bảng sổ cái `loyalty_transactions`. Chỉ 1 yêu cầu được xử lý, yêu cầu thứ hai nhận `409 REFUND_ALREADY_PROCESSED`.
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- cancel-paid-refund.integration-spec.ts -t "cùng hủy đơn PAID"
  ```
* **Thời gian chạy:** ~3.2 giây.
* **Câu chốt với thầy:**  
  > *"Dạ test bắn 2 request hủy song song. Kết quả: 1 request thành công trả 200, request còn lại nhận 409. Khách chỉ nhận đúng 1 lần hoàn điểm, kho chỉ được hoàn đúng số lượng snapshot."*

---

### 📌 Kịch bản 14: Barista bị vô hiệu hóa (khóa tài khoản) không thể tác động vào đơn
* **Tình huống thầy hỏi:** *"Nếu nhân viên Barista bị quản lý khóa tài khoản (nghỉ việc), nhưng token JWT của họ vẫn còn hạn thì có vào xem kho hoặc đổi trạng thái đơn được không?"*
* **Bản chất kỹ thuật:** `UsersService.assertActiveBarista` kiểm tra trạng thái `isActive` trực tiếp trong database ở mỗi transaction, không phụ thuộc hoàn toàn vào hạn của JWT.
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- order-state-machine.integration-spec.ts -t "barista bị vô hiệu hóa"
  ```
* **Thời gian chạy:** ~2.7 giây.
* **Câu chốt với thầy:**  
  > *"Dạ dù JWT còn hạn nhưng ở mỗi thao tác, server đều truy vấn trạng thái tài khoản thời gian thực trong PostgreSQL. Tài khoản bị deactivated sẽ nhận 401 Unauthorized ngay lập tức."*

---

## PHẦN 3: CÁC KỊCH BẢN GIAO DỊCH & ROLLBACK (TRANSACTION CORE)

### 📌 Kịch bản 15: Cấy lỗi muộn kiểm chứng Rollback 100% kho, đơn và coupon
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- orders.integration-spec.ts -t "rolls back"
  ```
* **Thời gian chạy:** ~3.5 giây.
* **Ý nghĩa:** Cố tình ném lỗi sau khi đã trừ kho và giữ coupon. Chứng minh PostgreSQL rollback toàn bộ, không có dữ liệu rác.

### 📌 Kịch bản 16: Idempotency-Key chống thanh toán trùng lặp
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- orders.integration-spec.ts -t "Idempotency-Key"
  ```
* **Thời gian chạy:** ~3.0 giây.
* **Ý nghĩa:** Gửi đúp 2 request thanh toán cùng key, chỉ tạo duy nhất 1 giao dịch.

### 📌 Kịch bản 17: Hai khách tranh chấp mã Coupon chỉ còn 1 lượt dùng
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- orders.integration-spec.ts -t "coupon once under concurrent"
  ```
* **Thời gian chạy:** ~2.8 giây.
* **Ý nghĩa:** Chỉ 1 khách được giảm giá, khách thứ hai bị từ chối, bảo vệ quota coupon.

### 📌 Kịch bản 18: Khách dùng Postman giả mạo giá tiền hoặc đặt quá 20 ly
* **Câu lệnh chạy:**
  ```powershell
  npm --prefix apps/api run test:integration -- orders.integration-spec.ts -t "forged prices"
  ```
* **Thời gian chạy:** ~3.0 giây.
* **Ý nghĩa:** Server từ chối ngay với `400 VALIDATION_ERROR`, giá tiền được tính độc lập server-side.

---

## 🚀 LỆNH CHẠY TRỌN GÓI DEMO 3 TIÊU CHÍ (CHẠY 41 TESTS TRONG 7 GIÂY)

Khi muốn biểu diễn toàn bộ sức mạnh hệ thống trong 1 câu lệnh duy nhất:

```powershell
npm run test:demo
```

* **Nội dung:** Chạy liên hoàn cả 3 file trọng tâm: `order-state-machine`, `orders`, `inventory-concurrency`.
* **Kết quả:** Hiển thị trọn vẹn **41 dấu tích xanh `✓` (41/41 tests pass 100%)** trong vòng **7 giây**.

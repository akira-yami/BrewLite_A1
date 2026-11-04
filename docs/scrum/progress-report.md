# Tiến độ BrewLite tại ngày 22/10/2026

> Báo cáo lịch sử, giữ làm đầu vào cho hồ sơ Sprint. Xem [audit 03/11/2026](trello-audit-2026-11-03.md) cho lần kiểm chứng sau; đây không phải trạng thái hiện tại.

Phạm vi kiểm tra: source, test, workflow, cấu hình và Git local tại baseline `7feda73` (merge PR #22 ngày 20/10/2026), cộng tài liệu/sơ đồ đang sửa trong working tree. Báo cáo này không thay workbook 33 task hoặc trạng thái Trello; không sửa phân công đã gửi nhóm.

## Sản phẩm và mức kiểm chứng

| Nhóm chức năng | Kết quả có thể đối chiếu | Phần chưa hoàn thành |
|---|---|---|
| Nền tảng | Next.js/NestJS, PostgreSQL/Prisma, 8 migration, seed, readiness, Dockerfile/Compose, CI 3 job | Chạy stack sạch và bàn giao runtime cần lưu minh chứng riêng |
| Catalog/menu/detail | GET /products và /products/:id, UI chọn size/topping/đường/đá/note | List vẫn có topping inactive với available=false; chốt contract và demo browser |
| Giỏ hàng | Thêm/sửa/xóa, badge, subtotal, persist; tách dòng theo option/note | Nút “Tiến hành đặt & thanh toán” chưa có handler; chưa test giữ/xóa giỏ theo kết quả checkout |
| Auth | Register/login, bcrypt/JWT, session/logout/401/403; RBAC/ownership trên route Auth | Order/payment chưa có route để kiểm chứng ownership tài nguyên thật |
| Orders | Request/response DTO, mapper, helper validateAndPriceItems và test | Chưa có controller tạo đơn, transaction lưu order/reservation/coupon/history và lịch sử đơn |
| Payment | DTO, gateway mock có test | @Post chưa bật; orchestration ném NotImplementedException; chưa có idempotency/PAID/FAILED DB |
| Task 10 | Schema/constraint, state diagram, ADR, review coupon | Chưa có runtime state machine, inventory, promotions, loyalty hoặc test nghiệp vụ concurrent |
| Hồ sơ | FR/NFR/UC/US, ERD/ADR/contracts, handover; thêm truy vết/Class/Deployment | Review độc lập, biên bản Scrum, xác nhận A2 và hồ sơ release còn thiếu |

Mã nguồn/test và trạng thái từng AC được nối tại ma trận truy vết (tài liệu A2 chưa có trong checkout). Trạng thái “có code/test” không đồng nghĩa đã đạt DoD.

## Mốc có bằng chứng

| Mốc | Minh chứng | Ý nghĩa và giới hạn |
|---|---|---|
| 17/10/2026 | `89ad479`, PR #18 | Contract/DTO/S1 DB integration; mốc triển khai lịch sử; bản bàn giao cá nhân đã được dọn khỏi docs |
| Catalog detail đã vào main | `23736aa`, PR #19 (`bac6713`) | Detail API đã được bổ sung sau mốc 17/10; không tiếp tục báo detail route còn thiếu |
| Giỏ hàng vào main | `c66c4ae`, PR #20 (`f0d2520`) | Có cart logic và test; checkout vẫn chưa nối |
| 19/10/2026 | PR #21 (`cd49fe6`) | Session, logout, JWT HTTP; không phải thanh toán |
| 20/10/2026 | PR #22 (`7feda73`) | RBAC/ownership Auth, filter 401/403 và review coupon; chưa chứng minh ownership order |
| 22/10/2026 | Bộ cập nhật tài liệu này | Đối chiếu source, bổ sung mapping và sơ đồ; chưa có approval của thành viên hoặc biên bản họp mới |

Nguồn hội thoại có dẫn [CI run 39402027237](https://github.com/phananhkhang/BrewLite/actions/runs/39402027237). Đây là link tham chiếu từ lần đánh giá trước; lần cập nhật tài liệu này không xác minh lại trạng thái live của run hoặc ruleset GitHub. Chỉ có `.github/workflows/ci.yml` trong repo chưa chứng minh merge bị chặn khi CI lỗi.

## Theo dõi owner mà không đổi phân công

Owner domain lấy từ Use Case overview (tài liệu A2 chưa có trong checkout) và [team roles](team-roles.md): Khang điều phối/schema/UC-06; Hoàng catalog và inventory theo kế hoạch tích hợp; Huy Auth; Khải cart/UC-09 frontend; Kiệt coupon/payment/state machine. Đầu việc chi tiết và SP vẫn tra bảng phân công gốc. Việc bổ sung API history, loyalty, review hoặc deployment phải đối chiếu owner trong workbook trước khi cập nhật bảng phân công, không tự tạo task mới trong báo cáo này.

Các phụ thuộc cần giải quyết trong phạm vi task đã giao:

1. Chốt contract và review SD-10; tạo đơn/giữ tồn/coupon cùng transaction, rollback không để dữ liệu dở dang.
2. Hoàn thiện payment, idempotency, transition và loyalty; ownership lấy từ order.userId, không so orderId với userId.
3. Nối checkout → confirmation → history; giữ giỏ khi lỗi, tránh tự tạo lại đơn khi mất response chưa rõ kết quả.
4. Chứng minh invalid transition, payment lặp và concurrent stock qua service/API và PostgreSQL thật.
5. Demo stack sạch, chốt môi trường bàn giao, bổ sung CD/HTTPS nếu đối chiếu đề A2 xác nhận cần, lưu release/smoke/rollback.

## Dữ liệu cần bổ sung từ hoạt động thực tế

Chưa ghi nhận trong repo: lịch Sprint chính thức, ngày Review/Retro và người tham dự, quyết định Accepted của PO, số SP còn lại từng ngày, approval độc lập cho từng đầu ra, URL production/release và kết quả CD. Các file Sprint ghi riêng “có triển khai” và “chưa nghiệm thu”, không tự điền ngày/feedback.

Workbook gốc không nằm trong repo nên chưa đồng bộ lại % của 33 task. % ước tính kỹ thuật phải kèm tiêu chí/mẫu số; % khối lượng phân công theo SP và % đóng góp cá nhân là các chỉ số khác nhau. Báo cáo này dùng trạng thái kèm minh chứng, không suy ra tỷ lệ cá nhân từ Git hoặc điểm đánh giá 6/10 trong hội thoại.

## Kiểm tra bộ cập nhật tài liệu ngày 22/10/2026

- Đã kiểm tra 49 file Markdown với 362 liên kết tương đối: không thiếu đích liên kết.
- CD-01/CD-02/DD-01/DD-02 qua kiểm tra cú pháp PlantUML, xuất SVG/PNG và xem bản render.
- File draw.io bốn trang parse XML thành công, ID/parent/đầu nối hợp lệ; gồm các đối tượng native có thể sửa. Chưa kiểm tra thao tác mở bằng ứng dụng diagrams.net.
- CD-01 khớp đủ 14 model Prisma và enum PaymentMethod/DiscountType/LoyaltyTransactionType; 10 dòng BL cùng ID/nội dung/SP không đổi, số task ba Sprint vẫn 4/3/3.
- Chỉ cập nhật tài liệu/nguồn sơ đồ và bản xuất; không chạy lại bộ test ứng dụng hoặc demo runtime trong lần sửa này. Kết quả test ở handover là kết quả lịch sử, không phải kết quả mới.

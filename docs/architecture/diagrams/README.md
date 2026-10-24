# Nguồn và bản xuất sơ đồ BrewLite

Bộ hiện hành ngày 24/10/2026 cho A2-2-HS. PlantUML là nguồn chuẩn của các sơ đồ trong bảng; SVG/PNG là bản xuất, không sửa tay. [manifest.json](./manifest.json) ghi hash nguồn (chuẩn hóa CRLF → LF) và từng ảnh, [enum-contract.json](./enum-contract.json) giữ hợp đồng enum đầy đủ để đối chiếu Prisma. CD-02 là snapshot code `2bb2011`; các luồng sequence/activity là thiết kế đích theo SRS/UC, không phải bằng chứng runtime hoặc approval.

| Mã / nội dung | Nguồn chỉnh sửa | Bản xem |
|---|---|---|
| AD-06 Checkout end-to-end | [PlantUML](./AD-06-create-order.puml) | [SVG](./AD-06-create-order.svg) · [PNG](./AD-06-create-order.png) |
| SD-05 Đăng ký | [PlantUML](./SD-05-registration.puml) | [SVG](./SD-05-registration.svg) · [PNG](./SD-05-registration.png) |
| SD-06 Đăng nhập/JWT/RBAC | [PlantUML](./SD-06-login-rbac.puml) | [SVG](./SD-06-login-rbac.svg) · [PNG](./SD-06-login-rbac.png) |
| SD-10 Tạo đơn/giữ tồn | [PlantUML](./SD-10-create-order.puml) | [SVG](./SD-10-create-order.svg) · [PNG](./SD-10-create-order.png) |
| SD-11 Thanh toán/retry | [PlantUML](./SD-11-payment-retry.puml) | [SVG](./SD-11-payment-retry.svg) · [PNG](./SD-11-payment-retry.png) |
| SD-12 Coupon | [PlantUML](./SD-12-coupon.puml) | [SVG](./SD-12-coupon.svg) · [PNG](./SD-12-coupon.png) |
| SD-14 Lịch sử/chi tiết | [PlantUML](./SD-14-order-history-detail.puml) | [SVG](./SD-14-order-history-detail.svg) · [PNG](./SD-14-order-history-detail.png) |
| CD-01 Domain | [PlantUML](./CD-01-domain.puml) | [SVG](./CD-01-domain.svg) · [PNG](./CD-01-domain.png) |
| CD-02 Lớp triển khai | [PlantUML](./CD-02-services.puml) | [SVG](./CD-02-services.svg) · [PNG](./CD-02-services.png) |
| DD-01 Compose local | [PlantUML](./DD-01-local.puml) | [SVG](./DD-01-local.svg) · [PNG](./DD-01-local.png) |
| DD-02 Production proposal | [PlantUML](./DD-02-production-proposal.puml) | [SVG](./DD-02-production-proposal.svg) · [PNG](./DD-02-production-proposal.png) |

SD-01/02/03/04 là hồ sơ nền Task 1/3: [Use Case và ảnh](../use-case-overview.md), [kiến trúc](../system-architecture.md), [ERD](../erd.md), [state machine](../order-state-machine.md). SD-07/08/09/13/15/16/17 thuộc task/owner khác trên board; không nhận hoàn thành những sơ đồ chưa được bàn giao vào bộ hiện hành này. Xem [register Task 1–3](../../document-register.json).

## Đối chiếu ngữ nghĩa Activity / Sequence / Class

| Khái niệm | Hợp đồng dùng chung và nơi kiểm tra |
|---|---|
| OrderStatus | PENDING, PAID, PAYMENT_FAILED, PREPARING, READY, COMPLETED, CANCELLED; SRS mục 7, UC-06/08, SD-04/10/11, AD-06 và CD-01 cùng enum Prisma |
| PaymentStatus / method | PROCESSING/SUCCEEDED/FAILED; E_WALLET/CARD. FAILED là trạng thái Payment, PAYMENT_FAILED là trạng thái Order; không dùng lẫn |
| Reservation | Inventory ACTIVE/CONSUMED/RELEASED/EXPIRED; coupon RESERVED/CONSUMED/RELEASED/EXPIRED; tạo Order trước FK, giữ tồn/coupon trong một transaction |
| Retry | Tạo đơn tối đa 3 attempt chỉ khi biết chưa commit; payment replay cùng key giữ kết quả, attempt mới sau FAILED dùng key mới/cùng orderId; không reserve hai lần |
| Snapshot | OrderItem gồm đường/đá nullable 0..100 và note trim <=500; khác lựa chọn/ghi chú giữ dòng riêng; tổng hợp quantity theo variant để reserve; tiền BigInt VND do server tính |
| Tác động sau PAID | Theo đích UC-08/ADR-004: consume inventory/coupon, EARN một lần; không đợi COMPLETED. CD-02 ghi rõ code hiện chưa đủ các cổng nghiệp vụ đích |
| Lớp | OrdersController/OrdersService, PaymentsController/PaymentsService, PromotionsService, CatalogService, các Repository và MockGatewayService có tên thống nhất. Method ghi contract đích trong sequence không được coi là method đã triển khai trong CD-02 |

Hai InventoryService khác đường dẫn trong code hiện tại được phân biệt rõ trên CD-02. Các service có Prisma tx trực tiếp và loyalty trong OrdersRepository được ghi là khác biệt kiến trúc đích, không che bằng sơ đồ. Kiểm tra máy chỉ bắt drift enum/hash/link; reviewer vẫn kiểm tra các invariant và đường đi theo [bảng AD-06](../sequence-diagram-create-order.md).

## Render và kiểm tra

Dùng Java và [PlantUML 1.2026.8 chính thức](https://github.com/plantuml/plantuml/releases/tag/v1.2026.8). Jar không commit vào repo; script xác minh SHA-256 `5e1ecfa8ecd32c90b03bbf3b1eb6f020943f98ab0fcf4032be31a0002ee2c462`. Bản xuất hiện hành dùng Java 27, font Arial trên Windows; máy/font khác có thể bố trí khác nên phải xuất cả bộ và kiểm tra lại.

```powershell
node scripts/render-diagrams.mjs .tmp/plantuml-1.2026.8.jar
node scripts/check-docs.mjs
```

Chạy từ root. Renderer dừng nếu PlantUML báo lỗi và chỉ cập nhật manifest sau khi xuất đủ bộ; commit source + SVG + PNG + manifest cùng đợt. Mở SVG để zoom kiểm tra nhãn, decision/merge, swimlane, activation và cardinality; ảnh PNG phục vụ trình xem không hỗ trợ SVG. CI `Documentation` kiểm tra mọi bộ nguồn/xuất, local link trong Markdown và enum/register; không cần Java để xác minh hash.

## Lịch sử tách khỏi bộ hiện hành

[BrewLite-models.drawio ngày 22/10](./archive/BrewLite-models.drawio) được lưu trong archive vì CD-02 cũ còn mô tả payment stub; không dùng làm bản nộp hiện hành. [tutorial_new.drawio](../../tutorial_new.drawio) và [tutorial02.drawio](../../tutorial02.drawio) giữ lịch sử nhóm/tham khảo; SD-11 cũ trong đó đặt idempotency sai tầng so với contract hiện hành. Chúng không phải nguồn đồng bộ của các bản xuất trong bảng. Muốn sửa trực quan, import PlantUML hiện hành vào công cụ hỗ trợ và xuất lại qua cùng quy trình; không lấy trang lịch sử để ghi đè nguồn hiện tại.

# Danh mục nguồn sơ đồ BrewLite

Cập nhật 22/10/2026. Source và bản xuất phải được review cùng nhau. PlantUML/Mermaid trong Markdown là nguồn chữ để diff; draw.io là nguồn chỉnh sửa trực quan. Không lấy sự tồn tại của hình làm bằng chứng runtime hoặc approval.

| Mã / nội dung | Nguồn | Bản xem / trạng thái |
|---|---|---|
| SD-01 Use Case | [Use Case overview](../use-case-overview.md), [draw.io master](../../tutorial_new.drawio) | PNG trong tài liệu; owner/UC giữ nguyên |
| SD-02 Architecture, SD-03 ERD, SD-04 State | [Architecture](../system-architecture.md), [ERD](../erd.md), [State](../order-state-machine.md), draw.io master | Markdown mô tả contract đích; rà đồng bộ các trang cũ khi nộp |
| SD-05/06 Auth | [Sequence Auth](../sequence-diagrams-auth.md) | Mermaid/PlantUML trong Markdown; đối chiếu giai đoạn JWT/RBAC/ownership |
| SD-10, AD-06 Create order | [SD-10 source](./SD-10-create-order.puml), [AD-06 source](./AD-06-create-order.puml) | [Sequence/Activity](../sequence-diagram-create-order.md), SVG/PNG cùng thư mục; thay đổi working tree có sẵn được giữ |
| SD-11 Payment | [Sequence payment](../sequence-diagram-payment.md) | Source Mermaid/PlantUML trong Markdown là bản contract để review; trang payment trong draw.io master còn cũ |
| SD-12 Coupon | [Review coupon](../../reviews/huy-review-coupon-sd12.md) | Chưa có file SD-12 riêng được version trong repo; review không thay nguồn sơ đồ |
| SD-14 History/detail | [SD-14 source](./SD-14-order-history-detail.puml) | [Tài liệu](../sequence-diagram-order-history-detail.md), SVG/PNG; bản làm việc, chưa có API |
| CD-01 Domain | [PlantUML](./CD-01-domain.puml), [draw.io](./BrewLite-models.drawio) trang CD-01 | [SVG](./CD-01-domain.svg), [PNG](./CD-01-domain.png); theo schema |
| CD-02 Services | [PlantUML](./CD-02-services.puml), draw.io trang CD-02 | [SVG](./CD-02-services.svg), [PNG](./CD-02-services.png); lớp/method hiện có |
| DD-01 Local | [PlantUML](./DD-01-local.puml), draw.io trang DD-01 | [SVG](./DD-01-local.svg), [PNG](./DD-01-local.png); cấu hình Compose |
| DD-02 Production proposal | [PlantUML](./DD-02-production-proposal.puml), draw.io trang DD-02 | [SVG](./DD-02-production-proposal.svg), [PNG](./DD-02-production-proposal.png); chưa deploy |

`tutorial02.drawio` là file tham khảo cũ, có ví dụ vận chuyển ngoài phạm vi BrewLite. `tutorial_new.drawio` có các trang lịch sử; riêng SD-11 cũ đặt idempotency ở gateway, lệch contract PaymentsService hiện tại. Giữ nguồn gốc để tránh ghi đè bản nhóm đang dùng; khi nộp phải dùng bản contract mới và đồng bộ trang tương ứng sau review. Bộ `BrewLite-models.drawio` bổ sung bốn trang native có thể sửa, không đổi mã SD/UC hoặc trang gốc của nhóm.

## Xuất lại PlantUML

Với PlantUML jar sẵn có và Java, chạy từ root (thay đường dẫn jar theo máy):

```powershell
java -jar <plantuml.jar> -charset UTF-8 -checkonly docs/architecture/diagrams/CD-01-domain.puml
java -jar <plantuml.jar> -charset UTF-8 -tsvg docs/architecture/diagrams/CD-01-domain.puml
java -jar <plantuml.jar> -charset UTF-8 -tpng docs/architecture/diagrams/CD-01-domain.puml
```

Lặp cho CD-02/DD-01/DD-02; kiểm tra trực quan bản xuất và cardinality/nhãn. Nếu sửa draw.io, cập nhật cùng PlantUML/Markdown để giữ nội dung tương đương; hai renderer có thể bố trí khác nhau.

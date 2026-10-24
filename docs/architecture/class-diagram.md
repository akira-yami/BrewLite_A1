# Class Diagram BrewLite

Đối chiếu ngày 24/10/2026 tại baseline `2bb2011`. CD-01 là mô hình domain theo [Prisma schema](../../apps/api/prisma/schema.prisma), không phải bằng chứng các service nghiệp vụ đã hoàn thành. CD-02 mô tả các lớp backend hiện có và method thực tế, giúp phân biệt với service được đề xuất trong SD-10/SD-11.

## CD-01: Domain

![CD-01 Domain](./diagrams/CD-01-domain.svg)

[Nguồn PlantUML](./diagrams/CD-01-domain.puml) · [draw.io lịch sử 22/10 — không dùng nộp hiện hành](./diagrams/archive/BrewLite-models.drawio) · [PNG](./diagrams/CD-01-domain.png).

Sơ đồ bao phủ 14 model: user, catalog, đơn/snapshot, payment, status history, reservation, coupon/redemption và loyalty ledger. Thuộc tính được rút gọn; timestamps, index và constraint chi tiết xem [entities](./entities.md), [database design](./database-design.md), [ERD](./erd.md) và migration SQL.

Multiplicity theo FK/schema: Order có 0..* item ở tầng dữ liệu, nhưng nghiệp vụ tạo đơn phải yêu cầu ít nhất một item. LoyaltyTransaction có order tùy chọn để hỗ trợ điều chỉnh điểm. Partial unique SQL giới hạn một payment SUCCEEDED và một EARN trên mỗi order; sơ đồ không thay các ràng buộc này. Đường liên kết biểu diễn association, không khẳng định cascade delete.

## CD-02: Lớp dịch vụ hiện có

![CD-02 Services](./diagrams/CD-02-services.svg)

[Nguồn PlantUML](./diagrams/CD-02-services.puml) · [PNG](./diagrams/CD-02-services.png). Nguồn lớp: [Auth](../../apps/api/src/modules/auth/auth.service.ts), [Catalog](../../apps/api/src/modules/catalog/services/catalog.service.ts), [Orders](../../apps/api/src/modules/orders/services/orders.service.ts), [Payments](../../apps/api/src/modules/payments/services/payments.service.ts).

Auth dùng UserRepository nội bộ; Orders đã có create/history/detail và gọi public CatalogService/UsersService/PromotionsService cùng transaction tạo đơn. PaymentsService đã có orchestration qua OrdersService, PaymentsRepository và MockGatewayService; không còn stub. Thiết kế CSR trong ADR-001 vẫn là đích: OrdersService/CatalogService có thao tác Prisma tx trực tiếp; OrdersRepository.markAsPaid hiện ghi loyalty ledger/số dư, chưa có LoyaltyService riêng.

Hai lớp cùng tên InventoryService đang tồn tại và được vẽ theo đường dẫn: Orders inject `modules/inventory/inventory.service.ts` (giữ tồn qua CatalogService), còn InventoryModule export `modules/inventory/services/inventory.service.ts` (qua InventoryRepository và job hết hạn). Không gộp chúng thành một lớp có dependency giả. Cần owner thống nhất luồng tích hợp; sơ đồ không sửa code hoặc xác nhận cancel/expiry/payment đã đồng bộ đầy đủ.

Khác biệt với UC-08/ADR-004 cần review: payment hiện chỉ nhận PENDING trong service; retry PAYMENT_FAILED, xử lý race unique key, kiểm tra hạn giữ và consume inventory/coupon chưa thể suy ra đã đủ từ endpoint hoặc unit test. Guards/DTO/mapper/JwtService rút gọn để giữ hình dễ đọc; xem source và SD-05/06 khi review. [Danh mục và enum](./diagrams/README.md) phân biệt thiết kế đích với snapshot code, không ép sơ đồ đích thành mô tả runtime.

Trạng thái tài liệu: bản bổ sung, chờ review độc lập; không tự ghi APPROVED. [Truy vết A1/A2](../traceability-matrix.md) nối từng phần sang UC/US/test.

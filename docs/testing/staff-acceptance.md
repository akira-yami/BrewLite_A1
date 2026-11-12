# Nghiệm thu Compose, state machine, Barista và quản lý kho

> **Ghi chú phạm vi.** File này tập trung vào **nghiệm thu Docker Compose, luồng Barista và
> quản lý kho**, với số liệu kiểm chứng chụp ngày 04/11/2026. Bộ test case nghiệp vụ và kết quả
> chạy mới nhất (cập nhật 12/11/2026) nằm ở [business-test-cases.md](business-test-cases.md).
> Các con số test trong file này thuộc đợt 04/11 và có thể khác bộ chạy mới nhất.

**Điều chỉnh quyền:** Barista chỉ xem/tìm/lọc kho; không sửa số lượng. PATCH tồn kho luôn trả 403. Các kết quả kiểm chứng cập nhật kho dưới đây là lịch sử trước thay đổi quyền, không còn là tiêu chí chấp nhận hiện hành.

Phạm vi đối chiếu: A1-9.5, A1-10.2, EXT-UC10 và EXT quản lý kho theo yêu cầu nhóm ngày 04/11/2026.

## Khởi chạy demo từ checkout sạch

1. Sao chép `.env.example` thành `.env`; tạo JWT_SECRET riêng và đặt POSTGRES_* cùng DATABASE_URL_DOCKER nhất quán.
2. Chạy `docker compose up -d --build`. Service migrate phải exit 0; PostgreSQL/backend/frontend phải healthy.
3. Chạy `docker compose --profile demo run --rm seed`. Seed tạo menu/công thức và barista, không dựng đơn thanh toán giả. Chạy lại không nhân bản catalog/tài khoản.
4. Mở `http://localhost:3000`, đăng ký Customer, tạo đơn và thanh toán E_WALLET. Chế độ deterministic: CARD thất bại để kiểm tra retry.
5. Dùng trình duyệt/phiên riêng đăng nhập Barista với `barista01` / `Barista@123`; mở `/barista`.

## Kịch bản nghiệm thu

- Đơn chưa PAID không có trong hàng đợi. PAID → Nhận đơn → PREPARING → Pha xong → READY → Đã giao khách → COMPLETED; đơn hoàn tất rời hàng đợi. Chi tiết của khách phản ánh trạng thái và lịch sử.
- Hai Barista nhận cùng một đơn: chỉ một người thành công, người còn lại nhận 409 và tải lại hàng đợi.
- Chuyển sai/bỏ bước bị chặn; COMPLETED/CANCELLED là trạng thái kết thúc. PAYMENT_FAILED phải retry qua PENDING.
- Khách có thể hủy đơn trước pha chế; hủy không chạy chen vào payment PROCESSING; đơn chưa thanh toán hoàn nguyên liệu/coupon một lần. Hủy PAID không mô phỏng hoàn tiền; UI giải thích trước khi xác nhận.
- Tab kho: chỉ tìm tên/mã, lọc tình trạng, xem đơn vị/số lượng. Không có nút/form sửa. Gọi PATCH trực tiếp bằng tài khoản Barista phải nhận 403 và stockQuantity/version không thay đổi.
- Thiếu JWT/Customer/tài khoản nhân viên bị vô hiệu không đọc hoặc sửa dữ liệu nhân viên.
- Kiểm tra màn hình 1440 px và 390 px: không tràn ngang, nút hành động rõ, đủ chi tiết size/đường/đá/topping/ghi chú, có loading/empty/error.

## Kiểm thử tự động

- Backend unit: `npm test --prefix apps/api`.
- PostgreSQL migration/integration: xem [README API](../../apps/api/README.md); dùng database riêng tên bắt đầu `brewlite_foundation_smoke`.
- `apps/api/test/order-state-machine.integration-spec.ts`: lifecycle, cạnh tranh, quyền và nhánh hủy.
- `apps/api/test/staff-inventory.integration-spec.ts`: HTTP/JWT/RBAC, filter/pagination, validation và concurrent update/reservation.
- Browser: `apps/web/tests/e2e/staff.spec.ts`, cùng checkout/retry đang có. Seed E2E tạo cùng tài khoản demo cố định như seed thông thường.
- Để chạy browser test với stack Compose có sẵn, đặt E2E_EXTERNAL_BASE_URL và E2E_API_URL; Playwright không tự khởi động server khi có E2E_EXTERNAL_BASE_URL.

## Kết quả kiểm chứng ngày 04/11/2026

| Hạng mục | Kết quả và phạm vi |
|---|---|
| Backend unit | 287 test đạt |
| Frontend unit/component/API | 76 test đạt |
| PostgreSQL migration + integration | 10 migration từ DB rỗng; deploy lần hai không đổi; 75 test/10 file đạt trên PostgreSQL 18 thật |
| HTTP E2E | 32 test/4 file đạt; bao gồm API thật với PostgreSQL cho checkout và HTTP guard/controller với provider mock cho Auth/staff |
| Browser E2E | 3 test Chromium đạt: checkout; CARD lỗi → retry cùng order; Barista xử lý đơn PAID→COMPLETED và cập nhật kho; API/DB thật |
| Giao diện | Đã xem ảnh desktop 1440 px và mobile 390 px; không tràn ngang. Kiểm tra riêng lỗi 409/tải lại/lưu với API mock cũng đạt |
| Cấu hình | 9 test env/Compose đạt; docs checker đạt; FE/BE typecheck và lint không có lỗi (còn cảnh báo cũ) |
| Build | Frontend production build thành công trong Docker; backend Nest build thành công. Các chỉnh sửa cuối đã qua typecheck/kiểm thử trình duyệt |
| Seed demo | Migrate DB demo riêng và chạy seed-demo hai lần thành công |

**Giới hạn Compose:** chưa nghiệm thu được toàn stack healthy từ volume rỗng. Docker Desktop lỗi EOF khi xuất image migrate, sau đó engine trả 500; restart thất bại vì socket `docker-secrets-engine/engine.sock` không truy cập được. Đây là điểm còn phải kiểm chứng lại sau khi Docker được khôi phục. Không reset Docker hoặc xóa volume để né lỗi. Thử đổi tên socket lỗi cũng bị hệ điều hành từ chối; không thay đổi được socket đó. Không đánh dấu A1-9.5 đã hoàn thành chỉ từ build/config pass.

Database thay thế dùng để kiểm thử là cluster PostgreSQL 18 tạm trong `.tmp`, cổng 5549, hai database `brewlite_foundation_smoke_review` và `brewlite_review_e2e`; không migrate/seed database ứng dụng hiện có. Bộ integration ban đầu bị gián đoạn khi Docker dừng đã được chạy lại đầy đủ và đạt trên cluster này. API, frontend và cluster tạm đã được dừng sau kiểm thử; giữ dữ liệu trong `.tmp` để chẩn đoán.

[Ảnh Barista desktop](evidence/staff-barista-desktop.png) · [Ảnh kho trên mobile](evidence/staff-inventory-mobile.png). Ảnh lấy từ lần browser test với API/DB thật; dữ liệu là dữ liệu kiểm thử.


Kiểm chứng sau khi bỏ quyền sửa kho: 5 integration test PostgreSQL đạt (Barista đọc được, PATCH 403 và số lượng/version giữ nguyên); 75 frontend test đạt; typecheck API/web và kiểm tra liên kết docs đạt.

## Khả dụng món theo công thức và nguyên liệu chung

API catalog dùng `variants[].available` boolean, không trả `availableServings` hoặc stock từng size. Modal chỉ hiển thị giá và “Có thể pha / Tạm hết nguyên liệu”. Số lượng trong bộ chọn là số ly khách muốn đặt, không phải tồn kho thành phẩm.

Backend cộng dồn nhu cầu của toàn bộ size/món/topping trên cùng ingredientId rồi kiểm tra và giữ nguyên liệu trong transaction. Test `orders.integration-spec.ts` xác minh 30 g nguyên liệu không cho đặt giỏ cần 40 g; giỏ cần đúng 30 g được nhận và mọi size dùng nguyên liệu đó trở thành không khả dụng khi tồn còn 0. Kiểm thử UI xác minh không còn nhãn “Còn N” và size thiếu nguyên liệu bị vô hiệu hóa.

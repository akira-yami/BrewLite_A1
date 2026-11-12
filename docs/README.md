# Tài liệu dự án BrewLite

> Đây là trang điều hướng (index) cho toàn bộ thư mục `docs/`.
> BrewLite là ứng dụng đặt cà phê không tiền mặt, monorepo **NestJS (API) + Next.js (Web)**.

Tài liệu được chia theo 5 nhóm. Mỗi mục bên dưới trỏ tới file hiện hành.

## 1. Quy trình & Scrum — [`scrum/`](scrum/README.md)

| Tài liệu | Nội dung |
|---|---|
| [Scrum BrewLite](scrum/README.md) | Vai trò, sự kiện Scrum, tiêu chí hoàn thành và mốc của 3 sprint từ 05/10 đến 15/11/2026. |
| [Sprint Backlog và phân công](scrum/phan-cong.md) | Công việc theo tuần, người phụ trách, reviewer, hạn và trạng thái theo từng thẻ Trello. |

## 2. Kiến trúc & dữ liệu — [`architecture/`](architecture/)

| Tài liệu | Nội dung |
|---|---|
| [ERD BrewLite](architecture/erd.md) | Sơ đồ quan hệ thực thể, nguyên tắc tồn kho theo nguyên liệu (BOM), reservation. |

## 3. Tri thức kỹ thuật — [`knowledge/`](knowledge/)

| Tài liệu | Nội dung |
|---|---|
| [Tầng Order (Orders Module)](knowledge/orders-module-knowledge.md) | Máy trạng thái đơn, luồng tạo đơn end-to-end, khóa dòng/CAS, cron hết hạn. |

## 4. Kiểm thử & nghiệm thu — [`testing/`](testing/)

| Tài liệu | Ngày | Vai trò |
|---|---|---|
| [Bộ test case theo nghiệp vụ](testing/business-test-cases.md) | **12/11/2026** | **Nguồn hiện hành** — Order/Payment/Concurrency/Auth/Loyalty + log bằng chứng. |
| [Bằng chứng Task 10 (A1)](testing/a1-task-10-review.md) | 10/11/2026 | 3 ca trọng tâm Task 10 cho nghiệm thu (tập con). |
| [Nghiệm thu Compose/Barista/kho](testing/staff-acceptance.md) | 04/11/2026 | Nghiệm thu Docker Compose, luồng Barista, quản lý kho. |
| [Reservation & seed demo](testing/reservation-and-demo-seed.md) | — | Vòng đời reservation/expiry và cách chạy lại seed demo. |

Bằng chứng chạy test (log + ảnh) nằm trong [`testing/evidence/`](testing/evidence/).

## 5. Giao diện — [`ui/`](ui/)

| Tài liệu | Nội dung |
|---|---|
| [Danh mục ảnh giao diện](ui/README.md) | 15 màn hình, bản desktop (1440px) và mobile (390px). |
| `ui/BrewLite.fig` | File thiết kế Figma (nhị phân). |

# Thiết kế Sequence Diagram: Module Auth (SD-05 & SD-06)

> **Mã thiết kế:** SD-05 (Đăng ký) & SD-06 (Đăng nhập + JWT/RBAC)  
> **Dự án:** BrewLite (Hệ thống đặt đồ uống & thanh toán)  
> **Sprint:** Sprint 1 / Sprint 2  
> **Tác giả:** Huy (Development Team - Auth)  
> **Người duyệt (Reviewer):** Dev Khang  
> **Trạng thái đối chiếu 22/10/2026:** Auth/JWT/session/RBAC/ownership trên route Auth đã có code và test (PR #6/#21/#22). Chưa ghi nhận approval độc lập trong hồ sơ này; không còn mô tả toàn bộ Auth là “chưa viết code”. Ownership order/payment vẫn là thiết kế cần tích hợp. Xem [handover Huy W3](../scrum/huy-week-03-handover.md) và [ma trận truy vết](../traceability-matrix.md).

---

## 1. Bối cảnh & Mục tiêu thiết kế

Theo yêu cầu nghiệp vụ và kiến trúc hệ thống BrewLite:
1. **Kiến trúc phân lớp:** Backend NestJS tuân thủ mô hình **Controller -> Service -> Repository -> Prisma ORM -> PostgreSQL**.
2. **Quy chuẩn bảo mật:**
   - Mật khẩu người dùng bắt buộc băm bằng **bcrypt** (salt rounds $\ge 10$), tuyệt đối không lưu plaintext.
   - Tuyệt đối không để lộ `passwordHash` trong response DTO, exception hay log hệ thống.
   - Chống tấn công dò danh tính người dùng (Username Enumeration): Khi đăng nhập sai tài khoản hoặc sai mật khẩu, backend đều trả về mã lỗi thống nhất `INVALID_CREDENTIALS` (401).
   - Kiểm soát quyền chặt chẽ theo **RBAC** (`CUSTOMER`, `BARISTA`) kết hợp xác thực phi trạng thái bằng **JWT Access Token**.
3. **Phân định rõ Happy Path & Error Paths:** Đảm bảo toàn bộ luồng lỗi ngoại lệ được chuẩn hóa theo envelope lỗi chung của BrewLite:
   ```json
   {
     "error": {
       "code": "MÃ_LỖI_CHUẨN",
       "message": "Thông điệp thân thiện với người dùng",
       "details": [],
       "requestId": "uuid"
     }
   }
   ```

---

## 2. SD-05: Sequence Diagram — Quy trình Đăng ký (Register)

### 2.1. Biểu đồ Sequence

```mermaid
sequenceDiagram
    autonumber
    actor C as Khách hàng
    participant FE as Frontend (RegisterForm / Next.js)
    participant AC as AuthController
    participant VP as ValidationPipe (DTO)
    participant AS as AuthService
    participant UR as UserRepository
    participant BC as BCrypt Library
    participant DB as PostgreSQL (Prisma)
    participant JS as JwtService

    C->>FE: 1. Nhập username, password (>= 6 ký tự), confirmPassword & bấm "Đăng ký"
    FE->>FE: 2. Client Validate (username 3-50 ký tự, password >= 6 ký tự, khớp confirmPassword)
    
    alt Validate client thất bại
        FE-->>C: 2a. Hiển thị lỗi trực tiếp tại form (không gửi request)
    else Validate client hợp lệ
        FE->>AC: 3. POST /api/v1/auth/register (RegisterDto)
        AC->>VP: 4. Kiểm tra DTO (@IsNotEmpty, @Length(3, 50), @Length(6, 100))
        
        alt DTO không hợp lệ (400 Bad Request)
            VP-->>AC: Validation failed
            AC-->>FE: 4a. 400 Bad Request (VALIDATION_ERROR + chi tiết lỗi fields)
            FE-->>C: Hiển thị lỗi tương ứng dưới từng ô input
        else DTO hợp lệ
            VP-->>AC: Validated RegisterDto
            AC->>AS: 5. register(registerDto)
            AS->>UR: 6. findByUsername(username)
            UR->>DB: 7. prisma.user.findUnique({ where: { username } })
            
            alt Tài khoản đã tồn tại (409 Conflict)
                DB-->>UR: User record tồn tại
                UR-->>AS: User entity
                AS-->>AC: 8a. throw ConflictException('USERNAME_ALREADY_EXISTS')
                AC-->>FE: 8b. 409 Conflict ({ error: { code: 'USERNAME_ALREADY_EXISTS', message: 'Tên đăng nhập đã tồn tại trong hệ thống.' } })
                FE-->>C: 8c. Hiển thị thông báo tài khoản đã tồn tại, gợi ý đăng nhập
            else Tài khoản chưa tồn tại (Happy Path)
                DB-->>UR: null
                UR-->>AS: null
                AS->>BC: 9. hash(password, saltRounds = 10)
                BC-->>AS: 10. passwordHash (chuỗi băm $2b$10$...)
                AS->>UR: 11. create({ username, passwordHash, role: CUSTOMER, isActive: true })
                UR->>DB: 12. prisma.user.create(...)
                DB-->>UR: 13. User record đã lưu
                UR-->>AS: 14. User entity (đã map, tách biệt passwordHash)
                AS->>JS: 15. signAsync({ sub: user.id, username: user.username, role: user.role })
                JS-->>AS: 16. accessToken (JWT)
                AS-->>AC: 17. AuthResultDto { user: { id, username, role, loyaltyBalance }, accessToken, expiresIn: 900 }
                Note over AC: Response DTO tuyệt đối KHÔNG có passwordHash
                AC-->>FE: 18. 201 Created ({ data: AuthResultDto, meta: { requestId } })
                FE->>FE: 19. Lưu accessToken vào memory / session, cập nhật Auth State
                FE-->>C: 20. Thông báo đăng ký thành công & điều hướng sang Menu/Trang chủ
            end
        end
    end
```

### 2.2. Chi tiết kỹ thuật & Hợp đồng dữ liệu (SD-05)

- **Endpoint:** `POST /api/v1/auth/register` (Public)
- **Request Body:**
  ```json
  {
    "username": "customer01",
    "password": "Password123!"
  }
  ```
- **Validation Rules:**
  - `username`: `@IsNotEmpty()`, `@IsString()`, `@Length(3, 50)`.
  - `password`: `@IsNotEmpty()`, `@IsString()`, `@Length(6, 100)`.
- **Response thành công (`201 Created`):**
  ```json
  {
    "data": {
      "user": {
        "id": "e6a17b8f-3d4c-4e89-9a1b-123456789abc",
        "username": "customer01",
        "role": "CUSTOMER",
        "loyaltyBalance": 0
      },
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 900
    },
    "meta": {
      "requestId": "req-01KABC..."
    }
  }
  ```
- **Error Paths:**
  1. `400 Bad Request`: Payload sai định dạng hoặc thiếu trường bắt buộc (`code: VALIDATION_ERROR`).
  2. `409 Conflict`: Username đã được đăng ký trước đó (`code: USERNAME_ALREADY_EXISTS`).

---

## 3. SD-06: Sequence Diagram — Luồng Đăng nhập (Login) + JWT/RBAC

### 3.1. Biểu đồ Sequence

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant FE as Frontend (LoginForm / Next.js)
    participant AC as AuthController
    participant AS as AuthService
    participant UR as UserRepository
    participant BC as BCrypt Library
    participant JS as JwtService
    participant SEC as JwtAuthGuard & RolesGuard
    participant OC as OrderController / ProtectedController
    participant DB as PostgreSQL (Prisma)

    %% Giai đoạn 1: Đăng nhập & Cấp phát JWT
    rect rgb(240, 248, 255)
    note right of U: Giai đoạn 1: Đăng nhập & Nhận Access Token
    U->>FE: 1. Nhập username/email & password, bấm "Đăng nhập"
    FE->>FE: 2. Validate client (không để trống input)
    FE->>AC: 3. POST /api/v1/auth/login (LoginDto)
    AC->>AS: 4. login(loginDto)
    AS->>UR: 5. findByUsername(username)
    UR->>DB: 6. prisma.user.findUnique({ where: { username } })
    
    alt Người dùng không tồn tại trong DB (401 Unauthorized)
        DB-->>UR: null
        UR-->>AS: null
        AS-->>AC: 7a. throw UnauthorizedException('INVALID_CREDENTIALS')
        AC-->>FE: 7b. 401 Unauthorized ({ error: { code: 'INVALID_CREDENTIALS', message: 'Tài khoản hoặc mật khẩu không chính xác.' } })
        FE-->>U: 7c. Hiển thị thông báo đăng nhập sai (không tiết lộ tài khoản tồn tại hay không)
    else Người dùng tồn tại
        DB-->>UR: User record (id, username, passwordHash, role, isActive)
        UR-->>AS: User entity
        
        alt Tài khoản bị khóa (isActive == false) (403 Forbidden)
            AS-->>AC: 8a. throw ForbiddenException('ACCOUNT_INACTIVE')
            AC-->>FE: 8b. 403 Forbidden ({ error: { code: 'ACCOUNT_INACTIVE', message: 'Tài khoản đã bị tạm khóa.' } })
            FE-->>U: 8c. Hiển thị thông báo tài khoản bị khóa, liên hệ nhóm vận hành
        else Tài khoản ACTIVE
            AS->>BC: 9. compare(plainPassword, user.passwordHash)
            
            alt Mật khẩu không trùng khớp (401 Unauthorized)
                BC-->>AS: false
                AS-->>AC: 10a. throw UnauthorizedException('INVALID_CREDENTIALS')
                AC-->>FE: 10b. 401 Unauthorized ({ error: { code: 'INVALID_CREDENTIALS', message: 'Tài khoản hoặc mật khẩu không chính xác.' } })
                FE-->>U: 10c. Hiển thị thông báo đăng nhập sai
            else Mật khẩu trùng khớp (Happy Path)
                BC-->>AS: true
                AS->>JS: 11. signAsync({ sub: user.id, username: user.username, role: user.role })
                JS-->>AS: 12. accessToken (JWT)
                AS-->>AC: 13. AuthResultDto { user: { id, username, role, loyaltyBalance }, accessToken, expiresIn: 900 }
                Note over AC: Response DTO tuyệt đối KHÔNG có passwordHash
                AC-->>FE: 14. 200 OK ({ data: AuthResultDto, meta: { requestId } })
                FE->>FE: 15. Cập nhật Auth State, lưu accessToken
                FE-->>U: 16. Chuyển hướng sang trang đích phù hợp với vai trò
            end
        end
    end
    end

    %% Giai đoạn 2: Gọi Protected API & Phân quyền RBAC
    rect rgb(245, 255, 245)
    note right of U: Giai đoạn 2: Xác thực & Phân quyền RBAC trên từng Request
    U->>FE: 17. Thực hiện thao tác bảo vệ (VD: chuyển trạng thái đơn hàng theo UC-10)
    FE->>SEC: 18. PATCH /api/v1/orders/:id/status (Header: "Authorization: Bearer <accessToken>")
    SEC->>JS: 19. Xác thực token (verify signature, expiration, issuer, audience)
    
    alt Token không hợp lệ hoặc đã hết hạn (401 Unauthorized)
        JS-->>SEC: TokenExpiredError / JsonWebTokenError
        SEC-->>FE: 20a. 401 Unauthorized ({ error: { code: 'UNAUTHORIZED', message: 'Token không hợp lệ hoặc đã hết hạn.' } })
        FE-->>U: 20b. Điều hướng người dùng về trang /login
    else Token hợp lệ
        JS-->>SEC: TokenPayload { sub: "uuid", username: "barista01", role: "BARISTA" }
        SEC->>SEC: 21. Gắn user payload vào request: req.user = payload
        SEC->>SEC: 22. RolesGuard kiểm tra @Roles(UserRole.BARISTA)
        
        alt Quyền không thỏa mãn (403 Forbidden - RBAC Chặn)
            SEC-->>FE: 23a. 403 Forbidden ({ error: { code: 'FORBIDDEN_RESOURCE', message: 'Bạn không có quyền truy cập chức năng này.' } })
            FE-->>U: 23b. Điều hướng hoặc hiển thị trang 403 Access Denied
        else Quyền hợp lệ (User có role BARISTA)
            SEC->>OC: 24. Cho phép request đi qua Controller & Service
            OC->>DB: 25. Cập nhật trạng thái đơn hàng
            DB-->>OC: Đơn hàng đã cập nhật
            OC-->>FE: 26. 200 OK ({ data: [...] })
            FE-->>U: 27. Hiển thị trạng thái đơn hàng cho Barista
        end
    end
    end

    %% Giai đoạn 3: Kiểm soát Quyền sở hữu (Ownership Guard & User Isolation)
    rect rgb(255, 250, 240)
    note right of U: Giai đoạn 3: Kiểm soát Quyền sở hữu (Ownership Guard & User Isolation)
    U->>FE: 28. Khách hàng A truy cập tài nguyên (VD: GET /api/v1/auth/users/:userId)
    FE->>SEC: 29. Gửi request kèm Bearer JWT của Khách hàng A
    SEC->>JS: 30. JwtAuthGuard xác thực token
    
    alt Token thiếu / hết hạn (401 Unauthorized)
        JS-->>SEC: Token không hợp lệ
        SEC-->>FE: 30a. 401 Unauthorized ({ error: { code: 'UNAUTHORIZED', message: 'Phiên đăng nhập đã hết hạn hoặc không còn hợp lệ. Vui lòng đăng nhập lại.' } })
        FE-->>U: 30b. Tự động xóa token phiên và chuyển về /login
    else Token hợp lệ
        JS-->>SEC: req.user = { id: "user-A", role: "CUSTOMER" }
        SEC->>SEC: 31. OwnershipGuard kiểm tra quyền sở hữu (req.user.id vs targetUserId)
        
        alt Khách hàng A truy cập tài nguyên của Khách hàng B (req.user.id != targetUserId)
            SEC-->>FE: 32a. 403 Forbidden ({ error: { code: 'FORBIDDEN_RESOURCE', message: 'Bạn không có quyền truy cập dữ liệu của người dùng khác.' } })
            FE-->>U: 32b. Hiển thị thông báo từ chối truy cập (Giữ nguyên phiên đăng nhập)
        else Khách hàng A truy cập tài nguyên của chính mình (req.user.id == targetUserId)
            SEC->>AC: 33. Cho phép truy cập Controller & Service
            AC->>DB: 34. Truy vấn dữ liệu người dùng A
            DB-->>AC: Dữ liệu người dùng A
            AC-->>FE: 35. 200 OK ({ data: userProfile })
            FE-->>U: 36. Hiển thị dữ liệu tài khoản
        else Người gọi là BARISTA (Role đặc quyền vận hành)
            SEC->>AC: 37. Barista được phép truy cập theo nghiệp vụ quầy
            AC-->>FE: 38. 200 OK ({ data: userProfile })
        end
    end
    end
```

### 3.2. Chi tiết kỹ thuật & Hợp đồng dữ liệu (SD-06)

- **Endpoint Login:** `POST /api/v1/auth/login` (Public)
- **Request Body:**
  ```json
  {
    "username": "customer01",
    "password": "Password123!"
  }
  ```
- **Response thành công (`200 OK`):**
  ```json
  {
    "data": {
      "user": {
        "id": "e6a17b8f-3d4c-4e89-9a1b-123456789abc",
        "username": "customer01",
        "role": "CUSTOMER",
        "loyaltyBalance": 0
      },
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 900
    },
    "meta": {
      "requestId": "req-01KDEF..."
    }
  }
  ```
- **Cấu trúc JWT Payload:**
  ```json
  {
    "sub": "e6a17b8f-3d4c-4e89-9a1b-123456789abc",
    "username": "customer01",
    "role": "CUSTOMER",
    "iat": 1727913600,
    "exp": 1727914500,
    "iss": "brewlite-api",
    "aud": "brewlite-web"
  }
  ```
- **Bảo vệ Endpoint & Phân quyền RBAC:**
  - `@UseGuards(JwtAuthGuard, RolesGuard)`: Gắn tại Controller hoặc Method.
  - `@Roles(UserRole.BARISTA)`: Khai báo danh sách vai trò được phép truy cập.
  - `@CurrentUser()`: Custom Decorator trích xuất thông tin người dùng từ `req.user` để kiểm tra ownership (ví dụ `user.id === order.userId`).
  - `@UseGuards(JwtAuthGuard, OwnershipGuard)`: Bảo vệ các endpoint dữ liệu tài khoản nhạy cảm, ngăn ngừa User Isolation Violation (Khách hàng A không thể xem dữ liệu của Khách hàng B).

### 3.3. Chuẩn hóa Phân quyền, Quyền sở hữu & Ma trận Mã lỗi

| Mã HTTP | Mã lỗi chuẩn (`code`) | Ngữ cảnh xảy ra | Hành vi Client (Frontend) |
|---|---|---|---|
| **401 Unauthorized** | `UNAUTHORIZED` | Thiếu token, token hết hạn, sai chữ ký số HMAC-SHA256, sai issuer/audience. | Tự động hủy phiên đăng nhập, xóa token lưu trữ và điều hướng về trang Đăng nhập (`/login`). |
| **401 Unauthorized** | `INVALID_CREDENTIALS` | Sai username hoặc password lúc đăng nhập (chống username enumeration). | Hiển thị thông báo "Tài khoản hoặc mật khẩu không chính xác.", không xóa phiên hiện hữu nếu có. |
| **403 Forbidden** | `FORBIDDEN_RESOURCE` | Đã đăng nhập nhưng không đủ vai trò (ví dụ: `CUSTOMER` gọi API của `BARISTA`), hoặc vi phạm quyền sở hữu (User A cố đọc dữ liệu User B). | Hiển thị thông báo từ chối truy cập rõ ràng, **giữ nguyên phiên đăng nhập** hợp lệ của người dùng. |
| **403 Forbidden** | `ACCOUNT_INACTIVE` | Tài khoản bị tạm khóa hoặc chưa kích hoạt (`isActive == false`). | Hiển thị thông báo tài khoản bị khóa, đề nghị liên hệ quản trị. |
| **404 Not Found** | `ORDER_NOT_FOUND` | Khách hàng A cố tình truy vấn/sửa đơn hàng của Khách hàng B (theo `security.md`). | Trả về 404 để chống tấn công dò quét (UUID enumeration) sự tồn tại đơn hàng của người khác. |

---

## 4. Mã nguồn PlantUML (Đồng bộ với Draw.io Master)

Để nhóm có thể nhúng trực tiếp vào tab **Sequence Diagram** trong file Draw.io master của BrewLite (đồng bộ với `SD-11` của Kiệt và `SD-07B` của Hoàng):

### 4.1. PlantUML cho SD-05 (Đăng ký tài khoản - UC-01)
[Nguồn PlantUML](./diagrams/SD-05-registration.puml) · [PNG](./diagrams/SD-05-registration.png)

![SD-05-registration](./diagrams/SD-05-registration.svg)

### 4.2. PlantUML cho SD-06 (Đăng nhập + JWT/RBAC - UC-02)
[Nguồn PlantUML](./diagrams/SD-06-login-rbac.puml) · [PNG](./diagrams/SD-06-login-rbac.png)

![SD-06-login-rbac](./diagrams/SD-06-login-rbac.svg)

---

## 5. Checklist Đối soát Bảo mật & Nghiệp vụ (Definition of Done)

Trước khi chuyển sang giai đoạn code (Implementation), tài liệu thiết kế này đảm bảo các điều kiện sau:

| STT | Hạng mục kiểm tra | Giải pháp trong thiết kế SD-05 & SD-06 | Đạt yêu cầu |
|---|---|---|:---:|
| 1 | **Băm mật khẩu an toàn** | Sử dụng BCrypt với salt rounds = 10; mật khẩu gốc không bao giờ lưu DB | [x] |
| 2 | **Không rò rỉ Password Hash** | Cắt bỏ `passwordHash` tại Repository Mapper và DTO trước khi trả về Controller | [x] |
| 3 | **Chống Username Enumeration** | Cả 2 trường hợp sai username hoặc sai password đều trả về `INVALID_CREDENTIALS` (401) | [x] |
| 4 | **Validate chặt chẽ đầu vào** | `ValidationPipe` whitelist strict, chặn payload thừa và kiểm tra username 3-50 / password >= 6 | [x] |
| 5 | **RBAC & JWT chuẩn mực** | Phân quyền 2 role thống nhất (`CUSTOMER`, `BARISTA`), từ chối 403 khi thiếu role | [x] |
| 6 | **Xử lý tài khoản khóa** | Kiểm tra `isActive === false` và trả `ACCOUNT_INACTIVE` (403) ngay tại bước login | [x] |
| 7 | **Khớp nối Đặc tả Use Case** | Tương ứng 1:1 với `UC-01` (Đăng ký) và `UC-02` (Đăng nhập & RBAC) | [x] |

---

## 6. Phê duyệt thiết kế (Sign-off)

- **Người lập thiết kế:** Huy (Development Team - Auth) — *Đã hoàn thiện SD-05 và SD-06*
- **Người duyệt:** Dev Khang (Reviewer / Project Owner)
- **Ý kiến duyệt:** 
  > Thiết kế SD-05 và SD-06 đã đối soát chính xác với Usecase tổng thể (UC-01, UC-02) trong Draw.io master và các nguyên tắc bảo mật bắt buộc (BCrypt salt >= 10, chống Username Enumeration, RBAC đa vai trò). Đủ điều kiện chuyển sang giai đoạn TDD Implementation.
- **Trạng thái:** ✅ **ĐÃ PHÊ DUYỆT (GATE 1 APPROVED BỞI DEV KHANG - 08/10/2026)**

import { 
  IsString, 
  IsNotEmpty, 
  IsNumber, 
  IsEnum, 
  IsUUID, 
  Min 
} from 'class-validator';

export enum PaymentMethod {
  E_WALLET = 'E_WALLET',
  CREDIT_CARD = 'CREDIT_CARD',
}

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'orderId không được để trống' })
  orderId: string;             // Mã đơn hàng cần thanh toán

  @IsNumber()
  @Min(1000, { message: 'Số tiền thanh toán tối thiểu là 1,000 VND' })
  amount: number;              // Số tiền (vd: 50000)
  
  @IsEnum(PaymentMethod, { message: 'Phương thức thanh toán không hợp lệ' })
  @IsNotEmpty()
  method: PaymentMethod;       // Phương thức thanh toán
  
  // Các cờ phục vụ Idempotency (Task 10-B)
  // UUID cực kỳ quan trọng để bắt chuẩn Idempotency (Task 10-B)
  @IsUUID(4, { message: 'Idempotency-Key phải là chuẩn UUID v4' })
  @IsNotEmpty()
  idempotencyKey: string;      // UUID duy nhất cho mỗi nỗ lực thanh toán từ Client

  @IsString()
  @IsNotEmpty({ message: 'Request Hash không được để trống' })
  requestHash: string;         // Chuỗi hash payload để chống giả mạo/thay đổi dữ liệu
}
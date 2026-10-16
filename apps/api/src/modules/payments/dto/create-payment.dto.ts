import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsUUID,
} from 'class-validator';

export enum PaymentMethod {
  E_WALLET = 'E_WALLET',
  CARD = 'CARD',
}

export class CreatePaymentDto {
  @IsString()
  @IsUUID(4, { message: 'orderId phải là chuẩn UUID v4' })
  @IsNotEmpty({ message: 'orderId không được để trống' })
  orderId: string; // Chỉ nhận UUID của đơn hàng


  @IsEnum(PaymentMethod, { message: 'Phương thức thanh toán không hợp lệ' })
  @IsNotEmpty()
  method: PaymentMethod;       // Phương thức thanh toán

  // LƯU Ý BẢO MẬT:
  // ĐÃ XÓA VÌ KHÔNG NHẬN: amount (sẽ lấy từ DB: order.total) và requestHash (Server sẽ tự tính bằng SHA-256 ở Sprint 2)
  // ĐÃ XÓA: idempotencyKey (Sẽ được lấy từ HTTP Header trong Controller)
}
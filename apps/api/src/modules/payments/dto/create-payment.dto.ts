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

  // ĐÃ XÓA: amount và requestHash (Server sẽ tự tính ở Sprint 2)
  // ĐÃ XÓA: idempotencyKey (Sẽ được lấy từ HTTP Header trong Controller)
}
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * DTO cho Barista hủy đơn PAID (kèm lý do bắt buộc).
 * Customer hủy không cần body — lý do được cố định trong controller.
 */
export class BaristaCanclePaidOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'Barista phải cung cấp lý do hủy đơn.' })
  @MaxLength(255, { message: 'Lý do hủy không được vượt quá 255 ký tự.' })
  reason: string;
}

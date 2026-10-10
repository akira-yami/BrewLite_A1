import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePaymentDto, PaymentMethod } from './create-payment.dto.js';
import { describe, it, expect } from 'vitest';

describe('CreatePaymentDto Validation', () => {
  // Dùng chuỗi UUID chuẩn version 4 (Lưu ý cụm thứ 3 bắt đầu bằng số 4: 42d3)
  const validUUIDv4 = '123e4567-e89b-42d3-a456-426614174000';

  it('1. Nên PASS khi dữ liệu hoàn toàn hợp lệ', async () => {
    const data = {
      orderId: validUUIDv4,
      method: PaymentMethod.E_WALLET,
    };
    
    const dto = plainToInstance(CreatePaymentDto, data);
    const errors = await validate(dto);
    
    // Kỳ vọng không có lỗi nào
    expect(errors.length).toBe(0);
  });

  it('2. Nên FAIL khi orderId không phải UUID', async () => {
    const data = {
      orderId: 'not-a-valid-uuid-string', 
      method: PaymentMethod.CARD,
    };
    
    const dto = plainToInstance(CreatePaymentDto, data);
    const errors = await validate(dto);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('orderId'); 
  });

  it('3. Nên FAIL khi PaymentMethod không hợp lệ (vd: dùng lại CREDIT_CARD cũ)', async () => {
    const data = {
      orderId: validUUIDv4,
      method: 'CREDIT_CARD', // Giá trị ngoài Enum
    };
    
    const dto = plainToInstance(CreatePaymentDto, data);
    const errors = await validate(dto);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('method'); 
  });
});
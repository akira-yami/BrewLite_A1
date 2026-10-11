import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { LoginDto } from './login.dto.js';

describe('LoginDto Validation', () => {
  it('passes with valid username and password', async () => {
    const dto = plainToInstance(LoginDto, {
      username: 'customer_01',
      password: 'password123',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('trims leading and trailing spaces in username', async () => {
    const dto = plainToInstance(LoginDto, {
      username: '  customer_01  ',
      password: 'password123',
    });
    expect(dto.username).toBe('customer_01');
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects empty username or password', async () => {
    const dto = plainToInstance(LoginDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(2);
  });
});

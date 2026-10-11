import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { RegisterDto } from './register.dto.js';

describe('RegisterDto Validation', () => {
  it('passes with valid username and password', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: 'customer_01',
      password: 'password123',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('trims leading and trailing spaces in username', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: '  valid_user  ',
      password: 'password123',
    });
    expect(dto.username).toBe('valid_user');
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects username shorter than 3 characters', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: 'ab',
      password: 'password123',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('username');
  });

  it('rejects username longer than 50 characters', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: 'a'.repeat(51),
      password: 'password123',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('username');
  });

  it('rejects username with invalid characters like spaces or special symbols', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: 'user@name!',
      password: 'password123',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('username');
  });

  it('rejects password shorter than 6 characters', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: 'valid_user',
      password: '12345',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('password');
  });

  it('rejects empty fields', async () => {
    const dto = plainToInstance(RegisterDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(2);
  });
});

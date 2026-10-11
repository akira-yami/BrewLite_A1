import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  const strategy = new JwtStrategy();

  it('validates payload successfully when sub is present', async () => {
    const payload = { sub: 'user-123', username: 'john_doe', role: 'USER' };
    const result = await strategy.validate(payload);
    expect(result).toEqual({
      id: 'user-123',
      sub: 'user-123',
      username: 'john_doe',
      role: 'USER',
    });
  });

  it('throws UnauthorizedException when sub is missing', async () => {
    const payload = { sub: '', username: 'john_doe', role: 'USER' };
    await expect(strategy.validate(payload as unknown as { sub: string; username: string; role: string })).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

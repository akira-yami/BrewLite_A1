import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { getCurrentUserFromContext } from './current-user.decorator.js';

describe('CurrentUser Decorator', () => {
  const createContext = (user: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('returns full user object when data property is undefined', () => {
    const mockUser = { id: 'uuid-1', username: 'testuser', role: 'USER' };
    const ctx = createContext(mockUser);
    const result = getCurrentUserFromContext(undefined, ctx);
    expect(result).toEqual(mockUser);
  });

  it('returns specific property when property name is provided', () => {
    const mockUser = { id: 'uuid-1', username: 'testuser', role: 'USER' };
    const ctx = createContext(mockUser);
    const id = getCurrentUserFromContext('id', ctx);
    const username = getCurrentUserFromContext('username', ctx);
    const role = getCurrentUserFromContext('role', ctx);

    expect(id).toBe('uuid-1');
    expect(username).toBe('testuser');
    expect(role).toBe('USER');
  });

  it('returns undefined if request has no user', () => {
    const ctx = createContext(undefined);
    const result = getCurrentUserFromContext('id', ctx);
    expect(result).toBeUndefined();
  });
});

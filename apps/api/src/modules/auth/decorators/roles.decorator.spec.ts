import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { UserRole } from '../../../generated/prisma/client.js';
import { ROLES_KEY, Roles } from './roles.decorator.js';

describe('Roles Decorator', () => {
  it('sets roles metadata on target class or method', () => {
    class TestController {
      @Roles(UserRole.ADMIN, UserRole.USER)
      testMethod(this: void) {}
    }

    const reflector = new Reflector();
    const roles = reflector.get<UserRole[]>(ROLES_KEY, TestController.prototype.testMethod);
    expect(roles).toEqual([UserRole.ADMIN, UserRole.USER]);
  });
});

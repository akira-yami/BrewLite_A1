import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UserRole } from '../../generated/prisma/client.js';

describe('AuthController (Unit Test - TDD)', () => {
  let controller: AuthController;
  let authServiceMock: {
    register: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    getProfile: ReturnType<typeof vi.fn>;
  };

  const mockSafeUser = {
    id: 'test-uuid',
    username: 'testuser',
    role: UserRole.USER,
    loyaltyBalance: 0,
    isActive: true,
    createdAt: new Date('2026-10-10T00:00:00Z'),
    updatedAt: new Date('2026-10-10T00:00:00Z'),
  };

  beforeEach(() => {
    authServiceMock = {
      register: vi.fn(),
      login: vi.fn(),
      getProfile: vi.fn(),
    };

    controller = new AuthController(authServiceMock as unknown as AuthService);
  });

  it('should call authService.register and return data enveloped auth result', async () => {
    authServiceMock.register.mockResolvedValue({
      user: mockSafeUser,
      accessToken: 'jwt-access-token',
      expiresIn: 900,
    });

    const dto = { username: 'testuser', password: 'Password123!' };
    const res = await controller.register(dto);

    expect(authServiceMock.register).toHaveBeenCalledWith(dto);
    expect(res).toHaveProperty('data');
    expect(res.data.user.username).toBe('testuser');
    expect(res.data.accessToken).toBe('jwt-access-token');
    expect(res.data.expiresIn).toBe(900);
  });

  it('should call authService.login and return data enveloped token and user', async () => {
    authServiceMock.login.mockResolvedValue({
      user: mockSafeUser,
      accessToken: 'jwt-access-token',
      expiresIn: 900,
    });

    const dto = { username: 'testuser', password: 'Password123!' };
    const res = await controller.login(dto);

    expect(authServiceMock.login).toHaveBeenCalledWith(dto);
    expect(res).toHaveProperty('data');
    expect(res.data.user.username).toBe('testuser');
    expect(res.data.accessToken).toBe('jwt-access-token');
    expect(res.data.expiresIn).toBe(900);
  });

  it('should return profile wrapped in data envelope for the authenticated user via me endpoint', async () => {
    authServiceMock.getProfile.mockResolvedValue(mockSafeUser);

    const user = { sub: 'test-uuid', username: 'testuser', role: UserRole.USER };
    const res = await controller.getMe(user);

    expect(authServiceMock.getProfile).toHaveBeenCalledWith('test-uuid');
    expect(res).toHaveProperty('data');
    expect(res.data.id).toBe('test-uuid');
    expect(res.data.username).toBe('testuser');
  });
});

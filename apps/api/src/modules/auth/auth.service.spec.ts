import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { UserRole } from '../../generated/prisma/client.js';

describe('AuthService (Unit Test - TDD)', () => {
  let authService: AuthService;
  let prismaMock: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
  let jwtServiceMock: {
    signAsync: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };

    jwtServiceMock = {
      signAsync: vi.fn().mockResolvedValue('mocked-jwt-token'),
    };

    authService = new AuthService(
      prismaMock as unknown as PrismaService,
      jwtServiceMock as unknown as JwtService,
    );
  });

  describe('register', () => {
    const registerDto = {
      username: 'testuser',
      password: 'StrongPassword123!',
    };

    it('should hash password with bcrypt and create a user with default CUSTOMER role without exposing passwordHash', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      let createdUserRecord: any = null;
      prismaMock.user.create.mockImplementation(async ({ data }) => {
        createdUserRecord = {
          id: 'mock-uuid-1',
          username: data.username,
          passwordHash: data.passwordHash,
          role: data.role || UserRole.CUSTOMER,
          loyaltyBalance: 0,
          isActive: true,
          createdAt: new Date('2026-10-10T00:00:00Z'),
          updatedAt: new Date('2026-10-10T00:00:00Z'),
        };
        return createdUserRecord;
      });

      const result = await authService.register(registerDto);

      // Verify user lookup
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'testuser' },
      });

      // Verify password hashed using bcrypt
      expect(createdUserRecord).toBeDefined();
      expect(createdUserRecord.passwordHash).not.toEqual('StrongPassword123!');
      const isBcryptMatch = bcrypt.compareSync('StrongPassword123!', createdUserRecord.passwordHash);
      expect(isBcryptMatch).toBe(true);

      // Verify response structure and security (NO passwordHash leaked)
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken', 'mocked-jwt-token');
      expect(result.user.username).toBe('testuser');
      expect(result.user.role).toBe(UserRole.CUSTOMER);
      expect((result.user as any).passwordHash).toBeUndefined();
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('should throw ConflictException if username is already registered', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'existing-id',
        username: 'testuser',
      });

      await expect(authService.register(registerDto)).rejects.toThrow(ConflictException);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginDto = {
      username: 'testuser',
      password: 'CorrectPassword123!',
    };

    const hashedPassword = bcrypt.hashSync('CorrectPassword123!', 10);

    it('should authenticate user, verify bcrypt password, and return JWT token and safe user payload', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        username: 'testuser',
        passwordHash: hashedPassword,
        role: UserRole.CUSTOMER,
        loyaltyBalance: 100,
        isActive: true,
      });

      const result = await authService.login(loginDto);

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-uuid-1',
          username: 'testuser',
          role: UserRole.CUSTOMER,
        }),
      );

      expect(result.accessToken).toBe('mocked-jwt-token');
      expect(result.user.id).toBe('user-uuid-1');
      expect(result.user.username).toBe('testuser');
      expect(result.user.role).toBe(UserRole.CUSTOMER);
      expect((result.user as any).passwordHash).toBeUndefined();
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('should throw UnauthorizedException when username does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        username: 'testuser',
        passwordHash: hashedPassword,
        role: UserRole.CUSTOMER,
        isActive: true,
      });

      await expect(
        authService.login({
          username: 'testuser',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if account is deactivated', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        username: 'testuser',
        passwordHash: hashedPassword,
        role: UserRole.CUSTOMER,
        isActive: false,
      });

      await expect(authService.login(loginDto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getProfile', () => {
    it('should return user profile without passwordHash', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        username: 'testuser',
        passwordHash: 'secret-hash',
        role: UserRole.CUSTOMER,
        loyaltyBalance: 50,
        isActive: true,
        createdAt: new Date('2026-10-10T00:00:00Z'),
        updatedAt: new Date('2026-10-10T00:00:00Z'),
      });

      const profile = await authService.getProfile('user-uuid-1');
      expect(profile.id).toBe('user-uuid-1');
      expect(profile.username).toBe('testuser');
      expect(profile.role).toBe(UserRole.CUSTOMER);
      expect((profile as any).passwordHash).toBeUndefined();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(authService.getProfile('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });
});

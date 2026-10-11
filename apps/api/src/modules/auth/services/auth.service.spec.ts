import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { UserRepository } from '../repositories/user.repository.js';
import { UserRole } from '../../../generated/prisma/client.js';

describe('AuthService (Unit Test - TDD)', () => {
  let authService: AuthService;
  let userRepositoryMock: {
    findByUsername: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let jwtServiceMock: {
    signAsync: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    userRepositoryMock = {
      findByUsername: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    };

    jwtServiceMock = {
      signAsync: vi.fn().mockResolvedValue('mocked-jwt-token'),
    };

    authService = new AuthService(
      userRepositoryMock as unknown as UserRepository,
      jwtServiceMock as unknown as JwtService,
    );
  });

  describe('register', () => {
    const registerDto = {
      username: 'testuser',
      password: 'StrongPassword123!',
    };

    it('should hash password with bcrypt and create a user with default USER role without exposing passwordHash and return expiresIn: 900', async () => {
      userRepositoryMock.findByUsername.mockResolvedValue(null);

      let createdUserRecord: any = null;
      userRepositoryMock.create.mockImplementation(async ({ username, passwordHash, role }) => {
        createdUserRecord = {
          id: 'mock-uuid-1',
          username,
          passwordHash,
          role: role || UserRole.USER,
          loyaltyBalance: 0,
          isActive: true,
          createdAt: new Date('2026-10-10T00:00:00Z'),
          updatedAt: new Date('2026-10-10T00:00:00Z'),
        };
        return createdUserRecord;
      });

      const result = await authService.register(registerDto);

      // Verify user lookup
      expect(userRepositoryMock.findByUsername).toHaveBeenCalledWith('testuser');

      // Verify password hashed using bcrypt
      expect(createdUserRecord).toBeDefined();
      expect(createdUserRecord.passwordHash).not.toEqual('StrongPassword123!');
      const isBcryptMatch = bcrypt.compareSync('StrongPassword123!', createdUserRecord.passwordHash);
      expect(isBcryptMatch).toBe(true);

      // Verify response structure and security
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken', 'mocked-jwt-token');
      expect(result).toHaveProperty('expiresIn', 900);
      expect(result.user.username).toBe('testuser');
      expect(result.user.role).toBe(UserRole.USER);
      expect((result.user as any).passwordHash).toBeUndefined();
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('should throw ConflictException with USERNAME_ALREADY_EXISTS if username is already registered', async () => {
      userRepositoryMock.findByUsername.mockResolvedValue({
        id: 'existing-id',
        username: 'testuser',
      });

      try {
        await authService.register(registerDto);
        expect.fail('Should have thrown ConflictException');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const res = (err as ConflictException).getResponse() as any;
        expect(res.error.code).toBe('USERNAME_ALREADY_EXISTS');
      }
      expect(userRepositoryMock.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginDto = {
      username: 'testuser',
      password: 'CorrectPassword123!',
    };

    const hashedPassword = bcrypt.hashSync('CorrectPassword123!', 10);

    it('should authenticate user, verify bcrypt password, and return JWT token, safe user payload and expiresIn: 900', async () => {
      userRepositoryMock.findByUsername.mockResolvedValue({
        id: 'user-uuid-1',
        username: 'testuser',
        passwordHash: hashedPassword,
        role: UserRole.USER,
        loyaltyBalance: 100,
        isActive: true,
      });

      const result = await authService.login(loginDto);

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-uuid-1',
          username: 'testuser',
          role: UserRole.USER,
        }),
      );

      expect(result.accessToken).toBe('mocked-jwt-token');
      expect(result.expiresIn).toBe(900);
      expect(result.user.id).toBe('user-uuid-1');
      expect(result.user.username).toBe('testuser');
      expect(result.user.role).toBe(UserRole.USER);
      expect((result.user as any).passwordHash).toBeUndefined();
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('should throw UnauthorizedException with INVALID_CREDENTIALS when username does not exist', async () => {
      userRepositoryMock.findByUsername.mockResolvedValue(null);

      try {
        await authService.login(loginDto);
        expect.fail('Should have thrown UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const res = (err as UnauthorizedException).getResponse() as any;
        expect(res.error.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('should throw UnauthorizedException with INVALID_CREDENTIALS when password is wrong', async () => {
      userRepositoryMock.findByUsername.mockResolvedValue({
        id: 'user-uuid-1',
        username: 'testuser',
        passwordHash: hashedPassword,
        role: UserRole.USER,
        isActive: true,
      });

      try {
        await authService.login({
          username: 'testuser',
          password: 'WrongPassword!',
        });
        expect.fail('Should have thrown UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const res = (err as UnauthorizedException).getResponse() as any;
        expect(res.error.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('should throw ForbiddenException with ACCOUNT_INACTIVE if account is deactivated', async () => {
      userRepositoryMock.findByUsername.mockResolvedValue({
        id: 'user-uuid-1',
        username: 'testuser',
        passwordHash: hashedPassword,
        role: UserRole.USER,
        isActive: false,
      });

      try {
        await authService.login(loginDto);
        expect.fail('Should have thrown ForbiddenException');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const res = (err as ForbiddenException).getResponse() as any;
        expect(res.error.code).toBe('ACCOUNT_INACTIVE');
      }
    });
  });

  describe('getProfile', () => {
    it('should return user profile without passwordHash', async () => {
      userRepositoryMock.findById.mockResolvedValue({
        id: 'user-uuid-1',
        username: 'testuser',
        passwordHash: 'secret-hash',
        role: UserRole.USER,
        loyaltyBalance: 50,
        isActive: true,
        createdAt: new Date('2026-10-10T00:00:00Z'),
        updatedAt: new Date('2026-10-10T00:00:00Z'),
      });

      const profile = await authService.getProfile('user-uuid-1');
      expect(profile.id).toBe('user-uuid-1');
      expect(profile.username).toBe('testuser');
      expect(profile.role).toBe(UserRole.USER);
      expect((profile as any).passwordHash).toBeUndefined();
    });

    it('should throw NotFoundException with USER_NOT_FOUND if user does not exist', async () => {
      userRepositoryMock.findById.mockResolvedValue(null);

      try {
        await authService.getProfile('non-existent-id');
        expect.fail('Should have thrown NotFoundException');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        const res = (err as NotFoundException).getResponse() as any;
        expect(res.error.code).toBe('USER_NOT_FOUND');
      }
    });
  });
});

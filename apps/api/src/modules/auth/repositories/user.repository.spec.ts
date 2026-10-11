import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRepository } from './user.repository.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { UserRole } from '../../../generated/prisma/client.js';

describe('UserRepository (Unit Test - TDD)', () => {
  let repository: UserRepository;
  let prismaMock: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };

    repository = new UserRepository(prismaMock as unknown as PrismaService);
  });

  describe('findByUsername', () => {
    it('should query prisma.user.findUnique with username', async () => {
      const mockUser = { id: 'uuid-1', username: 'john_doe', role: UserRole.USER };
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      const result = await repository.findByUsername('john_doe');

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'john_doe' },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('findById', () => {
    it('should query prisma.user.findUnique with id', async () => {
      const mockUser = { id: 'uuid-1', username: 'john_doe', role: UserRole.USER };
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      const result = await repository.findById('uuid-1');

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('create', () => {
    it('should create user with default USER role if role is not provided', async () => {
      const createdUser = {
        id: 'uuid-1',
        username: 'john_doe',
        passwordHash: 'hashed_pwd',
        role: UserRole.USER,
      };
      prismaMock.user.create.mockResolvedValue(createdUser);

      const result = await repository.create({
        username: 'john_doe',
        passwordHash: 'hashed_pwd',
      });

      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          username: 'john_doe',
          passwordHash: 'hashed_pwd',
          role: UserRole.USER,
        },
      });
      expect(result).toEqual(createdUser);
    });

    it('should create user with specified role', async () => {
      const createdAdmin = {
        id: 'uuid-2',
        username: 'admin_user',
        passwordHash: 'hashed_pwd',
        role: UserRole.ADMIN,
      };
      prismaMock.user.create.mockResolvedValue(createdAdmin);

      const result = await repository.create({
        username: 'admin_user',
        passwordHash: 'hashed_pwd',
        role: UserRole.ADMIN,
      });

      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          username: 'admin_user',
          passwordHash: 'hashed_pwd',
          role: UserRole.ADMIN,
        },
      });
      expect(result).toEqual(createdAdmin);
    });
  });
});

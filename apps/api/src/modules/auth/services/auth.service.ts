import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { UserRole } from '../../../generated/prisma/client.js';
import { UserRepository } from '../repositories/user.repository.js';
import { LoginDto } from '../dto/login.dto.js';
import { RegisterDto } from '../dto/register.dto.js';

export interface SafeUser {
  id: string;
  username: string;
  role: UserRole;
  loyaltyBalance: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResult {
  user: SafeUser;
  accessToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;
  private readonly tokenExpiresInSeconds = 900; // 15 phút (SD-05, SD-06, api-spec.md)

  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Đăng ký tài khoản người dùng mới.
   * Mật khẩu được băm qua bcrypt với cost factor 10.
   * Role mặc định là USER theo quy ước đã chốt.
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.userRepository.findByUsername(dto.username);

    if (existing) {
      throw new ConflictException({
        error: {
          code: 'USERNAME_ALREADY_EXISTS',
          message: 'Tên đăng nhập đã tồn tại trong hệ thống.',
        },
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);

    const user = await this.userRepository.create({
      username: dto.username,
      passwordHash,
      role: UserRole.USER,
    });

    const accessToken = await this.generateToken(user.id, user.username, user.role);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      expiresIn: this.tokenExpiresInSeconds,
    };
  }

  /**
   * Đăng nhập xác thực người dùng.
   * Sử dụng bcrypt.compare và thông báo lỗi INVALID_CREDENTIALS đồng nhất.
   */
  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.userRepository.findByUsername(dto.username);

    if (!user) {
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Thông tin đăng nhập không chính xác.',
        },
      });
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Thông tin đăng nhập không chính xác.',
        },
      });
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Tài khoản đã bị tạm khóa hoặc chưa kích hoạt.',
        },
      });
    }

    const accessToken = await this.generateToken(user.id, user.username, user.role);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      expiresIn: this.tokenExpiresInSeconds,
    };
  }

  /**
   * Lấy thông tin người dùng an toàn theo ID.
   */
  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Không tìm thấy người dùng.',
        },
      });
    }

    return this.sanitizeUser(user);
  }

  private async generateToken(userId: string, username: string, role: UserRole): Promise<string> {
    return this.jwtService.signAsync({
      sub: userId,
      username,
      role,
    });
  }

  private sanitizeUser(user: {
    id: string;
    username: string;
    passwordHash?: string;
    role: UserRole;
    loyaltyBalance: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): SafeUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      loyaltyBalance: user.loyaltyBalance,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

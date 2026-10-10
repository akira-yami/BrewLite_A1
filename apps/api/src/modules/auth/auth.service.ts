import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service.js';
import { UserRole } from '../../generated/prisma/client.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

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
}

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Đăng ký tài khoản khách hàng mới.
   * Mật khẩu được băm qua bcrypt với cost factor 10.
   * Role mặc định là CUSTOMER theo chuẩn nghiệp vụ.
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        errorCode: 'E_USERNAME_ALREADY_EXISTS',
        message: 'Tên đăng nhập đã tồn tại trong hệ thống.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        role: UserRole.CUSTOMER,
      },
    });

    const accessToken = await this.generateToken(user.id, user.username, user.role);

    return {
      user: this.sanitizeUser(user),
      accessToken,
    };
  }

  /**
   * Đăng nhập xác thực người dùng.
   * Sử dụng bcrypt.compare và thông báo lỗi INVALID_CREDENTIALS đồng nhất.
   */
  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'E_INVALID_CREDENTIALS',
        message: 'Thông tin đăng nhập không chính xác.',
      });
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'E_INVALID_CREDENTIALS',
        message: 'Thông tin đăng nhập không chính xác.',
      });
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        statusCode: 403,
        errorCode: 'E_ACCOUNT_DEACTIVATED',
        message: 'Tài khoản đã bị tạm khóa hoặc chưa kích hoạt.',
      });
    }

    const accessToken = await this.generateToken(user.id, user.username, user.role);

    return {
      user: this.sanitizeUser(user),
      accessToken,
    };
  }

  /**
   * Lấy thông tin người dùng an toàn theo ID.
   */
  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        statusCode: 404,
        errorCode: 'E_USER_NOT_FOUND',
        message: 'Không tìm thấy người dùng.',
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

import { ArgumentsHost, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter (Unit Test - TDD)', () => {
  let filter: HttpExceptionFilter;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let hostMock: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    hostMock = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-request-id': 'test-request-id-123',
          },
        }),
        getResponse: () => ({
          status: statusMock,
        }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('formats standard 401 UnauthorizedException with UNAUTHORIZED code and envelope', () => {
    const exception = new UnauthorizedException();
    filter.catch(exception, hostMock);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Phiên đăng nhập đã hết hạn hoặc không còn hợp lệ. Vui lòng đăng nhập lại.',
        details: [],
        requestId: 'test-request-id-123',
      },
    });
  });

  it('preserves custom error envelope in 401 exception (e.g. INVALID_CREDENTIALS)', () => {
    const exception = new UnauthorizedException({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Tài khoản hoặc mật khẩu không chính xác.',
      },
    });
    filter.catch(exception, hostMock);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Tài khoản hoặc mật khẩu không chính xác.',
        details: [],
        requestId: 'test-request-id-123',
      },
    });
  });

  it('formats standard 403 ForbiddenException with FORBIDDEN_RESOURCE code', () => {
    const exception = new ForbiddenException();
    filter.catch(exception, hostMock);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'FORBIDDEN_RESOURCE',
        message: 'Bạn không có quyền truy cập chức năng này.',
        details: [],
        requestId: 'test-request-id-123',
      },
    });
  });

  it('preserves custom message and code in 403 ForbiddenException (e.g. user isolation error)', () => {
    const exception = new ForbiddenException({
      error: {
        code: 'FORBIDDEN_RESOURCE',
        message: 'Bạn không có quyền truy cập dữ liệu của người dùng khác.',
      },
    });
    filter.catch(exception, hostMock);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'FORBIDDEN_RESOURCE',
        message: 'Bạn không có quyền truy cập dữ liệu của người dùng khác.',
        details: [],
        requestId: 'test-request-id-123',
      },
    });
  });
});

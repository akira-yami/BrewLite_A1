import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

interface StandardErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: unknown[];
    requestId: string;
  };
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const rawRequestId =
      request?.headers?.['x-request-id'] ||
      request?.headers?.['X-Request-Id'] ||
      randomUUID();
    const requestId = Array.isArray(rawRequestId) ? rawRequestId[0] : String(rawRequestId);

    const hasCustomError =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'error' in exceptionResponse &&
      typeof (exceptionResponse as any).error === 'object' &&
      (exceptionResponse as any).error !== null;

    // Only standardize 401, 403 or exceptions explicitly providing an error envelope.
    // Preserve standard infrastructure responses (such as 503 readiness probe).
    if (
      status !== HttpStatus.UNAUTHORIZED &&
      status !== HttpStatus.FORBIDDEN &&
      !hasCustomError
    ) {
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        response.status(status).json(exceptionResponse);
        return;
      }
      response.status(status).json({
        statusCode: status,
        message: exception.message,
      });
      return;
    }

    let code = 'HTTP_ERROR';
    let message = exception.message;
    let details: unknown[] = [];

    if (hasCustomError) {
      const err = (exceptionResponse as any).error;
      code = err.code ?? code;
      message = err.message ?? message;
      details = Array.isArray(err.details) ? err.details : [];
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
    ) {
      const resp = exceptionResponse as any;
      if (Array.isArray(resp.message)) {
        details = resp.message;
        message = 'Dữ liệu không hợp lệ.';
        code = 'VALIDATION_ERROR';
      } else if (typeof resp.message === 'string') {
        message = resp.message;
      }
    }

    if (status === HttpStatus.UNAUTHORIZED && code === 'HTTP_ERROR') {
      code = 'UNAUTHORIZED';
      message = 'Phiên đăng nhập đã hết hạn hoặc không còn hợp lệ. Vui lòng đăng nhập lại.';
    } else if (status === HttpStatus.FORBIDDEN && code === 'HTTP_ERROR') {
      code = 'FORBIDDEN_RESOURCE';
      message = 'Bạn không có quyền truy cập chức năng này.';
    }

    const payload: StandardErrorEnvelope = {
      error: {
        code,
        message,
        details,
        requestId,
      },
    };

    response.status(status).json(payload);
  }
}

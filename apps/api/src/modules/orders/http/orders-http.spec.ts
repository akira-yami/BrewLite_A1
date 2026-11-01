import {
  BadRequestException,
  ExecutionContext,
  HttpException,
  Logger,
} from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import {
  OrdersExceptionFilter,
  OrdersResponseInterceptor,
} from './orders-http.js';

function makeHttpContext(request: Partial<Request>, response: any) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function makeResponse() {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe('OrdersResponseInterceptor', () => {
  it('preserves a valid incoming request id and adds it to response metadata', async () => {
    const request = { headers: { 'x-request-id': 'checkout-123' } } as Request;
    const response = makeResponse();
    const body = { data: { id: 'order-1' }, meta: { count: 1 } };
    const interceptor = new OrdersResponseInterceptor();

    const result = await lastValueFrom(
      interceptor.intercept(
        makeHttpContext(request, response),
        { handle: () => of(body) },
      ),
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      'checkout-123',
    );
    expect(result).toEqual({
      data: { id: 'order-1' },
      meta: { count: 1, requestId: 'checkout-123' },
    });
  });

  it('replaces an invalid incoming request id with a generated UUID', async () => {
    const request = { headers: { 'x-request-id': 'invalid request id' } } as Request;
    const response = makeResponse();
    const interceptor = new OrdersResponseInterceptor();

    await lastValueFrom(
      interceptor.intercept(
        makeHttpContext(request, response),
        { handle: () => of({ data: null }) },
      ),
    );

    const generatedId = response.setHeader.mock.calls[0][1] as string;
    expect(generatedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(request.headers['x-request-id']).toBe(generatedId);
  });
});

describe('OrdersExceptionFilter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [400, 'VALIDATION_ERROR'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN_RESOURCE'],
    [404, 'ORDER_NOT_FOUND'],
    [409, 'INVENTORY_CONFLICT'],
    [422, 'COUPON_NOT_APPLICABLE'],
  ])('maps HTTP %s to %s when no custom error code is supplied', (status, code) => {
    const request = { headers: { 'x-request-id': 'request-123' } } as Request;
    const response = makeResponse();
    const filter = new OrdersExceptionFilter();

    filter.catch(
      new HttpException('request rejected', status),
      makeHttpContext(request, response),
    );

    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code,
        message: 'Invalid request.',
        details: [],
        requestId: 'request-123',
      },
    });
  });

  it('preserves a custom top-level business error payload', () => {
    const request = { headers: {} } as Request;
    const response = makeResponse();
    const filter = new OrdersExceptionFilter();

    filter.catch(
      new HttpException(
        {
          code: 'COUPON_NOT_APPLICABLE',
          message: 'Coupon is not applicable.',
          details: [{ reason: 'MIN_ORDER_VALUE' }],
        },
        422,
      ),
      makeHttpContext(request, response),
    );

    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'COUPON_NOT_APPLICABLE',
        message: 'Coupon is not applicable.',
        details: [{ reason: 'MIN_ORDER_VALUE' }],
        requestId: expect.any(String),
      },
    });
  });

  it('normalizes ValidationPipe message arrays into details', () => {
    const request = { headers: {} } as Request;
    const response = makeResponse();
    const filter = new OrdersExceptionFilter();

    filter.catch(
      new BadRequestException({
        message: ['items must not be empty', 'quantity must be positive'],
        error: 'Bad Request',
      }),
      makeHttpContext(request, response),
    );

    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request.',
        details: ['items must not be empty', 'quantity must be positive'],
        requestId: expect.any(String),
      },
    });
  });

  it('hides internal exception details and emits a generic 500 response', () => {
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const request = { headers: {} } as Request;
    const response = makeResponse();
    const filter = new OrdersExceptionFilter();

    filter.catch(
      new Error('database password must not leak'),
      makeHttpContext(request, response),
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to process order.',
        details: [],
        requestId: expect.any(String),
      },
    });
    expect(logger).toHaveBeenCalled();
  });

  it('uses a safe generic response for a non-object HttpException body', () => {
    const request = { headers: {} } as Request;
    const response = makeResponse();
    const filter = new OrdersExceptionFilter();

    filter.catch(
      new HttpException('not an object payload', 418),
      makeHttpContext(request, response),
    );

    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Invalid request.',
        details: [],
        requestId: expect.any(String),
      },
    });
  });
});

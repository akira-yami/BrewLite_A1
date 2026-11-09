import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { loadAppConfig } from './app-config.js';
import { AuthModule } from '../modules/auth/auth.module.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { JwtStrategy } from '../modules/auth/strategies/jwt.strategy.js';
import { PrismaService } from '../database/prisma.service.js';
import { UserRepository } from '../modules/auth/repositories/user.repository.js';

const TEST_SECRET = 'mock-ephemeral-test-secret-do-not-use-in-prod-0000';

describe('app-config and AuthModule dynamic configuration (TDD)', () => {
  it('parses valid JWT_EXPIRES_IN values (15m, 900s, 1h, 1d) and defaults empty/undefined to 900s', () => {
    const cases: Array<[string | undefined, number]> = [
      ['15m', 900],
      ['900s', 900],
      ['1h', 3600],
      ['1d', 86400],
      [' 15M ', 900],
      ['', 900],
      ['   ', 900],
      [undefined, 900],
    ];
    for (const [val, expected] of cases) {
      const cfg = loadAppConfig({ NODE_ENV: 'test', JWT_EXPIRES_IN: val });
      expect(cfg.jwtExpiresInSeconds).toBe(expected);
    }
  });

  it('rejects invalid or excessively large JWT_EXPIRES_IN values without leaking JWT_SECRET', () => {
    const invalidCases = [
      '0m',
      '0s',
      '0h',
      '0d',
      '-15m',
      '-1s',
      '15mS',
      '15ms',
      '15w',
      '15y',
      '1.5h',
      'abc',
      '366d', // exceeds reasonable upper bound (365 days)
      '9999999999999999d',
      '9007199254740992s',
    ];
    for (const val of invalidCases) {
      expect(() =>
        loadAppConfig({ NODE_ENV: 'test', JWT_EXPIRES_IN: val, JWT_SECRET: TEST_SECRET }),
      ).toThrow();
      try {
        loadAppConfig({ NODE_ENV: 'test', JWT_EXPIRES_IN: val, JWT_SECRET: TEST_SECRET });
      } catch (err: any) {
        expect(err.message).not.toContain(TEST_SECRET);
        expect(err.stack).not.toContain(TEST_SECRET);
      }
    }
  });

  it('parses valid ORDER_RESERVATION_TTL_MINUTES and rejects invalid or Date-overflowing values without leaking JWT_SECRET', () => {
    expect(
      loadAppConfig({ NODE_ENV: 'test', ORDER_RESERVATION_TTL_MINUTES: '15' })
        .orderReservationTtlMinutes,
    ).toBe(15);
    expect(
      loadAppConfig({ NODE_ENV: 'test', ORDER_RESERVATION_TTL_MINUTES: ' 30 ' })
        .orderReservationTtlMinutes,
    ).toBe(30);
    expect(
      loadAppConfig({ NODE_ENV: 'test', ORDER_RESERVATION_TTL_MINUTES: '' })
        .orderReservationTtlMinutes,
    ).toBe(15);
    expect(
      loadAppConfig({ NODE_ENV: 'test', ORDER_RESERVATION_TTL_MINUTES: undefined })
        .orderReservationTtlMinutes,
    ).toBe(15);

    const invalidTtls = [
      '0',
      '-1',
      '-15',
      '15.5',
      '15,5',
      'abc',
      '15m',
      '10081', // exceeds max 7 days (10080 minutes)
      String(Number.MAX_SAFE_INTEGER), // causes Invalid Date when multiplied by 60_000
      '9007199254740992',
      '99999999999999999999',
    ];
    for (const val of invalidTtls) {
      expect(() =>
        loadAppConfig({
          NODE_ENV: 'test',
          ORDER_RESERVATION_TTL_MINUTES: val,
          JWT_SECRET: TEST_SECRET,
        }),
      ).toThrow();
      try {
        loadAppConfig({
          NODE_ENV: 'test',
          ORDER_RESERVATION_TTL_MINUTES: val,
          JWT_SECRET: TEST_SECRET,
        });
      } catch (err: any) {
        expect(err.message).not.toContain(TEST_SECRET);
        expect(err.stack).not.toContain(TEST_SECRET);
      }
    }
  });

  it('requires JWT_SECRET outside test environment and uses isolated fallback in test', () => {
    for (const nodeEnv of ['production', 'development', 'staging', '', undefined]) {
      expect(() => loadAppConfig({ NODE_ENV: nodeEnv, JWT_SECRET: '' })).toThrow(
        /JWT_SECRET environment variable is required/,
      );
      expect(() => loadAppConfig({ NODE_ENV: nodeEnv, JWT_SECRET: '   ' })).toThrow(
        /JWT_SECRET environment variable is required/,
      );
    }

    const testCfg = loadAppConfig({ NODE_ENV: 'test', JWT_SECRET: '' });
    expect(testCfg.jwtSecret).toBe('test-jwt-secret-for-isolated-tests-only-32bytes-long');
  });

  it('does not trust forwarded IP headers unless trusted proxy CIDRs are explicitly configured', () => {
    expect(loadAppConfig({ NODE_ENV: 'test' }).trustedProxyCidrs).toEqual([]);

    expect(loadAppConfig({
      NODE_ENV: 'test',
      TRUSTED_PROXY_CIDRS: '10.20.30.40, 2001:db8:abcd::/64, 10.20.30.40/32',
    }).trustedProxyCidrs).toEqual([
      '10.20.30.40/32',
      '2001:db8:abcd::/64',
    ]);
  });

  it('rejects wildcard, invalid IPs, malformed CIDRs and world-wide /0 trusted proxy ranges', () => {
    const invalidValues = [
      '*',
      'unknown-proxy',
      '192.0.2.10/33',
      '2001:db8::1/129',
      '192.0.2.10/0',
      '::/0',
      '192.0.2.10/not-a-prefix',
      '192.0.2.10//32',
      '192.0.2.10,,192.0.2.11',
    ];

    for (const value of invalidValues) {
      expect(() => loadAppConfig({
        NODE_ENV: 'test',
        TRUSTED_PROXY_CIDRS: value,
      })).toThrow(/TRUSTED_PROXY_CIDRS/);
    }
  });

  it('keeps VNPay disabled by default and fails closed for incomplete or insecure settings', () => {
    expect(loadAppConfig({ NODE_ENV: 'test' }).vnpay.enabled).toBe(false);

    expect(() => loadAppConfig({
      NODE_ENV: 'test',
      VNPAY_ENABLED: 'true',
      VNPAY_TMN_CODE: 'DEMO1234',
    })).toThrow(/VNPAY_HASH_SECRET is required/);

    expect(() => loadAppConfig({
      NODE_ENV: 'test',
      WEB_ORIGIN: 'https://brew.example',
      VNPAY_ENABLED: 'true',
      VNPAY_TMN_CODE: 'DEMO1234',
      VNPAY_HASH_SECRET: '12345678901234567890123456789012',
      VNPAY_RETURN_URL: 'https://api.example/vnpay/return',
      VNPAY_IPN_URL: 'http://api.example/vnpay/ipn',
    })).toThrow(/VNPAY_IPN_URL must be a valid HTTPS URL/);
  });

  it('loads complete VNPay settings with HTTPS endpoints and the official sandbox URL by default', () => {
    const config = loadAppConfig({
      NODE_ENV: 'test',
      WEB_ORIGIN: 'https://brew.example',
      VNPAY_ENABLED: 'true',
      VNPAY_TMN_CODE: 'DEMO1234',
      VNPAY_HASH_SECRET: '12345678901234567890123456789012',
      VNPAY_RETURN_URL: 'https://api.brew.example/api/v1/payments/vnpay/return',
      VNPAY_IPN_URL: 'https://api.brew.example/api/v1/payments/vnpay/ipn',
    });
    expect(config.vnpay).toMatchObject({
      enabled: true,
      tmnCode: 'DEMO1234',
      paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      returnUrl: 'https://api.brew.example/api/v1/payments/vnpay/return',
      ipnUrl: 'https://api.brew.example/api/v1/payments/vnpay/ipn',
      frontendOrigin: 'https://brew.example',
    });
  });

  it('allows loopback HTTP URLs only for non-production Sandbox configuration', () => {
    const values = {
      WEB_ORIGIN: 'http://localhost:3100',
      VNPAY_ENABLED: 'true',
      VNPAY_TMN_CODE: 'TEST0001',
      VNPAY_HASH_SECRET: '0123456789abcdef0123456789abcdef',
      VNPAY_RETURN_URL: 'http://localhost:3101/api/v1/payments/vnpay/return',
      VNPAY_IPN_URL: 'https://e2e.invalid/api/v1/payments/vnpay/ipn',
      JWT_SECRET: TEST_SECRET,
    };

    expect(loadAppConfig({ ...values, NODE_ENV: 'development' }).vnpay).toMatchObject({
      frontendOrigin: values.WEB_ORIGIN,
      returnUrl: values.VNPAY_RETURN_URL,
    });
    expect(() => loadAppConfig({ ...values, NODE_ENV: 'production' }))
      .toThrow(/VNPAY_RETURN_URL must be a valid HTTPS URL/);
    expect(() => loadAppConfig({ ...values, VNPAY_PAYMENT_URL: 'https://pay.vnpay.vn/vpcpay.html' }))
      .toThrow(/VNPAY_RETURN_URL must be a valid HTTPS URL/);
    expect(() => loadAppConfig({ ...values, NODE_ENV: 'test', WEB_ORIGIN: 'http://example.com' }))
      .toThrow(/WEB_ORIGIN must be a valid HTTPS URL/);
  });

  it('keeps AuthModule JwtService signOptions synchronized with AuthService expiresIn when env changes after module import', async () => {
    const prevExpires = process.env.JWT_EXPIRES_IN;
    const prevNodeEnv = process.env.NODE_ENV;
    const prevSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'test';
      delete process.env.JWT_SECRET;
      process.env.JWT_EXPIRES_IN = '1h';

      let savedUser: any = null;
      const moduleRef = await Test.createTestingModule({
        imports: [AuthModule],
      })
        .overrideProvider(PrismaService)
        .useValue({})
        .overrideProvider(UserRepository)
        .useValue({
          findByUsername: async () => savedUser,
          findById: async () => savedUser,
          create: async (data: any) => {
            savedUser = {
              id: '123e4567-e89b-42d3-a456-426614174000',
              username: data.username,
              passwordHash: data.passwordHash,
              role: data.role,
              loyaltyBalance: 0,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            return savedUser;
          },
        })
        .compile();

      const authService = moduleRef.get(AuthService);
      const jwtService = moduleRef.get(JwtService);
      const jwtStrategy = moduleRef.get(JwtStrategy);
      const res = await authService.register({
        username: 'sync_test',
        password: 'Password123!',
      });
      const decoded: any = jwtService.decode(res.accessToken);
      const actualTokenTtl = decoded.exp - decoded.iat;

      expect(res.expiresIn).toBe(3600);
      expect(actualTokenTtl).toBe(3600);

      await expect(
        jwtStrategy.validate({
          sub: res.user.id,
          username: res.user.username,
          role: res.user.role,
        }),
      ).resolves.toEqual({
        id: res.user.id,
        sub: res.user.id,
        username: res.user.username,
        role: res.user.role,
      });
      await expect(
        jwtStrategy.validate({ sub: '', username: 'no-sub', role: 'CUSTOMER' }),
      ).rejects.toThrow(UnauthorizedException);
    } finally {
      if (prevExpires === undefined) delete process.env.JWT_EXPIRES_IN;
      else process.env.JWT_EXPIRES_IN = prevExpires;
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
      if (prevSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prevSecret;
    }
  });
});

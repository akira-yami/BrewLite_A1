import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { VnpayGatewayService } from './vnpay-gateway.service.js';

describe('VnpayGatewayService', () => {
  let service: VnpayGatewayService;
  beforeEach(() => {
    vi.stubEnv('VNP_TMN_CODE', 'DEMO1234');
    vi.stubEnv('VNP_HASH_SECRET', 'test-vnpay-secret');
    vi.stubEnv('VNP_PAYMENT_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
    vi.stubEnv('VNP_RETURN_URL', 'https://api.example.test/api/v1/payments/vnpay/return');
    vi.stubEnv('VNP_IPN_URL', 'https://api.example.test/api/v1/payments/vnpay/ipn');
    vi.stubEnv('WEB_PUBLIC_URL', 'https://web.example.test');
    service = new VnpayGatewayService();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('creates a signed sandbox URL with VND minor units and GMT+7 expiry', () => {
    const url = new URL(service.createPaymentUrl({
      txnRef: 'A1B2C3D4',
      amount: 125000n,
      orderInfo: 'BrewLite payment A1B2C3D4',
      ipAddress: '203.0.113.10',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    }));
    expect(url.origin).toBe('https://sandbox.vnpayment.vn');
    expect(url.searchParams.get('vnp_TxnRef')).toBe('A1B2C3D4');
    expect(url.searchParams.get('vnp_Amount')).toBe('12500000');
    expect(url.searchParams.get('vnp_CurrCode')).toBe('VND');
    expect(url.searchParams.get('vnp_IpAddr')).toBe('203.0.113.10');
    expect(url.searchParams.get('vnp_ExpireDate')).toMatch(/^\d{14}$/);
    expect(url.searchParams.get('vnp_SecureHash')).toMatch(/^[a-f0-9]{128}$/);
  });

  it('verifies a valid HMAC-SHA512 response and rejects tampered data', () => {
    const parameters = {
      vnp_TmnCode: 'DEMO1234',
      vnp_TxnRef: 'A1B2C3D4',
      vnp_Amount: '12500000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    };
    const canonical = Object.entries(parameters)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    const signature = createHmac('sha512', 'test-vnpay-secret').update(canonical).digest('hex');
    expect(service.verifyResponse({ ...parameters, vnp_SecureHash: signature })).toBe(true);
    expect(service.verifyResponse({ ...parameters, vnp_Amount: '1', vnp_SecureHash: signature })).toBe(false);
  });

  it('rejects a response for a different merchant', () => {
    expect(service.verifyResponse({
      vnp_TmnCode: 'OTHER123',
      vnp_TxnRef: 'A1B2C3D4',
      vnp_SecureHash: 'a'.repeat(128),
    })).toBe(false);
  });

  it('rejects non-HTTPS callback URLs before generating a payment link', () => {
    vi.stubEnv('VNP_IPN_URL', 'http://localhost:3001/api/v1/payments/vnpay/ipn');
    expect(() => service.createPaymentUrl({
      txnRef: 'A1B2C3D4',
      amount: 10000n,
      orderInfo: 'BrewLite payment',
      ipAddress: '127.0.0.1',
      expiresAt: new Date(Date.now() + 60_000),
    })).toThrow(ServiceUnavailableException);
  });

  it('creates a frontend return URL without settling payment', () => {
    const result = new URL(service.createFrontendReturnUrl('order-id', true));
    expect(result.origin).toBe('https://web.example.test');
    expect(result.pathname).toBe('/orders/confirmation');
    expect(result.searchParams.get('orderId')).toBe('order-id');
    expect(result.searchParams.get('paymentReturn')).toBe('1');
  });
});

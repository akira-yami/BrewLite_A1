import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadAppConfig } from '../../../config/app-config.js';
import { VnpayGatewayService } from './vnpay.gateway.js';

function configuredGateway() {
  const config = loadAppConfig({
    NODE_ENV: 'test',
    WEB_ORIGIN: 'https://brew.example',
    VNPAY_ENABLED: 'true',
    VNPAY_TMN_CODE: 'DEMO1234',
    VNPAY_HASH_SECRET: '12345678901234567890123456789012',
    VNPAY_RETURN_URL: 'https://api.brew.example/api/v1/payments/vnpay/return',
    VNPAY_IPN_URL: 'https://api.brew.example/api/v1/payments/vnpay/ipn',
  });
  return new VnpayGatewayService(config);
}

function signCallback(values: Record<string, string>) {
  const keys = Object.keys(values).filter(
    key => key.startsWith('vnp_') && key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType',
  ).sort();
  const query = new URLSearchParams();
  for (const key of keys) query.append(key, values[key]);
  return createHmac('sha512', '12345678901234567890123456789012')
    .update(query.toString(), 'utf8')
    .digest('hex');
}

describe('VnpayGatewayService', () => {
  it('creates a signed VNPay 2.1.0 URL with VND amount multiplied by 100', () => {
    const gateway = configuredGateway();
    const intent = gateway.createPaymentUrl({
      amount: 125000n,
      orderNumber: 'BL-2026-0001',
      expiresAt: new Date(Date.now() + 10 * 60_000),
      ipAddress: '::ffff:127.0.0.1',
    });
    const url = new URL(intent.paymentUrl);
    expect(url.origin + url.pathname).toBe('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
    expect(url.searchParams.get('vnp_Version')).toBe('2.1.0');
    expect(url.searchParams.get('vnp_Command')).toBe('pay');
    expect(url.searchParams.get('vnp_TmnCode')).toBe('DEMO1234');
    expect(url.searchParams.get('vnp_Amount')).toBe('12500000');
    expect(url.searchParams.get('vnp_CurrCode')).toBe('VND');
    expect(url.searchParams.get('vnp_TxnRef')).toBe(intent.gatewayReference);
    expect(url.searchParams.get('vnp_IpAddr')).toBe('127.0.0.1');
    expect(url.searchParams.get('vnp_SecureHash')).toMatch(/^[a-f0-9]{128}$/);
  });

  it('verifies callbacks that omit vnp_Version and rejects tampering', () => {
    const gateway = configuredGateway();
    const callback: Record<string, string> = {
      vnp_TxnRef: 'ref-123',
      vnp_Amount: '10000000',
      vnp_TmnCode: 'DEMO1234',
      vnp_CurrCode: 'VND',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: '123456',
      vnp_BankCode: 'NCB',
    };
    callback.vnp_SecureHash = signCallback(callback);
    expect(gateway.verifyCallback(callback)).not.toBeNull();
    expect(gateway.verifyCallback({ ...callback, vnp_Amount: '100' })).toBeNull();
    expect(gateway.verifyCallback({ ...callback, vnp_TmnCode: 'OTHER123' })).toBeNull();
    expect(gateway.verifyCallback({ ...callback, vnp_TxnRef: ['duplicate'] })).toBeNull();
  });

  it('rejects expired deadlines, invalid IP addresses and out-of-range amounts', () => {
    const gateway = configuredGateway();
    expect(() => gateway.createPaymentUrl({
      amount: 10n,
      orderNumber: 'BL-1',
      expiresAt: new Date(0),
      ipAddress: '127.0.0.1',
    })).toThrow(/deadline has expired/);
    expect(() => gateway.createPaymentUrl({
      amount: 10n,
      orderNumber: 'BL-1',
      expiresAt: new Date(Date.now() + 60_000),
      ipAddress: 'not-an-ip',
    })).toThrow(/IP address is invalid/);
    expect(() => gateway.createPaymentUrl({
      amount: 9999999999n,
      orderNumber: 'BL-1',
      expiresAt: new Date(Date.now() + 60_000),
      ipAddress: '127.0.0.1',
    })).toThrow(/numeric range/);
  });

  it('keeps VNPay disabled by default', () => {
    const config = loadAppConfig({ NODE_ENV: 'test' });
    expect(new VnpayGatewayService(config).isEnabled()).toBe(false);
  });
});

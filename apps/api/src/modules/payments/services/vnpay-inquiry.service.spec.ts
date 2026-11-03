import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAppConfig } from '../../../config/app-config.js';
import { VnpayInquiryError, VnpayInquiryService } from './vnpay-inquiry.service.js';

const SECRET = '12345678901234567890123456789012';
const BASE: Record<string, string> = {
  vnp_ResponseId: 'response-1', vnp_Command: 'querydr', vnp_ResponseCode: '00',
  vnp_Message: 'Success', vnp_TmnCode: 'DEMO1234', vnp_TxnRef: 'reference123',
  vnp_Amount: '12500000', vnp_BankCode: 'NCB', vnp_PayDate: '20261103183000',
  vnp_TransactionNo: '123456789', vnp_TransactionType: '01',
  vnp_TransactionStatus: '00', vnp_OrderInfo: 'BrewLite order BL-1',
};
const signatureFields = [
  'vnp_ResponseId', 'vnp_Command', 'vnp_ResponseCode', 'vnp_Message',
  'vnp_TmnCode', 'vnp_TxnRef', 'vnp_Amount', 'vnp_BankCode',
  'vnp_PayDate', 'vnp_TransactionNo', 'vnp_TransactionType',
  'vnp_TransactionStatus', 'vnp_OrderInfo', 'vnp_PromotionCode',
  'vnp_PromotionAmount',
];
function signResponse(fields: Record<string, string>) {
  const data = signatureFields.map(key => fields[key] ?? '').join('|');
  return createHmac('sha512', SECRET).update(data).digest('hex');
}
function createService() {
  return new VnpayInquiryService(loadAppConfig({
    NODE_ENV: 'test', WEB_ORIGIN: 'https://brew.example', VNPAY_ENABLED: 'true',
    VNPAY_TMN_CODE: 'DEMO1234', VNPAY_HASH_SECRET: SECRET,
    VNPAY_RETURN_URL: 'https://api.example/vnpay/return',
    VNPAY_IPN_URL: 'https://api.example/vnpay/ipn',
  }));
}
const input = {
  gatewayReference: 'reference123', amount: 125000n,
  transactionDate: '20261103180000', orderInfo: 'BrewLite order BL-1',
  serverIp: '203.0.113.10', requestId: 'request123',
};
afterEach(() => vi.unstubAllGlobals());

describe('VnpayInquiryService', () => {
  it('signs QueryDr request with the documented pipe-delimited HMAC payload', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request.vnp_Command).toBe('querydr');
      expect(request.vnp_TmnCode).toBe('DEMO1234');
      expect(request.vnp_TxnRef).toBe(input.gatewayReference);
      expect(request.vnp_Amount).toBeUndefined();
      const data = [
        request.vnp_RequestId, request.vnp_Version, request.vnp_Command,
        request.vnp_TmnCode, request.vnp_TxnRef, request.vnp_TransactionDate,
        request.vnp_CreateDate, request.vnp_IpAddr, request.vnp_OrderInfo,
      ].join('|');
      expect(request.vnp_SecureHash).toBe(createHmac('sha512', SECRET).update(data).digest('hex'));
      return new Response(JSON.stringify({ ...BASE, vnp_SecureHash: signResponse(BASE) }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await createService().query(input);
    expect(result).toMatchObject({ status: 'SUCCESS', transactionStatus: '00', gatewayReference: input.gatewayReference });
  });

  it('accepts omitted optional promotion fields and signs them as empty values', async () => {
    const fields = { ...BASE };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ...fields, vnp_SecureHash: signResponse(fields),
    }), { status: 200 })));
    await expect(createService().query(input)).resolves.toMatchObject({ status: 'SUCCESS' });
  });

  it.each([
    ['00', 'SUCCESS'], ['01', 'PENDING'], ['02', 'DEFINITIVE_FAILURE'],
    ['04', 'MANUAL_REVIEW'], ['07', 'MANUAL_REVIEW'], ['09', 'UNKNOWN'],
  ])('maps signed transaction status %s to %s', async (transactionStatus, expected) => {
    const fields = { ...BASE, vnp_TransactionStatus: transactionStatus };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ...fields, vnp_SecureHash: signResponse(fields),
    }), { status: 200 })));
    await expect(createService().query(input)).resolves.toMatchObject({ status: expected });
  });

  it('keeps QueryDr API-level errors UNKNOWN even when HTTP succeeds', async () => {
    const fields = { ...BASE, vnp_ResponseCode: '94' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ...fields, vnp_SecureHash: signResponse(fields),
    }), { status: 200 })));
    await expect(createService().query(input)).rejects.toThrow(VnpayInquiryError);
  });

  it('rejects unsigned, tampered, wrong-merchant, wrong-reference and wrong-amount responses', async () => {
    const variants = [
      { ...BASE, vnp_SecureHash: '0'.repeat(128) },
      { ...BASE, vnp_TmnCode: 'OTHER123', vnp_SecureHash: signResponse({ ...BASE, vnp_TmnCode: 'OTHER123' }) },
      { ...BASE, vnp_TxnRef: 'other-ref', vnp_SecureHash: signResponse({ ...BASE, vnp_TxnRef: 'other-ref' }) },
      { ...BASE, vnp_Amount: '1', vnp_SecureHash: signResponse({ ...BASE, vnp_Amount: '1' }) },
    ];
    for (const payload of variants) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
      await expect(createService().query(input)).rejects.toThrow(VnpayInquiryError);
    }
  });

  it('never maps transport, HTTP or JSON failures to definitive payment failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network timeout')));
    await expect(createService().query(input)).rejects.toMatchObject({ outcome: 'UNKNOWN' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 502 })));
    await expect(createService().query(input)).rejects.toMatchObject({ outcome: 'UNKNOWN' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{', { status: 200 })));
    await expect(createService().query(input)).rejects.toMatchObject({ outcome: 'UNKNOWN' });
  });

  it('rejects invalid identifiers, dates, IPs and pipe injection before network access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createService().query({ ...input, requestId: 'not valid' })).rejects.toThrow(VnpayInquiryError);
    await expect(createService().query({ ...input, transactionDate: 'yesterday' })).rejects.toThrow(VnpayInquiryError);
    await expect(createService().query({ ...input, serverIp: 'not an ip' })).rejects.toThrow(VnpayInquiryError);
    await expect(createService().query({ ...input, orderInfo: 'bad|injection' })).rejects.toThrow(VnpayInquiryError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

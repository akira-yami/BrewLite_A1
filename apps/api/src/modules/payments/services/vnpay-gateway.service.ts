import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type VnpayParameters = Record<string, string>;
export interface CreateVnpayPaymentInput {
  txnRef: string;
  amount: bigint;
  orderInfo: string;
  ipAddress: string;
  expiresAt: Date;
}
interface VnpayConfiguration {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  returnUrl: string;
  ipnUrl: string;
  webPublicUrl: string;
}

function encodeVnpayValue(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}
function canonicalQuery(parameters: VnpayParameters): string {
  return Object.entries(parameters)
    .filter(([key]) => key.startsWith('vnp_') && key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType')
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${encodeVnpayValue(key)}=${encodeVnpayValue(value)}`)
    .join('&');
}
function formatVnpayDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}${value.hour}${value.minute}${value.second}`;
}

@Injectable()
export class VnpayGatewayService {
  private readConfiguration(): VnpayConfiguration {
    const tmnCode = process.env.VNP_TMN_CODE?.trim();
    const hashSecret = process.env.VNP_HASH_SECRET?.trim();
    const paymentUrl = process.env.VNP_PAYMENT_URL?.trim()
      || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    const returnUrl = process.env.VNP_RETURN_URL?.trim();
    const ipnUrl = process.env.VNP_IPN_URL?.trim();
    const webPublicUrl = process.env.WEB_PUBLIC_URL?.trim();

    if (!tmnCode || !hashSecret || !returnUrl || !ipnUrl || !webPublicUrl) {
      throw new ServiceUnavailableException(
        'VNPay is enabled but VNP_TMN_CODE, VNP_HASH_SECRET, VNP_RETURN_URL, VNP_IPN_URL and WEB_PUBLIC_URL are not fully configured.',
      );
    }
    for (const [name, value] of [
      ['VNP_PAYMENT_URL', paymentUrl],
      ['VNP_RETURN_URL', returnUrl],
      ['VNP_IPN_URL', ipnUrl],
      ['WEB_PUBLIC_URL', webPublicUrl],
    ]) {
      let parsed: URL;
      try { parsed = new URL(value); }
      catch { throw new ServiceUnavailableException(`${name} must be a valid absolute URL.`); }
      if (parsed.protocol !== 'https:') {
        throw new ServiceUnavailableException(`${name} must use HTTPS for VNPay integration.`);
      }
    }
    return { tmnCode, hashSecret, paymentUrl, returnUrl, ipnUrl, webPublicUrl };
  }

  isConfigured(): boolean {
    try { this.readConfiguration(); return true; }
    catch { return false; }
  }

  createPaymentUrl(input: CreateVnpayPaymentInput): string {
    const config = this.readConfiguration();
    if (input.amount <= 0n) throw new ServiceUnavailableException('VNPay payment amount must be positive.');
    const vnpAmount = input.amount * 100n;
    if (vnpAmount.toString().length > 12) {
      throw new ServiceUnavailableException('VNPay amount exceeds the supported 12-digit limit.');
    }
    if (input.expiresAt <= new Date()) {
      throw new ServiceUnavailableException('The order reservation has expired; cannot create a VNPay payment URL.');
    }
    const parameters: VnpayParameters = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: config.tmnCode,
      vnp_Amount: vnpAmount.toString(),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: input.orderInfo,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: config.returnUrl,
      vnp_IpAddr: input.ipAddress,
      vnp_CreateDate: formatVnpayDate(new Date()),
      vnp_ExpireDate: formatVnpayDate(input.expiresAt),
    };
    const signData = canonicalQuery(parameters);
    const secureHash = createHmac('sha512', config.hashSecret).update(signData, 'utf8').digest('hex');
    return `${config.paymentUrl}?${signData}&vnp_SecureHash=${secureHash}`;
  }

  normalizeQuery(query: Record<string, unknown>): VnpayParameters {
    const normalized: VnpayParameters = {};
    for (const [key, rawValue] of Object.entries(query)) {
      if (!key.startsWith('vnp_') || rawValue === undefined || rawValue === null) continue;
      normalized[key] = Array.isArray(rawValue) ? String(rawValue[0] ?? '') : String(rawValue);
    }
    return normalized;
  }

  verifyResponse(parameters: VnpayParameters): boolean {
    try {
      const config = this.readConfiguration();
      const providedHash = parameters.vnp_SecureHash;
      if (!providedHash || !/^[a-fA-F0-9]{128}$/.test(providedHash)) return false;
      if (parameters.vnp_TmnCode !== config.tmnCode) return false;
      const signData = canonicalQuery(parameters);
      const expectedHash = createHmac('sha512', config.hashSecret).update(signData, 'utf8').digest();
      const actualHash = Buffer.from(providedHash, 'hex');
      return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
    } catch { return false; }
  }

  createFrontendReturnUrl(orderId: string | null, signatureValid: boolean): string {
    const config = this.readConfiguration();
    const target = new URL('/orders/confirmation', config.webPublicUrl);
    if (orderId && signatureValid) target.searchParams.set('orderId', orderId);
    target.searchParams.set('paymentReturn', signatureValid ? '1' : 'invalid');
    return target.toString();
  }
}

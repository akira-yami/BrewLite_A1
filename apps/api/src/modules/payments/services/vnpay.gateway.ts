import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { APP_CONFIG } from '../../../config/app-config.module.js';
import type { AppConfig } from '../../../config/app-config.js';

export interface CreateVnpayPaymentInput {
  amount: bigint;
  orderNumber: string;
  expiresAt: Date;
  ipAddress: string;
}

export interface VnpayPaymentIntent {
  gatewayReference: string;
  paymentUrl: string;
}

export type VerifiedVnpayCallback = Record<string, string> & {
  vnp_TxnRef: string;
  vnp_Amount: string;
  vnp_TmnCode: string;
  vnp_ResponseCode: string;
  vnp_TransactionStatus: string;
};

@Injectable()
export class VnpayGatewayService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  isEnabled(): boolean {
    return this.config.vnpay.enabled;
  }

  canSettleLocalSandboxReturn(): boolean {
    return this.config.vnpay.settleLocalSandboxReturn;
  }

  createPaymentUrl(input: CreateVnpayPaymentInput): VnpayPaymentIntent {
    const settings = this.config.vnpay;
    if (!settings.enabled || !settings.tmnCode || !settings.hashSecret || !settings.returnUrl) {
      throw new Error('VNPay gateway is not configured');
    }
    if (input.amount <= 0n) throw new Error('VNPay amount must be positive');

    const vnpAmount = input.amount * 100n;
    if (vnpAmount > 999999999999n) {
      throw new Error('VNPay amount exceeds the supported numeric range');
    }
    const now = new Date();
    if (
      !(input.expiresAt instanceof Date) ||
      Number.isNaN(input.expiresAt.getTime()) ||
      input.expiresAt <= now
    ) {
      throw new Error('Order payment deadline has expired');
    }

    const gatewayReference = randomUUID().replaceAll('-', '');
    const parameters: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: settings.tmnCode,
      vnp_Amount: vnpAmount.toString(),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: gatewayReference,
      vnp_OrderInfo: normalizeOrderInfo('BrewLite order ' + input.orderNumber),
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: settings.returnUrl,
      vnp_IpAddr: normalizeIpAddress(input.ipAddress),
      vnp_CreateDate: formatVnpayDate(now),
      vnp_ExpireDate: formatVnpayDate(input.expiresAt),
    };

    const hashData = canonicalQuery(parameters);
    const signature = createHmac('sha512', settings.hashSecret)
      .update(hashData, 'utf8')
      .digest('hex');
    return {
      gatewayReference,
      paymentUrl: settings.paymentUrl + '?' + hashData + '&vnp_SecureHash=' + signature,
    };
  }

  verifyCallback(query: unknown): VerifiedVnpayCallback | null {
    const settings = this.config.vnpay;
    if (!settings.enabled || !settings.tmnCode || !settings.hashSecret) return null;
    if (!query || typeof query !== 'object' || Array.isArray(query)) return null;

    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
      if (!key.startsWith('vnp_')) continue;
      if (typeof value !== 'string') return null;
      values[key] = value;
    }

    const secureHash = values.vnp_SecureHash;
    if (!secureHash || !/^[a-fA-F0-9]{128}$/.test(secureHash)) return null;
    if (values.vnp_TmnCode !== settings.tmnCode) return null;
    if (values.vnp_CurrCode && values.vnp_CurrCode !== 'VND') return null;
    if (values.vnp_SecureHashType && values.vnp_SecureHashType.toUpperCase() !== 'HMACSHA512') return null;
    // VNPay's published IPN example does not include vnp_Version; do not require it.
    if (!/^[A-Za-z0-9]{1,100}$/.test(values.vnp_TxnRef ?? '')) return null;
    if (!/^\d{1,12}$/.test(values.vnp_Amount ?? '')) return null;
    if (!/^\d{2}$/.test(values.vnp_ResponseCode ?? '')) return null;
    if (!/^\d{2}$/.test(values.vnp_TransactionStatus ?? '')) return null;

    const signedValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType') {
        signedValues[key] = value;
      }
    }
    const expected = createHmac('sha512', settings.hashSecret)
      .update(canonicalQuery(signedValues), 'utf8')
      .digest();
    const received = Buffer.from(secureHash, 'hex');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    return values as VerifiedVnpayCallback;
  }

  frontendReturnUrl(): string {
    const url = new URL('/checkout', this.config.vnpay.frontendOrigin);
    url.searchParams.set('paymentReturn', '1');
    return url.toString();
  }
}

function canonicalQuery(parameters: Record<string, string>): string {
  const keys = Object.keys(parameters).sort();
  const query = new URLSearchParams();
  for (const key of keys) query.append(key, parameters[key]);
  return query.toString();
}

function normalizeIpAddress(value: string): string {
  const trimmed = (value ?? '').trim();
  const normalized = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  if (isIP(normalized) === 0) throw new Error('VNPay client IP address is invalid');
  return normalized;
}

function normalizeOrderInfo(value: string): string {
  return value
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function formatVnpayDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + values.month + values.day + values.hour + values.minute + values.second;
}

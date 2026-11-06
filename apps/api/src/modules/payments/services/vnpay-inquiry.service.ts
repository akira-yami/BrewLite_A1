import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { APP_CONFIG } from '../../../config/app-config.module.js';
import type { AppConfig } from '../../../config/app-config.js';

export type VnpayInquiryStatus = 'SUCCESS' | 'DEFINITIVE_FAILURE' | 'PENDING' | 'MANUAL_REVIEW' | 'UNKNOWN';
export interface VnpayInquiryInput {
  gatewayReference: string;
  amount: bigint;
  transactionDate: string;
  orderInfo: string;
  serverIp: string;
  requestId?: string;
}
export interface VnpayInquiryResult {
  requestId: string;
  gatewayReference: string;
  status: VnpayInquiryStatus;
  responseCode: string;
  transactionStatus: string;
  transactionNo: string | null;
  payDate: string | null;
}
export class VnpayInquiryError extends Error {
  readonly outcome = 'UNKNOWN' as const;
  constructor(message: string) { super(message); this.name = 'VnpayInquiryError'; }
}
const RESPONSE_SIGNATURE_FIELDS = [
  'vnp_ResponseId', 'vnp_Command', 'vnp_ResponseCode', 'vnp_Message',
  'vnp_TmnCode', 'vnp_TxnRef', 'vnp_Amount', 'vnp_BankCode',
  'vnp_PayDate', 'vnp_TransactionNo', 'vnp_TransactionType',
  'vnp_TransactionStatus', 'vnp_OrderInfo', 'vnp_PromotionCode',
  'vnp_PromotionAmount',
] as const;
const REQUIRED_RESPONSE_FIELDS = RESPONSE_SIGNATURE_FIELDS.filter(
  field => field !== 'vnp_PromotionCode' && field !== 'vnp_PromotionAmount',
);

@Injectable()
export class VnpayInquiryService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async query(input: VnpayInquiryInput): Promise<VnpayInquiryResult> {
    const settings = this.config.vnpay;
    if (!settings.enabled || !settings.tmnCode || !settings.hashSecret) throw new VnpayInquiryError('VNPay inquiry is not configured');
    if (!/^[A-Za-z0-9]{1,100}$/.test(input.gatewayReference)) throw new VnpayInquiryError('Invalid VNPay gateway reference');
    if (input.amount <= 0n || input.amount * 100n > 999999999999n) throw new VnpayInquiryError('VNPay inquiry amount is outside the supported range');
    if (!/^\d{14}$/.test(input.transactionDate)) throw new VnpayInquiryError('VNPay transaction date must use yyyyMMddHHmmss');
    if (isIP(input.serverIp) === 0) throw new VnpayInquiryError('VNPay server IP is invalid');
    if (!input.orderInfo || input.orderInfo.length > 255 || /[|\r\n]/.test(input.orderInfo)) {
      throw new VnpayInquiryError('VNPay order info must be 1-255 characters without pipe or line breaks');
    }
    const requestId = input.requestId ?? randomUUID().replaceAll('-', '').slice(0, 32);
    if (!/^[A-Za-z0-9]{1,32}$/.test(requestId)) throw new VnpayInquiryError('VNPay inquiry request ID is invalid');

    const fields: Record<string, string> = {
      vnp_RequestId: requestId, vnp_Version: '2.1.0', vnp_Command: 'querydr',
      vnp_TmnCode: settings.tmnCode, vnp_TxnRef: input.gatewayReference,
      vnp_TransactionDate: input.transactionDate, vnp_CreateDate: formatVnpayDate(new Date()),
      vnp_IpAddr: input.serverIp, vnp_OrderInfo: input.orderInfo,
    };
    const requestData = [
      fields.vnp_RequestId, fields.vnp_Version, fields.vnp_Command, fields.vnp_TmnCode,
      fields.vnp_TxnRef, fields.vnp_TransactionDate, fields.vnp_CreateDate,
      fields.vnp_IpAddr, fields.vnp_OrderInfo,
    ].join('|');
    fields.vnp_SecureHash = sign(settings.hashSecret, requestData);

    let response: Response;
    try {
      response = await fetch(settings.queryUrl, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(fields), signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new VnpayInquiryError('VNPay inquiry transport failed or timed out; outcome remains unknown');
    }
    if (!response.ok) throw new VnpayInquiryError('VNPay inquiry returned a non-success HTTP status; outcome remains unknown');
    let payload: unknown;
    try { payload = await response.json(); } catch {
      throw new VnpayInquiryError('VNPay inquiry returned invalid JSON; outcome remains unknown');
    }
    const values = parseStringRecord(payload);
    if (!values || !this.verifyResponse(values)) throw new VnpayInquiryError('VNPay inquiry response signature or schema is invalid; outcome remains unknown');
    if (values.vnp_Command !== 'querydr' || values.vnp_TmnCode !== settings.tmnCode ||
        values.vnp_TxnRef !== input.gatewayReference || values.vnp_Amount !== (input.amount * 100n).toString()) {
      throw new VnpayInquiryError('VNPay inquiry response does not match merchant, reference or amount');
    }
    if (values.vnp_ResponseCode !== '00') throw new VnpayInquiryError('VNPay QueryDr API did not complete successfully; transaction outcome remains unknown');
    const transactionStatus = values.vnp_TransactionStatus;
    const status: VnpayInquiryStatus =
      transactionStatus === '00' ? 'SUCCESS' :
      transactionStatus === '02' ? 'DEFINITIVE_FAILURE' :
      transactionStatus === '01' ? 'PENDING' :
      transactionStatus === '04' || transactionStatus === '07' ? 'MANUAL_REVIEW' : 'UNKNOWN';
    return {
      requestId, gatewayReference: input.gatewayReference, status,
      responseCode: values.vnp_ResponseCode, transactionStatus,
      transactionNo: values.vnp_TransactionNo || null, payDate: values.vnp_PayDate || null,
    };
  }

  private verifyResponse(values: Record<string, string>): boolean {
    const secureHash = values.vnp_SecureHash;
    if (!secureHash || !/^[a-fA-F0-9]{128}$/.test(secureHash) ||
        REQUIRED_RESPONSE_FIELDS.some(field => !(field in values))) return false;
    const data = RESPONSE_SIGNATURE_FIELDS.map(field => values[field] ?? '').join('|');
    const expected = Buffer.from(sign(this.config.vnpay.hashSecret!, data), 'hex');
    const received = Buffer.from(secureHash, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  }
}
function parseStringRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([, item]) => typeof item !== 'string')) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}
function sign(secret: string, data: string): string {
  return createHmac('sha512', secret).update(data, 'utf8').digest('hex');
}
function formatVnpayDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return fields.year + fields.month + fields.day + fields.hour + fields.minute + fields.second;
}

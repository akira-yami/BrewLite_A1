import { createHmac } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';

export interface VnpayIpnParams {
  gatewayReference: string;
  amount: bigint;
  responseCode: string;
  transactionStatus: string;
  transactionNo?: string;
  tmnCode?: string;
}

export interface VnpayIpnResponse {
  RspCode: string;
  Message: string;
}

export class VnpayTestHelper {
  constructor(
    private readonly apiUrl: string,
    private readonly hashSecret: string,
    private readonly tmnCode: string,
  ) {}

  computeSignature(params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort();
    const query = new URLSearchParams();
    for (const key of sortedKeys) {
      query.append(key, params[key]);
    }
    const data = query.toString();
    return createHmac('sha512', this.hashSecret)
      .update(data, 'utf8')
      .digest('hex');
  }

  async simulateIpn(
    request: APIRequestContext,
    params: VnpayIpnParams,
  ): Promise<VnpayIpnResponse> {
    const ipnParams: Record<string, string> = {
      vnp_TxnRef: params.gatewayReference,
      vnp_Amount: (params.amount * BigInt(100)).toString(),
      vnp_TmnCode: params.tmnCode ?? this.tmnCode,
      vnp_ResponseCode: params.responseCode,
      vnp_TransactionStatus: params.transactionStatus,
      vnp_TransactionNo: params.transactionNo ?? `VNPAY_${Date.now()}`,
      vnp_BankCode: 'NCB',
      vnp_PayDate: this.formatVnpayDate(new Date()),
      vnp_OrderInfo: 'BrewLite order test',
      vnp_CurrCode: 'VND',
    };

    const signature = this.computeSignature(ipnParams);
    ipnParams.vnp_SecureHash = signature;

    const response = await request.post(
      `${this.apiUrl}/payments/test/vnpay/simulate-ipn`,
      { params: ipnParams },
    );

    return response.json();
  }

  verifyPaymentUrl(paymentUrl: string): boolean {
    try {
      const url = new URL(paymentUrl);
      const params: Record<string, string> = {};
      const secureHash = url.searchParams.get('vnp_SecureHash');
      
      if (!secureHash) return false;

      for (const [key, value] of url.searchParams.entries()) {
        if (key !== 'vnp_SecureHash') {
          params[key] = value;
        }
      }

      const expectedSignature = this.computeSignature(params);
      return secureHash === expectedSignature;
    } catch (error) {
      return false;
    }
  }

  private formatVnpayDate(date: Date): string {
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

    const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));

    return (
      values.year +
      values.month +
      values.day +
      values.hour +
      values.minute +
      values.second
    );
  }
}
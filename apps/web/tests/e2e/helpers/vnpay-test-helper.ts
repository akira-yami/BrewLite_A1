import { createHmac } from 'node:crypto';
import type { APIRequestContext, Response as PlaywrightResponse } from '@playwright/test';

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

/**
 * POST /payments returns a signed VNPay URL rather than internal IDs.
 * Derive the reference and amount from that URL for isolated E2E assertions;
 * this helper never alters the real API contract.
 */
export function enrichVnpayPaymentResponse(
  body: { data: { paymentUrl?: string; [key: string]: unknown } },
  response: PlaywrightResponse,
) {
  const paymentUrl = body?.data?.paymentUrl;
  if (!paymentUrl) {
    throw new Error('Expected a signed VNPay payment URL in POST /payments response');
  }
  const url = new URL(paymentUrl);
  const gatewayReference = url.searchParams.get('vnp_TxnRef');
  const rawAmount = url.searchParams.get('vnp_Amount');
  const requestBody: unknown = response.request().postDataJSON();
  const orderId =
    typeof requestBody === 'object' && requestBody !== null && 'orderId' in requestBody
      ? (requestBody as { orderId: unknown }).orderId
      : undefined;

  if (!gatewayReference || !rawAmount || !/^[0-9]+$/.test(rawAmount) || typeof orderId !== 'string') {
    throw new Error('Signed VNPay URL or payment request is missing required transaction data');
  }
  const amount = BigInt(rawAmount) / 100n;
  if (BigInt(rawAmount) % 100n !== 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('VNPay amount is invalid or exceeds the safe integer range');
  }

  return {
    ...body,
    data: { ...body.data, paymentUrl, gatewayReference, amount: Number(amount), orderId },
  };
}

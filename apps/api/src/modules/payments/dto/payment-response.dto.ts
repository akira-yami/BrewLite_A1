export enum PaymentStatus {
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

/** HTTP response body inside the standard `{ data }` envelope from POST /payments. */
export class PaymentResponseDto {
    success: boolean;
    isRetried: boolean;
    status: PaymentStatus;
    gatewayTransactionId?: string;
    errorCode?: string;
    /** URL redirect cho VNPay — chỉ có khi status = PROCESSING và method = VNPAY */
    paymentUrl?: string;
}

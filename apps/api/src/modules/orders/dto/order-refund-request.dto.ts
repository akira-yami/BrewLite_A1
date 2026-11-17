import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { OrderRefundRequestStatus } from '../../../generated/prisma/client.js';

export class ReviewOrderRefundRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export interface OrderRefundRequestDto {
  status: OrderRefundRequestStatus;
  requestedAt: string;
  decidedAt: string | null;
  rejectionReason: string | null;
  points: number;
}

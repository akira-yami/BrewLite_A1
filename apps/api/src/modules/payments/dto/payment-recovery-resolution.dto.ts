import { IsEnum, IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { PaymentRecoveryDecision } from '../../../generated/prisma/client.js';

export class PaymentRecoveryResolutionDto {
  @IsEnum(PaymentRecoveryDecision)
  decision!: PaymentRecoveryDecision;

  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)
  evidenceReference!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)
  incidentReference!: string;
}

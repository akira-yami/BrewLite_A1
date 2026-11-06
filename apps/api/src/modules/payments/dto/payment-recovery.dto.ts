import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class PaymentRecoveryDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, {
    message: 'incidentReference chỉ nhận mã incident/ticket an toàn.',
  })
  incidentReference!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
  correlationId?: string;
}

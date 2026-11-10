import { IsIn, IsString } from 'class-validator';

export class RedeemLoyaltyDto {
  @IsString()
  @IsIn(['10000', '20000', '50000', '100000'])
  tierId!: string;
}

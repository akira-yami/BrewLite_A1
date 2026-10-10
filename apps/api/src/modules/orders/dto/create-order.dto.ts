import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID()
  productVariantId: string;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  toppingIds?: string[];

  // Percent of the standard recipe. Omitted/null uses the standard recipe;
  // zero explicitly means no sugar/ice and must never be replaced by a default.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  sugarLevel?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  iceLevel?: number | null;
}

// Contract for the future orders controller; prices and userId come from the server.
export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  couponCode?: string;
}

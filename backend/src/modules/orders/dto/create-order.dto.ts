import { IsString, IsNumber, IsNotEmpty, Min } from 'class-validator';

export class CreateOrderItemDto {
  @IsString()
  productId: string;
  @IsNumber({})
  @Min(1)
  quantity: number;
  @IsNumber({})
  @Min(1)
  price: number;
}

export class CreateOrderDto {
  @IsString()
  userId: string;
  @IsNumber({})
  @Min(1)
  amount: number;
  @IsNotEmpty()
  items: CreateOrderItemDto[];
}

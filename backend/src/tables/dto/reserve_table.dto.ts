import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { IsNotProfane } from '../decorator/is_not_profane.decorator';

export class CreateReserveDto {
  @IsNumber({}, { message: 'Capacity bàn phải là số' })
  @Min(1, { message: 'Capacity bàn không được nhỏ hơn 1' })
  capacity: number;

  @IsString()
  @IsOptional() // Field này không bắt buộc
  @IsNotProfane()
  customerName?: string;
}

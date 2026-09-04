import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { IsNotProfane } from '../decorator/is_not_profane.decorator';

export class CreateTableDto {
  @IsString({ message: 'Tên sản phẩm phải là chuỗi' })
  @IsNotProfane()
  @IsOptional()
  code: string;

  @IsNumber({}, { message: 'Capacity bàn phải là số' })
  @Min(1, { message: 'Capacity bàn không được nhỏ hơn 1' })
  restaurant_id: number;

  @IsNumber({}, { message: 'Capacity bàn phải là số' })
  @Min(1, { message: 'Capacity bàn không được nhỏ hơn 1' })
  capacity: number;
}

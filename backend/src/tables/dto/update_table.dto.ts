import { IsString } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { CreateTableDto } from './create_table.dto';
import { IsTableStatusValid } from '../decorator/is_table_status_valid.decorator';

export enum TableStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SEATED = 'SEATED',
  CLEANING = 'CLEANING',
}

export class UpdateTableDto extends PartialType(CreateTableDto) {
  @IsString({ message: 'Tên sản phẩm phải là chuỗi' })
  @IsTableStatusValid()
  status: TableStatus;
}

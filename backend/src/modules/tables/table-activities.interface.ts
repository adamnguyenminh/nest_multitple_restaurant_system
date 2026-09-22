// table-activities.interface.ts
import { CreateTableDto } from './dto/create_table.dto';

export interface ITableActivities {
  reserveTableActivity(dto: CreateTableDto): Promise<any>;
  releaseTableActivity(tableId: number): Promise<any>;
  checkInTableActivity(tableId: number): Promise<any>;
  cleanTableActivity(tableId: number): Promise<any>;
}

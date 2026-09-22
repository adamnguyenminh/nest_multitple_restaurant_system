// table.activities.ts
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TablesService } from './tables.service';
import { ITableActivities } from './table-activities.interface';
import { CreateTableDto } from './dto/create_table.dto';

@Injectable()
export class TableActivities implements ITableActivities {
  constructor(
    private readonly tablesService: TablesService, // Inject ClsService để khởi tạo context cho tiến trình ngầm
    private readonly cls: ClsService,
  ) {}

  // Gọi sang hàm đã có @Transactional của TablesService
  async reserveTableActivity(dto: CreateTableDto) {
    // Kích hoạt ALS Context thủ công.
    // Từ lúc này, @Transactional() bên trong TablesService sẽ hoạt động bình thường.
    return this.cls.run(async () => {
      return await this.tablesService.reserveTableActivity(dto);
    });
  }

  async releaseTableActivity(tableId: number) {
    return this.cls.run(async () => {
      return await this.tablesService.releaseTableActivity(tableId);
    });
  }

  async checkInTableActivity(tableId: number) {
    return this.cls.run(async () => {
      return await this.tablesService.checkInTableActivity(tableId);
    });
  }

  async cleanTableActivity(tableId: number) {
    return this.cls.run(async () => {
      return await this.tablesService.cleanTableActivity(tableId);
    });
  }
}

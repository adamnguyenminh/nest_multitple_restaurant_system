import { Controller, Post, Patch, Param, Body } from '@nestjs/common';
import { TablesService } from './tables.service';
import { TableStatus } from './entities/table.entity';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post('reserve')
  async reserve(
    @Body()
    body: {
      requestId: number | string;
      capacity: number;
      customerName: string;
    },
  ) {
    return this.tablesService.reserveAnyTable(
      body.requestId,
      body.capacity || 2,
      body.customerName || 'Guest',
    );
  }

  @Patch('status/:id')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { shard_id: number; status: TableStatus },
  ) {
    return this.tablesService.updateStatus(+id, body.shard_id, body.status);
  }
}

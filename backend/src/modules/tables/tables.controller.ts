import { Controller, Post, Patch, Param, Body } from '@nestjs/common';
import { TablesService } from './tables.service';
import { CreateReserveDto } from './dto/reserve_table.dto';
import { UpdateTableDto } from './dto/update_table.dto';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post('reserve')
  async reserve(
    @Body()
    CreateReserveDto: CreateReserveDto,
  ) {
    return this.tablesService.reserveAnyTable(CreateReserveDto);
  }

  @Patch('status/:id')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateTableDto: UpdateTableDto,
  ) {
    return this.tablesService.updateStatus(+id, updateTableDto);
  }
}

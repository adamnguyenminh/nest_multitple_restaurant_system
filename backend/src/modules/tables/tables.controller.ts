import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TablesService } from './tables.service';
import { CreateReserveDto } from './dto/reserve_table.dto';
import { UpdateTableDto } from './dto/update_table.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { AuditAndTransformInterceptor } from '../../common/interceptors/audit-and-transform.interceptor';

@Controller('tables')
@UseGuards(RolesGuard)
@UseInterceptors(AuditAndTransformInterceptor)
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
  @Roles('admin', 'manager')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateTableDto: UpdateTableDto,
  ) {
    return this.tablesService.updateStatus(+id, updateTableDto);
  }
}

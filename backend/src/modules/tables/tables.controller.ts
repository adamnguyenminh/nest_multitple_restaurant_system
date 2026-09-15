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
import { Roles } from '../../common/decorator/roles.decorator';
import { AuditAndTransformInterceptor } from '../../common/interceptors/audit-and-transform.interceptor';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('tables')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditAndTransformInterceptor)
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post('reserve')
  async reserve(
    @Body()
    createReserveDto: CreateReserveDto,
  ) {
    return this.tablesService.reserveAnyTable(createReserveDto);
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

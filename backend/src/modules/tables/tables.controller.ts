import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TablesService } from './tables.service';
import { CreateReserveDto } from './dto/reserve_table.dto';
import { UpdateTableDto } from './dto/update_table.dto';
import { Client } from '@temporalio/client';

const TEMPORAL_CLIENT = 'TEMPORAL_CLIENT';

@Controller('tables')
export class TablesController {
  constructor(
    private readonly tablesService: TablesService,
    @Inject(TEMPORAL_CLIENT)
    private readonly temporalClient: Client,
  ) {}

  @Post('reserve')
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted: Đã tiếp nhận xử lý Async
  async reserveTable(@Body() dto: CreateReserveDto) {
    // 1. Tạo Workflow ID duy nhất đại diện cho phiên đặt bàn này
    const workflowId = `reservation-workflow-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 2. Kích hoạt Temporal Workflow (Async Execution)
    const handle = await this.temporalClient.workflow.start(
      'tableReservationWorkflow',
      {
        taskQueue: 'table-reservation-queue', // Tên Queue mà Temporal Worker lắng nghe
        workflowId: workflowId,
        args: [dto], // Truyền DTO vào Workflow
      },
    );

    // 3. Trả về thông tin WorkflowHandle lập tức cho Client
    return {
      success: true,
      message: 'Yêu cầu đặt bàn đã được tiếp nhận và đang xử lý!',
      data: {
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId,
      },
    };
  }
}

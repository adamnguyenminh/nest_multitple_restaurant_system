import {
  Controller,
  Post,
  Param,
  Body,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CreateReserveDto } from './dto/reserve_table.dto';
import { Client } from '@temporalio/client';
import {
  customerCheckedInSignal,
  confirmCleaningSignal,
} from './table-reservation.workflow';

const TEMPORAL_CLIENT = 'TEMPORAL_CLIENT';

@Controller('tables')
export class TablesController {
  constructor(
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

  @Post('check-in/:workflowId')
  async checkInTable(@Param('workflowId') workflowId: string) {
    try {
      // Lấy Handle của Workflow đang đếm ngược 2 phút
      const handle = this.temporalClient.workflow.getHandle(workflowId);

      // BẮN SIGNAL ĐỂ NGẮT TIMER VÀ HOÀN THÀNH WORKFLOW NGAY LẬP TỨC
      await handle.signal(customerCheckedInSignal);

      // Chờ workflow chạy nốt và trả về kết quả return của hàm workflow
      const result = await handle.result();
      return {
        success: true,
        message: 'Check-in thành công!',
        tableId: result.tableId,
      };
    } catch (error) {
      return {
        success: false,
        message:
          'Không tìm thấy bàn đang giữ chỗ hoặc thời gian giữ bàn đã hết hạn!',
      };
    }
  }

  @Post('cleaning/:tableId')
  async cleaningTable(@Param('tableId') tableId: string) {
    // 1. Tạo Workflow ID duy nhất đại diện cho phiên đặt bàn này
    const workflowId = `reservation-workflow-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 2. Kích hoạt Temporal Workflow (Async Execution)
    const handle = await this.temporalClient.workflow.start(
      'tableCleaningWorkflow',
      {
        taskQueue: 'table-reservation-queue', // Tên Queue mà Temporal Worker lắng nghe
        workflowId: workflowId,
        args: [tableId], // Truyền DTO vào Workflow
      },
    );

    // 3. Trả về thông tin WorkflowHandle lập tức cho Client
    return {
      success: true,
      message: 'Yêu cầu cleaning bàn đã được tiếp nhận và đang xử lý!',
      data: {
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId,
      },
    };
  }

  @Post('confirm-cleaning/:workflowId')
  async confirmCleaningTable(@Param('workflowId') workflowId: string) {
    try {
      // Lấy Handle của Workflow đang đếm ngược 2 phút
      const handle = this.temporalClient.workflow.getHandle(workflowId);

      // BẮN SIGNAL ĐỂ NGẮT TIMER VÀ HOÀN THÀNH WORKFLOW NGAY LẬP TỨC
      await handle.signal(confirmCleaningSignal);

      // Chờ workflow chạy nốt và trả về kết quả return của hàm workflow
      const result = await handle.result();

      return {
        success: true,
        message: 'Cleaning thành công!',
        tableId: result.tableId,
      };
    } catch (error) {
      return {
        success: false,
        message:
          'Không tìm thấy bàn đang giữ chỗ hoặc thời gian giữ bàn đã hết hạn!',
      };
    }
  }
}

import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ShardRouterService } from '../database/shard_router.service';
import { Table, TableStatus } from './entities/table.entity';

@Injectable()
export class TablesService {
  constructor(
    private readonly shardRouterService: ShardRouterService,
    @Inject('TABLE_EVENT_SERVICE') private readonly rabbitmqClient: ClientProxy,
  ) {}

  async reserveAnyTable(
    requestIndex: number | string,
    capacity: number,
    customerName: string,
  ) {
    const dataSource =
      this.shardRouterService.getDataSourceBytaSourceByRequestIndex(
        requestIndex,
      );
    const queryRunner = dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      // 1. Khóa và lấy ra 1 bàn AVAILABLE phù hợp gần nhất
      // MYSQL FOR UPDATE SKIP LOCKED sẽ bỏ qua các bàn đang bị Lock bởi Transaction khác
      const table = await queryRunner.manager
        .createQueryBuilder(Table, 'table')
        .setLock('pessimistic_read')
        .setOnLocked('skip_locked')
        .where('table.capacity >= :capacity', { capacity })
        .andWhere('table.status = :status', { status: TableStatus.AVAILABLE })
        .orderBy('table.capacity', 'ASC')
        .getOne();

      if (!table) {
        throw new ConflictException(
          'Hệ thống đang quá tải hoặc không còn bàn trống phù hợp!',
        );
      }

      // 2. Cập nhật trạng thái
      table.status = TableStatus.RESERVED;
      await queryRunner.manager.save(table);

      // Commit transaction
      await queryRunner.commitTransaction();

      // 3. Bắn Event vào RabbitMQ (Async notification)
      const eventPayload = {
        eventId: Date.now(),
        tableId: table.id,
        code: table.code,
        status: table.status,
        customerName,
        timestamp: new Date(),
      };

      this.rabbitmqClient.emit('table_status_changed', eventPayload);

      return {
        success: true,
        message: `Đặt bàn thành công! Mã bàn: ${table.code}`,
        data: table,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Cập nhật trạng thái bàn thủ công (SEATED, CLEANING, AVAILABLE)
   */
  async updateStatus(tableId: number, status: TableStatus) {
    const dataSource =
      this.shardRouterService.getDataSourceByTableIndex(tableId);

    const table = await dataSource
      .getRepository(Table)
      .findOneBy({ id: tableId });
    if (!table) throw new NotFoundException('Không tìm thấy bàn!');

    table.status = status;
    const updatedTable = await dataSource.getRepository(Table).save(table);

    // Bắn Event
    this.rabbitmqClient.emit('table_status_changed', {
      eventId: Date.now(),
      tableId: updatedTable.id,
      code: updatedTable.code,
      status: updatedTable.status,
      timestamp: new Date(),
    });

    return updatedTable;
  }
}

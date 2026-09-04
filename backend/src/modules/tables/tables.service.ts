import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ShardRouterService } from '../../core/database/shard_router.service';
import { Table, TableStatus } from './entities/table.entity';
import { CreateReserveDto } from './dto/reserve_table.dto';
import { TableRepository } from './table.repository';
import { UpdateTableDto } from './dto/update_table.dto';

@Injectable()
export class TablesService {
  constructor(
    private tableRepository: TableRepository,
    private readonly shardRouterService: ShardRouterService,
    @Inject('TABLE_EVENT_SERVICE') private readonly rabbitmqClient: ClientProxy,
  ) {}

  async reserveAnyTable(CreateReserveDto: CreateReserveDto) {
    const dataSource = this.shardRouterService.getDataSourceByShardId(0);
    const queryRunner = dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      let capacity = CreateReserveDto.capacity || 2;
      // 1. Khóa và lấy ra 1 bàn AVAILABLE phù hợp gần nhất
      // MYSQL FOR UPDATE SKIP LOCKED sẽ bỏ qua các bàn đang bị Lock bởi Transaction khác
      const table = await queryRunner.manager
        .createQueryBuilder(Table, 'table')
        .setLock('pessimistic_read')
        .setOnLocked('skip_locked')
        .where('table.restaurant_id = :restaurant_id', { restaurant_id: 1 })
        .where('table.capacity >= :min_capacity', {
          min_capacity: capacity,
        })
        .where('table.capacity <= :max_capacity', {
          max_capacity: capacity + 2,
        })
        .andWhere('table.status = :status', { status: TableStatus.AVAILABLE })
        .orderBy('table.capacity', 'ASC')
        .getOne();

      if (!table) {
        throw new ConflictException('Không còn bàn trống phù hợp!');
      }

      // 2. Cập nhật trạng thái
      table.status = TableStatus.RESERVED;
      await queryRunner.manager.save(table);

      // Commit transaction
      await queryRunner.commitTransaction();

      // 3. Bắn Event vào RabbitMQ (Async notification)
      const eventPayload = {
        restaurant_id: table.restaurantId,
        table: {
          eventId: Date.now(),
          tableId: table.id,
          code: table.code,
          status: table.status,
          customerName: CreateReserveDto.customerName ?? 'Guest',
          timestamp: new Date(),
        },
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
  async updateStatus(tableId: number, updateTableDto: UpdateTableDto) {
    const table = await this.findOne(tableId);
    if (!table) throw new NotFoundException('Không tìm thấy bàn!');

    table.status = updateTableDto.status;
    const updatedTable = await this.tableRepository.save(table);

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

  findAll(): Promise<Table[]> {
    return this.tableRepository.find();
  }

  findOne(id: number): Promise<Table | null> {
    return this.tableRepository.findOneBy({ id });
  }

  async remove(id: number): Promise<void> {
    await this.tableRepository.delete(id);
  }
}

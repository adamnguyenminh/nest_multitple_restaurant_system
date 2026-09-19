import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional'; // Dùng ALS Decorator
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { Table, TableStatus } from './entities/table.entity';
import { OutboxEntity } from '../orders/entities/outbox.entity';
import { ITableActivities } from './table-activities.interface';

@Injectable()
export class TablesService implements ITableActivities {
  constructor(
    // 1. Inject TransactionHost thay vì @InjectRepository
    private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>,
  ) {}

  // ACTIVITY 1: Đặt bàn (Code của bạn đã qua refactor)
  @Transactional() // ALS tự động quản lý Transaction
  async reserveTableActivity(createReserveDto: any) {
    // 2. Lấy Transactional Repository từ txHost (Bảo đảm 100% nằm trong Transaction)
    const txTableRepo = this.txHost.tx.getRepository(Table);
    const txOutboxRepo = this.txHost.tx.getRepository(OutboxEntity);

    const capacity = createReserveDto.capacity || 2;

    // 3. Sử dụng txTableRepo để tạo QueryBuilder
    const table = await txTableRepo
      .createQueryBuilder('table')
      .setLock('pessimistic_write') // Bây giờ setLock sẽ hoạt động hoàn hảo
      .setOnLocked('skip_locked')
      .where('table.restaurant_id = :restaurant_id', { restaurant_id: 1 })
      .andWhere('table.capacity >= :min_capacity', { min_capacity: capacity })
      .andWhere('table.capacity <= :max_capacity', {
        max_capacity: capacity + 2,
      })
      .andWhere('table.status = :status', { status: TableStatus.AVAILABLE })
      .orderBy('table.capacity', 'ASC')
      .getOne();

    if (!table) {
      return { success: false, message: 'Không còn bàn trống phù hợp!' };
    }

    // Cập nhật status sang RESERVED
    table.status = TableStatus.RESERVED;
    await txTableRepo.save(table);

    // Lưu Outbox Event
    const outboxId = crypto.randomUUID();
    const outboxMessage = txOutboxRepo.create({
      id: outboxId,
      aggregateType: 'TABLE',
      aggregateId: table.id.toString(),
      eventType: 'TABLE_RESERVED',
      payload: {
        id: outboxId,
        tableId: table.id,
        code: table.code,
        status: table.status,
        timestamp: new Date(),
      },
    });
    await txOutboxRepo.save(outboxMessage);

    return { success: true, data: table };
  }

  // ACTIVITY 2: Nhả bàn về AVAILABLE sau 2 phút
  @Transactional()
  async releaseTableActivity(tableId: number) {
    const txTableRepo = this.txHost.tx.getRepository(Table);
    const txOutboxRepo = this.txHost.tx.getRepository(OutboxEntity);

    const table = await txTableRepo
      .createQueryBuilder('table')
      .setLock('pessimistic_write')
      .where('table.id = :id', { id: tableId })
      .getOne();

    // Chỉ nhả bàn nếu status vẫn đang là RESERVED (chưa chuyển sang OCCUPIED/CHECKED_IN)
    if (table && table.status === TableStatus.RESERVED) {
      table.status = TableStatus.AVAILABLE;
      await txTableRepo.save(table);

      // Ghi Outbox Event báo bàn đã ngả về AVAILABLE (CDC Debezium sẽ stream đi)
      const outboxId = crypto.randomUUID();
      const outboxMessage = txOutboxRepo.create({
        id: outboxId,
        aggregateType: 'TABLE',
        aggregateId: table.id.toString(),
        eventType: 'TABLE_AUTO_RELEASED',
        payload: {
          id: outboxId,
          tableId: table.id,
          code: table.code,
          status: table.status,
          reason: 'EXPIRED_2_MINUTES',
          timestamp: new Date(),
        },
      });
      await txOutboxRepo.save(outboxMessage);
    }
  }
}

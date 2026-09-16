import { Controller, UseInterceptors, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Transactional } from '@nestjs-cls/transactional';
import { DataSource } from 'typeorm';
import { IdempotentInterceptor } from './interceptors/idempotent.interceptor';
import { InventoryService } from './inventory.service';

@Controller()
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
  ) {}

  @EventPattern('outbox.event.Order')
  @UseInterceptors(IdempotentInterceptor)
  @Transactional()
  async handleOrderCreated(@Payload() data: any) {
    // Lấy dữ liệu đã được Interceptor parse sẵn (nếu có), hoặc fallback về data
    const payload = data?._parsedData || data;

    const eventId = payload?.id || payload?.eventId;
    const items = payload?.items;

    this.logger.log(`[KAFKA CONSUME] Processing Event ID: ${eventId}`);

    if (!Array.isArray(items)) {
      this.logger.error(
        `[INVALID PAYLOAD] 'items' is not a valid array. Received:`,
        payload,
      );
      return;
    }

    // 1. Trừ kho nghiệp vụ
    await this.inventoryService.deductStock(items);

    // 2. Ghi vết Event ID vào database trong CÙNG TRANSACTION với việc trừ kho
    await this.dataSource.query(
      `INSERT INTO processed_events (event_id, consumer_group) VALUES ($1, $2)`,
      [eventId, 'inventory-service-group'],
    );

    this.logger.log(
      `[KAFKA CONSUME SUCCESS] Event ${eventId} processed & saved.`,
    );
  }
}

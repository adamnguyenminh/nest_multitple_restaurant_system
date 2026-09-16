import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { DataSource } from 'typeorm';

@Injectable()
export class IdempotentInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotentInterceptor.name);

  constructor(private readonly dataSource: DataSource) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const rpcContext = context.switchToRpc();
    const rawData = rpcContext.getData();

    // 1. Trích xuất và Parse payload nếu nó bị Debezium bọc dưới dạng JSON String
    let parsedPayload = rawData;

    if (typeof rawData?.payload === 'string') {
      try {
        parsedPayload = JSON.parse(rawData.payload);
      } catch (e) {
        this.logger.error('Failed to parse Debezium payload string', e);
      }
    } else if (typeof rawData === 'string') {
      try {
        parsedPayload = JSON.parse(rawData);
      } catch (e) {}
    }

    // 2. Ghi đè Object đã parse lại vào Context để Controller nhận đúng Object
    if (rpcContext.getData()) {
      Object.assign(rpcContext.getData(), { _parsedData: parsedPayload });
    }

    // 3. Lấy eventId từ payload đã parse
    const eventId = parsedPayload?.id || parsedPayload?.eventId;
    const consumerGroup = 'inventory-service-group';

    if (!eventId) {
      this.logger.warn(
        'Message missing Event ID, passing through without idempotency check.',
      );
      return next.handle();
    }

    // 4. Fast-Read Check xem Event đã được xử lý thành công chưa
    const existingEvents = await this.dataSource.query(
      `SELECT 1 FROM processed_events WHERE event_id = $1 AND consumer_group = $2`,
      [eventId, consumerGroup],
    );

    if (existingEvents.length > 0) {
      this.logger.warn(
        `[DUPLICATE DETECTED] Event ${eventId} already processed. Skipping.`,
      );
      return of(null); // Bỏ qua không chạy controller
    }

    return next.handle();
  }
}

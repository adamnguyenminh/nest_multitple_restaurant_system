// sync.consumer.ts
import { Controller } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { RedisService } from '../redis/redis.service';

export interface TableStatusPayload {
  tableId: number;
  code: string;
  status: string;
  shardId: number;
  timestamp: string;
}

@Controller()
export class SyncConsumer {
  constructor(private readonly redisService: RedisService) {}

  @EventPattern('table_status_changed')
  async handleTableStatusChanged(
    @Payload() data: TableStatusPayload | any,
    @Ctx() context: any,
  ) {
    // 1. Cast kiểu chuẩn RmqContext
    const rmqContext = context as RmqContext;
    const channel = rmqContext.getChannelRef();
    const originalMsg = rmqContext.getMessage();

    try {
      console.log(
        `📥 [RabbitMQ Consumer] Nhận event bàn ${data.code}: ${data.status}`,
      );

      // 1. Bắn event qua Redis Channel có tên 'REALTIME_TABLE_UPDATE'
      await this.redisService.publish('REALTIME_TABLE_UPDATE', data);

      // 2. Acknowledge tin nhắn xử lý thành công
      channel.ack(originalMsg);
    } catch (error) {
      console.error('❌ Lỗi xử lý RabbitMQ Consumer:', error);

      // Báo nack để RabbitMQ Requeue lại message nếu cần
      channel.nack(originalMsg, false, false);
    }
  }
}

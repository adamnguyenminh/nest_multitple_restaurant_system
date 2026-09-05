import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { SyncConsumer } from './sync.consumer';
import { RealtimeController } from './realtime.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [SyncConsumer, RealtimeController],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class WebsocketModule {}

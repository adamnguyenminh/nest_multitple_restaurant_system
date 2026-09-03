// import { Module } from '@nestjs/common';

// @Module({})
// export class WebsocketModule {}

// realtime.module.ts
import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { SyncConsumer } from './sync.consumer';
import { RealtimeController } from './realtime.controller';
// import { RedisService } from '../redis/redis.service';

@Module({
  controllers: [SyncConsumer, RealtimeController],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class WebsocketModule {}

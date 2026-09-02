import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { TablesModule } from './tables/tables.module';
import { QueueModule } from './queue/queue.module';
import { WebsocketModule } from './websocket/websocket.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    TablesModule,
    QueueModule,
    WebsocketModule,
    RedisModule,
  ],
})
export class AppModule {}

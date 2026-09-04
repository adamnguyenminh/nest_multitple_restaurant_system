import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './core/database/database.module';
import { TablesModule } from './modules/tables/tables.module';
import { QueueModule } from './core/queue/queue.module';
import { WebsocketModule } from './core/websocket/websocket.module';
import { RedisModule } from './core/redis/redis.module';
import { CorrelationIdMiddleware } from './common/middlewares/correlation-id.middleware';

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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware) // Đăng ký Middleware toàn cục cho mọi Route[cite: 1]
      .forRoutes('*');
  }
}

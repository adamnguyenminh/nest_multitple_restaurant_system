import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { JwtModule } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { DatabaseModule } from './core/database/database.module';
import { TablesModule } from './modules/tables/tables.module';
import { QueueModule } from './core/queue/queue.module';
import { WebsocketModule } from './core/websocket/websocket.module';
import { RedisModule } from './core/redis/redis.module';
import { CorrelationIdMiddleware } from './common/middlewares/correlation-id.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'), // Tự động sinh file Schema
      sortSchema: true,
      playground: true, // Bật GraphQL Playground để test query
      // BẮT BUỘC: Phải có dòng này để chuyển req từ Express sang GraphQL context[cite: 2]
      context: ({ req, res }: { req: Request; res: Response }) => ({
        req,
        res,
      }),
    }),
    DatabaseModule.forRoot(), // Khởi tạo toàn bộ Shards
    TablesModule,
    QueueModule,
    WebsocketModule,
    RedisModule,
    AuthModule,
    JwtModule.register({}),
    UsersModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware) // Đăng ký Middleware toàn cục cho mọi Route[cite: 1]
      .forRoutes('*');
  }
}

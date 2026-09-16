import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapterService } from './core/redis/redis_io.adapter.service';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Tự động loại bỏ các field không được khai báo trong DTO (chống Mass Assignment)
      forbidNonWhitelisted: true, // Thăng cấp: Báo lỗi Bad Request nếu client gửi field thừa
      transform: true, // Tự động convert kiểu dữ liệu sang instance của DTO class (ví dụ: query string "123" -> number 123)
    }),
  );

  // Kích hoạt Adapter cho Worker
  const redisIoAdapter = new RedisIoAdapterService(app);
  await redisIoAdapter.connectToRedis();
  // Đăng ký WebSocket Adapter tại HTTP Server
  app.useWebSocketAdapter(redisIoAdapter);

  // 2. Kết nối Kafka Microservice với cấu hình Session / Heartbeat tối ưu
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'nestjs-consumer-server',
        brokers: ['localhost:9092'],
        // Tăng retry & connection timeout để tránh rớt socket
        connectionTimeout: 10000,
        requestTimeout: 30000,
      },
      consumer: {
        groupId: 'inventory-service-group', // Đảm bảo groupId đồng nhất
        // Tăng Session Timeout (Thời gian chờ tối đa nếu mất Heartbeat)
        sessionTimeout: 30000,
        // Thời gian gửi Heartbeat
        heartbeatInterval: 3000,
        // Tăng tối đa thời gian xử lý 1 batch/message trước khi bị coi là dead
        maxPollInterval: 60000,
        allowAutoTopicCreation: true,
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000);
  console.log('Gateway is running on http://localhost:3000');
}
bootstrap();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapterService } from './core/redis/redis_io.adapter.service';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Đăng ký cho toàn bộ app
  app.useGlobalFilters(new AllExceptionsFilter());

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

  await app.listen(process.env.PORT ?? 3000);
  console.log('Gateway is running on http://localhost:3000');
}
bootstrap();

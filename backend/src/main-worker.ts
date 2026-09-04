import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { RedisIoAdapterService } from './core/redis/redis_io.adapter.service';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [process.env.RABBITMQ_URI || 'amqp://localhost:5672'],
        queue: 'table_events_queue',
        noAck: false, // Bắt buộc Manual ACK/NACK
        prefetchCount: 100,
        queueOptions: {
          durable: true,
        },
      },
    },
  );

  // Kích hoạt Adapter cho Worker
  const redisIoAdapter = new RedisIoAdapterService(app);
  await redisIoAdapter.connectToRedis();

  await app.listen();
  console.log(
    '👷 [WORKER] Table Event Consumer Worker is listening to RabbitMQ...',
  );
}
bootstrap().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});
